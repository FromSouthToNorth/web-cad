import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(currentDir, '..', 'fixtures', 'empty.dxf')
const benchOutDir = path.resolve(currentDir, '..', '..', 'bench', 'out')
const screenshotName = 'mtext-draw-accuracy'

/**
 * The Chinese string typed into the MTEXT editor. It is deliberately a plain
 * four-character word: every glyph is made of several disjoint strokes, which
 * is what the connected-component criterion below relies on.
 */
const CHINESE_TEXT = '中文测试'

/** Text box picked on the canvas, in CSS pixels. */
const BOX_WIDTH = 200
const BOX_HEIGHT = 30

/** Margin added around the box before measuring ink. */
const REGION_MARGIN = 6

/**
 * Height of the analysed band.
 *
 * The MTEXT command derives the text height from the current text style, else
 * from the picked box height (see `修复契约.md` D1), so this band is sized from
 * {@link BOX_HEIGHT} plus slack for the glyph bounding box. It must cover the
 * first line and its line advance.
 */
const LINE_BAND_HEIGHT = 50

/**
 * Where the text box starts: 30% into the canvas, which keeps the region
 * clear of the UCS icon in the lower-left corner and of the command line at
 * the bottom - both would otherwise contribute ink of their own.
 */
const BOX_ORIGIN_X_RATIO = 0.3
const BOX_ORIGIN_Y_RATIO = 0.3

/** Ink/background luma delta used by the in-test pixel probe. */
const INK_DELTA = 60

/**
 * Headless machines have no GPU. Without these flags Chromium may refuse to
 * create a WebGL context, the drawing canvas stays empty, and every pixel
 * criterion below would be measuring the DOM overlays (command line, UCS
 * icon) instead of the rendered text.
 */
test.use({
  launchOptions: {
    args: [
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--enable-webgl'
    ]
  }
})

// ── page-side shapes ─────────────────────────────────────────────────

interface MTextEntity {
  dxfTypeName?: string
  contents?: string
  location?: { x: number; y: number }
  height?: number
  width?: number
}

interface TextStyleRecord {
  fileName?: string
  bigFontFileName?: string
}

interface DocManagerLike {
  instance?: {
    curDocument?: {
      database?: {
        tables: {
          textStyleTable: {
            getAt: (name: string) => TextStyleRecord | undefined
          }
          blockTable: {
            modelSpace: { newIterator: () => Iterable<MTextEntity> }
          }
        }
      }
    }
  }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface PixelVerdict {
  imageSize: { width: number; height: number }
  inkPixels: number
  inkRatio: number
  inkBox: Rect | null
  paddingPx: { left: number; top: number; right: number; bottom: number }
  glyphComponents: number
  largestComponentFillRatio: number
}

// ── page helpers ─────────────────────────────────────────────────────

/**
 * Reads every entity in model space through the document manager the example
 * app publishes on `window` in dev builds (`App.vue` assigns `AcApDocManager`
 * when `import.meta.env.DEV`). This is the "did it land in the database?"
 * assertion - canvas pixels below only prove that *something* was drawn.
 */
async function readModelSpaceEntities(page: Page): Promise<MTextEntity[]> {
  return page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager?.instance
    const modelSpace =
      manager?.curDocument?.database?.tables.blockTable.modelSpace
    if (!modelSpace) return []
    const entities: MTextEntity[] = []
    for (const entity of modelSpace.newIterator()) {
      entities.push({
        dxfTypeName: entity.dxfTypeName,
        contents: entity.contents,
        location: entity.location
          ? { x: entity.location.x, y: entity.location.y }
          : undefined,
        height: entity.height,
        width: entity.width
      })
    }
    return entities
  })
}

/**
 * Points the Standard text style at `hztxt`, the SHX font `App.vue` caches
 * from `public/fonts/hztxt.shx` when the viewer is created.
 *
 * The stock drawing names a Windows-only system font (SimKai), so without
 * this step the glyph shapes come from whatever CJK font the host happens to
 * have - or from nothing at all on a bare CI image. `hztxt.shx` ships inside
 * this repository, so the SHX path is offline and identical everywhere.
 *
 * Returns whether the style really ended up on the offline font.
 */
async function useOfflineTextFont(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager?.instance
    const record =
      manager?.curDocument?.database?.tables.textStyleTable.getAt('Standard')
    if (!record) return false
    record.fileName = 'hztxt'
    record.bigFontFileName = 'hztxt'
    return record.fileName === 'hztxt'
  })
}

/**
 * Opens the fixture with deterministic framing and waits for the shell.
 *
 * The screenshot is measured through `window.AcApDocManager`, which only
 * exists in dev builds - i.e. under the Playwright web server, which runs
 * `vite dev`.
 */
async function openEmptyDrawing(page: Page) {
  await page.goto('/')
  await uploadFixture(page, fixturePath, {
    accessMode: 'Write',
    initialView: 'Extents'
  })
  await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
    timeout: 30000
  })
  await expect(page.locator('.antd-ribbon-button').first()).toBeVisible({
    timeout: 30000
  })
  // DXF conversion, font caching and the batched renderer need a beat.
  await page.waitForTimeout(2500)
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { AcApDocManager?: unknown })
          .AcApDocManager !== 'undefined'
    ),
    'window.AcApDocManager is missing: the e2e server must run a dev build'
  ).toBe(true)
}

/** Opens the fixture and switches the text style to the offline SHX font. */
async function preparePage(page: Page) {
  await openEmptyDrawing(page)
  return useOfflineTextFont(page)
}

// ── user path ────────────────────────────────────────────────────────

/**
 * Resolves the canvas and the rectangle that will hold the first text line.
 */
async function textRegionOf(
  page: Page
): Promise<{ canvas: Locator; p1: { x: number; y: number }; region: Rect }> {
  const canvas = page.locator('.ml-cad-container canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas bounding box is unavailable')

  const p1 = {
    x: box.x + box.width * BOX_ORIGIN_X_RATIO,
    y: box.y + box.height * BOX_ORIGIN_Y_RATIO
  }
  return {
    canvas,
    p1,
    region: {
      x: Math.round(p1.x - box.x) - REGION_MARGIN,
      y: Math.round(p1.y - box.y) - REGION_MARGIN,
      width: BOX_WIDTH + REGION_MARGIN * 2,
      height: LINE_BAND_HEIGHT + REGION_MARGIN * 2
    }
  }
}

/** Clicks the ribbon Text button (「文字」/Text) and waits for its prompt. */
async function clickTextRibbonButton(page: Page) {
  // The button carries its keytip as `aria-keyshortcuts`, which keeps the
  // selector locale independent: the label is 「文字」 in zh-CN and
  // "Multiline Text" in the English locale the upload helper pins.
  const textButton = page.locator('button[aria-keyshortcuts="Alt+T"]').first()
  await expect(textButton).toBeVisible({ timeout: 15000 })
  await textButton.click()

  await expect(page.locator('.ml-cli-prompt')).toContainText('first corner', {
    timeout: 15000
  })
}

/** Picks the two box corners the MTEXT command prompts for. */
async function pickBoxCorners(page: Page, p1: { x: number; y: number }) {
  const p2 = { x: p1.x + BOX_WIDTH, y: p1.y + BOX_HEIGHT }
  for (const point of [p1, p2]) {
    await page.mouse.move(point.x, point.y, { steps: 4 })
    await page.waitForTimeout(80)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(250)
  }

  // The hidden IME textarea is the signal that the box was accepted and the
  // editor opened. In Write mode the shell hides the input box's built-in
  // toolbar (`AcEdMTextEditor.setDefaultToolbarEnabled(false)` in
  // `useAntdCadShell.ts`) and renders its own contextual ribbon instead, so
  // the toolbar element itself is present but not visible.
  await expect(page.locator('body > textarea')).toHaveCount(1, {
    timeout: 15000
  })
}

/**
 * Types the Chinese string into the open editor and closes it. Closing the
 * editor is what commits the entity: `AcApMTextCmd` appends it to model space
 * once the editor promise resolves.
 */
async function typeAndCommitChineseMText(page: Page) {
  // Typing goes through the editor's hidden IME textarea. `insertText` is
  // what an IME commit produces and, unlike `keyboard.type`, it also works
  // for characters that are not on the physical keyboard layout.
  await page.keyboard.insertText(CHINESE_TEXT)
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')

  await expect
    .poll(
      async () =>
        (await readModelSpaceEntities(page)).filter(
          entity => entity.dxfTypeName === 'MTEXT'
        ).length,
      { timeout: 15000, message: 'the MTEXT entity was never committed' }
    )
    .toBe(1)

  const [mtext] = (await readModelSpaceEntities(page)).filter(
    entity => entity.dxfTypeName === 'MTEXT'
  )
  return mtext
}

// ── pixel probe ──────────────────────────────────────────────────────

/**
 * Measures the text region of a canvas screenshot: ink coverage, ink
 * bounding-box padding, and 8-connected component count. Mirrors the criteria
 * of `bench/verify-text-pixels.cjs`, which owns the full report; this copy
 * keeps the e2e assertion self-contained (no child process, no second
 * browser).
 */
async function analyzeCanvasRegion(
  page: Page,
  canvasPng: Buffer,
  region: Rect
): Promise<PixelVerdict> {
  return page.evaluate(
    async ({ base64, rect, inkDelta }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()

      const probe = document.createElement('canvas')
      probe.width = image.naturalWidth
      probe.height = image.naturalHeight
      const ctx = probe.getContext('2d')
      if (!ctx) throw new Error('Failed to create 2d context for the probe')
      ctx.drawImage(image, 0, 0)

      const x0 = Math.max(0, Math.round(rect.x))
      const y0 = Math.max(0, Math.round(rect.y))
      const x1 = Math.min(probe.width, Math.round(rect.x + rect.width))
      const y1 = Math.min(probe.height, Math.round(rect.y + rect.height))
      const width = x1 - x0
      const height = y1 - y0
      const { data } = ctx.getImageData(x0, y0, width, height)

      const lumas = new Float64Array(width * height)
      let opaque = 0
      for (let i = 0; i < lumas.length; i++) {
        const index = i * 4
        lumas[i] =
          0.299 * data[index] +
          0.587 * data[index + 1] +
          0.114 * data[index + 2]
        if (data[index + 3] >= 128) opaque++
      }
      // Median luma is the region background; the region is dominated by the
      // canvas, which keeps the probe working on dark and light themes.
      const background = Float64Array.from(lumas).sort()[lumas.length >> 1]
      const transparentBackground = opaque < lumas.length / 2

      const ink = new Uint8Array(width * height)
      let inkPixels = 0
      for (let i = 0; i < lumas.length; i++) {
        const isInk = transparentBackground
          ? data[i * 4 + 3] >= 128
          : Math.abs(lumas[i] - background) >= inkDelta
        if (isInk) {
          ink[i] = 1
          inkPixels++
        }
      }

      let boxLeft = width
      let boxTop = height
      let boxRight = -1
      let boxBottom = -1

      const labels = new Int32Array(width * height).fill(-1)
      const stack = new Int32Array(width * height)
      const components: Array<{ area: number; boxArea: number }> = []
      for (let start = 0; start < ink.length; start++) {
        if (!ink[start] || labels[start] !== -1) continue
        const id = components.length
        let top = 0
        stack[top++] = start
        labels[start] = id
        let area = 0
        let minX = width
        let minY = height
        let maxX = -1
        let maxY = -1
        while (top > 0) {
          const index = stack[--top]
          const cy = Math.floor(index / width)
          const cx = index - cy * width
          area++
          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy
          if (cx < boxLeft) boxLeft = cx
          if (cx > boxRight) boxRight = cx
          if (cy < boxTop) boxTop = cy
          if (cy > boxBottom) boxBottom = cy
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const ny = cy + dy
              const nx = cx + dx
              if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue
              const neighbour = ny * width + nx
              if (!ink[neighbour] || labels[neighbour] !== -1) continue
              labels[neighbour] = id
              stack[top++] = neighbour
            }
          }
        }
        components.push({
          area,
          boxArea: (maxX - minX + 1) * (maxY - minY + 1)
        })
      }

      const hasInk = boxRight >= 0
      const largest = components.reduce(
        (best, current) => (current.area > best.area ? current : best),
        { area: 0, boxArea: 1 }
      )

      return {
        imageSize: { width: probe.width, height: probe.height },
        inkPixels,
        inkRatio: inkPixels / (width * height),
        inkBox: hasInk
          ? {
              x: x0 + boxLeft,
              y: y0 + boxTop,
              width: boxRight - boxLeft + 1,
              height: boxBottom - boxTop + 1
            }
          : null,
        paddingPx: {
          left: hasInk ? boxLeft : 0,
          top: hasInk ? boxTop : 0,
          right: hasInk ? width - 1 - boxRight : 0,
          bottom: hasInk ? height - 1 - boxBottom : 0
        },
        glyphComponents: components.filter(c => c.area >= 4).length,
        largestComponentFillRatio: largest.area / largest.boxArea
      }
    },
    { base64: canvasPng.toString('base64'), rect: region, inkDelta: INK_DELTA }
  )
}

/**
 * Screenshots the canvas until the text region contains ink.
 *
 * The WebGL canvas only repaints when the renderer runs, so a screenshot
 * taken immediately after the command can still show the previous frame.
 * Returns the screenshot and the measurements of the frame that had ink.
 */
async function waitForInkInRegion(page: Page, canvas: Locator, region: Rect) {
  let canvasPng = await canvas.screenshot()
  let verdict = await analyzeCanvasRegion(page, canvasPng, region)
  await expect
    .poll(
      async () => {
        canvasPng = await canvas.screenshot()
        verdict = await analyzeCanvasRegion(page, canvasPng, region)
        return verdict.inkPixels
      },
      {
        timeout: 30000,
        message: 'the committed text never appeared in the canvas region'
      }
    )
    .toBeGreaterThan(0)
  return { canvasPng, verdict }
}

// ── tests ────────────────────────────────────────────────────────────

/**
 * End-to-end regression for the Chinese text drawing path:
 * ribbon 「文字」/Text -> pick the text box -> type Chinese -> close.
 *
 * This one asserts the database side only, so it stays valid on hosts whose
 * font situation differs; the pixel judgement lives in the tests below.
 */
test('ribbon Text tool commits the typed Chinese string as an MTEXT entity', async ({
  page
}) => {
  await preparePage(page)
  const { p1, canvas } = await textRegionOf(page)
  await clickTextRibbonButton(page)
  await pickBoxCorners(page, p1)
  const mtext = await typeAndCommitChineseMText(page)

  expect(canvas, 'canvas locator is unusable').toBeTruthy()
  expect(mtext, 'no MTEXT entity reached model space').toBeTruthy()
  expect(mtext.contents).toContain(CHINESE_TEXT)
  // Top-left attached text is created at the first corner that was picked.
  expect(mtext.height).toBeGreaterThan(0)
  expect(mtext.width).toBeGreaterThan(0)
})

/**
 * Pixel judgement of the rendered glyphs. Skipped (with a reason) when the
 * offline SHX font cannot be selected, because then the glyph shapes depend
 * on whatever CJK font the host provides and the thresholds below would
 * measure the environment instead of the viewer.
 */
test('rendered Chinese MTEXT passes the ink / glyph-component criteria', async ({
  page
}) => {
  const offlineFontApplied = await preparePage(page)
  test.skip(
    !offlineFontApplied,
    'offline hztxt SHX font could not be forced onto the Standard text style'
  )

  const { canvas, p1, region } = await textRegionOf(page)
  await clickTextRibbonButton(page)
  await pickBoxCorners(page, p1)
  const mtext = await typeAndCommitChineseMText(page)
  const { canvasPng, verdict } = await waitForInkInRegion(page, canvas, region)

  // Persist the screenshot next to the bench report *before* asserting, so a
  // failing run still leaves the artefact for
  // `bench/verify-text-pixels.cjs --region=... <png>` and for a baseline diff.
  fs.mkdirSync(benchOutDir, { recursive: true })
  const screenshotPath = path.join(benchOutDir, `${screenshotName}.png`)
  fs.writeFileSync(screenshotPath, canvasPng)
  fs.writeFileSync(
    `${screenshotPath}.region.json`,
    `${JSON.stringify(
      {
        label: `MTEXT "${CHINESE_TEXT}" drawn through the ribbon Text tool`,
        region,
        text: CHINESE_TEXT,
        contents: mtext.contents,
        imageSize: verdict.imageSize
      },
      null,
      2
    )}\n`
  )

  expect(
    verdict.inkRatio >= 0.01 && verdict.inkRatio <= 0.6,
    `ink ratio ${verdict.inkRatio.toFixed(4)} outside 0.01..0.60 ` +
      `(blank / unrendered, or a solid block): ${JSON.stringify(verdict)}`
  ).toBe(true)
  expect(
    verdict.inkBox,
    `no ink found in the text region: ${JSON.stringify(verdict)}`
  ).not.toBeNull()
  const padding = verdict.paddingPx
  expect(
    Math.min(padding.left, padding.top, padding.right, padding.bottom),
    `glyphs touch the region border (clipped or offset): ${JSON.stringify(
      verdict
    )}`
  ).toBeGreaterThanOrEqual(1)
  expect(
    verdict.glyphComponents,
    `too few disjoint glyph parts - font fallback to a solid box? ${JSON.stringify(
      verdict
    )}`
  ).toBeGreaterThanOrEqual(3)
  expect(
    verdict.largestComponentFillRatio,
    `largest component fills its bbox like a solid block: ${JSON.stringify(
      verdict
    )}`
  ).toBeLessThan(0.85)
})

/**
 * Causal control for the pixel assertions above: the measured region must be
 * empty before the command runs and inked afterwards. Without this, ink from
 * the UCS icon, the command line or a leftover frame could satisfy them.
 */
test('the text region is blank before the command and inked after it', async ({
  page
}) => {
  const offlineFontApplied = await preparePage(page)
  test.skip(
    !offlineFontApplied,
    'offline hztxt SHX font could not be forced onto the Standard text style'
  )

  const { canvas, p1, region } = await textRegionOf(page)
  const before = await analyzeCanvasRegion(
    page,
    await canvas.screenshot(),
    region
  )
  expect(
    before.inkPixels,
    `the text region is not empty before drawing: ${JSON.stringify(before)}`
  ).toBe(0)

  await clickTextRibbonButton(page)
  await pickBoxCorners(page, p1)
  await typeAndCommitChineseMText(page)

  const { verdict } = await waitForInkInRegion(page, canvas, region)
  expect(
    verdict.inkPixels,
    `no ink appeared after committing the text: ${JSON.stringify(verdict)}`
  ).toBeGreaterThan(100)
})
