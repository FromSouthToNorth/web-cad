import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page,test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line-layers.dxf'
)

const LAYER_SELECT = '.antd-layer-select'
const SELECTION_ITEM = '.ant-select-selection-item'
const CONTEXT_MENU = '.ml-layerctx-menu'

/**
 * The fixture line sits on layer WALLS; CLAYER defaults to layer '0'.
 * A third layer 'ROADS' exists so the test can move the entity to it.
 */
async function loadFixtureLine(page: Page) {
  await page.goto('/')
  await uploadFixture(page, fixturePath, {
    accessMode: 'Write',
    initialView: 'Extents'
  })
}

async function canvasBox(page: Page) {
  const canvas = page.locator('.ml-cad-container canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas bounding box is null')
  return box
}

/**
 * Picks the fixture line via a right-click on the canvas center. Polls like
 * the layerctx spec: the layer context menu opens only once the pick hits the
 * (eventually rendered) line, and that is our signal the pick succeeded.
 * Each click gets its own wait window so a slow-opening menu (under load)
 * is not re-clicked and closed by the next poll iteration.
 */
async function pickLine(page: Page) {
  const box = await canvasBox(page)
  await expect
    .poll(
      async () => {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
          button: 'right'
        })
        const menu = page.locator(CONTEXT_MENU)
        let opened = false
        for (let i = 0; i < 20; i++) {
          if ((await menu.count()) > 0) {
            opened = true
            break
          }
          await page.waitForTimeout(150)
        }
        if (opened) {
          await page.keyboard.press('Escape')
          await menu
            .waitFor({ state: 'detached', timeout: 3_000 })
            .catch(() => {})
        }
        return opened
      },
      { timeout: 60_000 }
    )
    .toBe(true)
}

test('特性工具栏图层下拉同步选中实体的图层并可移动到其它图层', async ({
  page
}) => {
  await loadFixtureLine(page)

  // No selection → the select mirrors CLAYER ('0').
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0', { timeout: 30_000 })

  // Selecting the line must sync the select to the entity's layer (WALLS).
  await pickLine(page)
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('WALLS', { timeout: 30_000 })

  // Changing the layer applies to the selected entity, not CLAYER.
  await page.locator(LAYER_SELECT).click()
  await page
    .locator('.ant-select-item-option', { hasText: 'ROADS' })
    .click()
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ROADS')

  // Deselect via the context menu: the select falls back to CLAYER ('0'),
  // i.e. the change went to the entity, not the current layer.
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + 15, box.y + 15, { button: 'right' })
  }
  await page.locator('.ml-layerctx-menu__item', { hasText: 'Deselect All' }).click()
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0', { timeout: 30_000 })

  // Re-pick the line with the Select tool and verify the entity kept its
  // new layer. (Right-click picking stays inert right after a menu-driven
  // deselect, so the Select tool is the reliable path here.)
  await page.getByRole('button', { name: 'Select' }).click()
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ROADS', { timeout: 30_000 })
})

test('多选时图层下拉显示最后选中对象的图层', async ({ page }) => {
  const twoLinesFixturePath = path.resolve(
    currentDir,
    '..',
    'fixtures',
    'minimal-lines-two-layers.dxf'
  )
  await page.goto('/')
  await uploadFixture(page, twoLinesFixturePath, {
    accessMode: 'Write',
    initialView: 'Extents'
  })
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0', { timeout: 30_000 })

  // Box-select the whole drawing with the Select tool. Both lines get
  // selected in insertion order (WALLS first, ROADS second); the dropdown
  // must show the layer of the most recently added entity (ROADS), not the
  // first one (WALLS).
  await page.getByRole('button', { name: 'Select' }).click()
  {
    const box = await canvasBox(page)
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, {
      steps: 10
    })
    await page.mouse.up()
  }
  await expect(
    page.locator(`${LAYER_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ROADS', { timeout: 30_000 })
})
