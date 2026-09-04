import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page,test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line.dxf'
)

const LINETYPE_SELECT = '.antd-property-bar-linetype'
const LINEWEIGHT_SELECT = '.antd-property-bar-lineweight'
const SELECTION_ITEM = '.ant-select-selection-item'
const CONTEXT_MENU = '.ml-layerctx-menu'

/**
 * The fixture line (Extents framing puts it across the canvas center)
 * carries linetype ByLayer and an explicit lineweight of 1.00 mm (370=100).
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

test('选中实体后特性工具栏同步显示实体的线型/线宽', async ({ page }) => {
  await loadFixtureLine(page)

  // No selection yet → the toolbar mirrors the database current style.
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ByLayer', { timeout: 30_000 })
  await expect(
    page.locator(`${LINETYPE_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ByLayer')

  // Selecting the line must sync the toolbar to the entity's own values.
  await pickLine(page)
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('1.00 mm', { timeout: 30_000 })
  await expect(
    page.locator(`${LINETYPE_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ByLayer')
})

test('加载图纸后特性工具栏同步图纸的 CELTYPE/CELWEIGHT 并补充线型选项', async ({
  page
}) => {
  const celtypeFixturePath = path.resolve(
    currentDir,
    '..',
    'fixtures',
    'minimal-line-celtype.dxf'
  )
  await page.goto('/')
  await uploadFixture(page, celtypeFixturePath, {
    accessMode: 'Write',
    initialView: 'Extents'
  })

  // No selection: the toolbar must re-read the loaded drawing's current
  // style ($CELTYPE=DASHED, $CELWEIGHT=50) instead of keeping defaults.
  await expect(
    page.locator(`${LINETYPE_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('DASHED', { timeout: 30_000 })
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0.50 mm')

  // The drawing's linetype table supplements the dropdown options with
  // DASHED (the exact uppercase name, not the fixed 'Dashed' ISO option).
  await page.locator(LINETYPE_SELECT).click()
  await expect(
    page.locator('.ant-select-item-option').filter({ hasText: /^DASHED$/ })
  ).toBeVisible()
  await page.keyboard.press('Escape')
})

test('实体线型为 CONTINUOUS 时特性工具栏映射显示 Continuous', async ({ page }) => {
  const continuousFixturePath = path.resolve(
    currentDir,
    '..',
    'fixtures',
    'minimal-line-continuous.dxf'
  )
  await page.goto('/')
  await uploadFixture(page, continuousFixturePath, {
    accessMode: 'Write',
    initialView: 'Extents'
  })

  // No selection → the toolbar mirrors the database current style.
  await expect(
    page.locator(`${LINETYPE_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ByLayer', { timeout: 30_000 })

  // DXF stores the explicit linetype as 'CONTINUOUS'; the toolbar must map
  // it case-insensitively onto its 'Continuous' option instead of going blank.
  await pickLine(page)
  await expect(
    page.locator(`${LINETYPE_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('Continuous', { timeout: 30_000 })
})

test('特性工具栏修改线宽应用到选中的实体', async ({ page }) => {
  await loadFixtureLine(page)
  await pickLine(page)
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('1.00 mm', { timeout: 30_000 })

  // Change the lineweight of the selection via the toolbar.
  await page.locator(LINEWEIGHT_SELECT).click()
  await page
    .locator('.ant-select-item-option', { hasText: '0.50 mm' })
    .click()
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0.50 mm')

  // Deselect via the context menu: the toolbar must fall back to the
  // database current style, i.e. the edit went to the entity, not CELWEIGHT.
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + 15, box.y + 15, { button: 'right' })
  }
  await page.locator('.ml-layerctx-menu__item', { hasText: 'Deselect All' }).click()
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('ByLayer', { timeout: 30_000 })

  // Re-pick the line with the Select tool and verify the entity kept its
  // new lineweight. (Right-click picking stays inert right after a
  // menu-driven deselect, so the Select tool is the reliable path here.)
  await page.getByRole('button', { name: 'Select' }).click()
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await expect(
    page.locator(`${LINEWEIGHT_SELECT} ${SELECTION_ITEM}`)
  ).toContainText('0.50 mm', { timeout: 30_000 })
})
