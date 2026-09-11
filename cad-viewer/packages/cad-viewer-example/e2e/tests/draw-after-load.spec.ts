import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line.dxf'
)

/**
 * Counts non-background canvas pixels. Used as a coarse signal that newly
 * committed linework is actually rendered, not only present in the scene graph.
 *
 * @param region - Optional canvas-relative rectangle. Measuring a region instead
 *   of the whole image is what makes the assertion meaningful: a whole-image ink
 *   gain passes even when the linework is drawn in the wrong place, because the
 *   fixture's own linework plus anti-aliasing noise is enough to clear the bar.
 */
async function countNonBackgroundPixels(
  page: Page,
  region?: { x: number; y: number; width: number; height: number }
) {
  const canvas = page.locator('.ml-cad-container canvas').first()
  const pngBase64 = (await canvas.screenshot()).toString('base64')

  return page.evaluate(
    async ({ imageBase64, rect }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${imageBase64}`
      await image.decode()

      const probe = document.createElement('canvas')
      probe.width = image.naturalWidth
      probe.height = image.naturalHeight
      const ctx = probe.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to create 2d context for screenshot probe')
      }

      ctx.drawImage(image, 0, 0)
      const x0 = rect ? Math.max(0, Math.round(rect.x)) : 0
      const y0 = rect ? Math.max(0, Math.round(rect.y)) : 0
      const width = rect
        ? Math.min(probe.width - x0, Math.round(rect.width))
        : probe.width
      const height = rect
        ? Math.min(probe.height - y0, Math.round(rect.height))
        : probe.height
      if (width <= 0 || height <= 0) return 0

      const { data } = ctx.getImageData(x0, y0, width, height)

      let count = 0
      // Step by 4 bytes, not 8: the previous stride sampled a sub-grid, which
      // hid thin one-pixel linework.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a < 200) continue
        if (r + g + b > 60) count++
      }
      return count
    },
    { imageBase64: pngBase64, rect: region ?? null }
  )
}

/**
 * Regression for https://github.com/mlightcad/cad-viewer/issues/286
 *
 * Entities committed after the initial load must render without requiring a
 * camera change (pan/resize) to refresh the batched renderer.
 */
test('drawn lines appear immediately without panning the view', async ({
  page
}) => {
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible({
    timeout: 30000
  })
  await page.waitForTimeout(1500)

  const canvas = page.locator('.ml-cad-container canvas').first()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Canvas bounding box is unavailable')
  }

  // The polyline is clicked across this band; measure ink there only, so a
  // misplaced line cannot satisfy the assertion with unrelated linework.
  const band = {
    x: box.width * 0.25,
    y: box.height * 0.35,
    width: box.width * 0.6,
    height: box.height * 0.3
  }

  const beforeDraw = await countNonBackgroundPixels(page, band)

  const commandInput = page.getByRole('textbox', { name: 'Type command' })
  await commandInput.click()
  await commandInput.fill('line')
  await commandInput.press('Enter')
  await page.waitForTimeout(300)

  const clickPoint = async (xRatio: number, yRatio: number) => {
    await page.mouse.click(
      box.x + box.width * xRatio,
      box.y + box.height * yRatio
    )
    await page.waitForTimeout(200)
  }

  await clickPoint(0.35, 0.55)
  await clickPoint(0.45, 0.45)
  await clickPoint(0.55, 0.55)
  await clickPoint(0.65, 0.45)
  await clickPoint(0.75, 0.55)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)

  const afterDrawNoPan = await countNonBackgroundPixels(page, band)
  const gainWithoutPan = afterDrawNoPan - beforeDraw

  expect(
    gainWithoutPan,
    `no new ink inside the drawn band (before ${beforeDraw}, after ${afterDrawNoPan})`
  ).toBeGreaterThan(1000)

  // Causal control: the band must be measurably inked because of the new
  // polyline, and the measurement must actually have observed the change.
  expect(afterDrawNoPan).toBeGreaterThan(beforeDraw)
})
