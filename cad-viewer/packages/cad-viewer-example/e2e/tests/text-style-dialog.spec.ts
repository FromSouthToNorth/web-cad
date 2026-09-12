import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(currentDir, '..', 'fixtures', 'empty.dxf')

/**
 * Text Style dialog (STYLE / ST) parity checks.
 *
 * Covers the AutoCAD-parity gaps closed in that dialog: the obliquing angle is
 * limited to ±85 (both in the field and in what reaches the database), the
 * dialog has an "Apply" button that saves without closing, and the font field
 * accepts a name the drawing does not reference yet.
 */

/**
 * One STYLE table record, flattened for transport out of the page.
 *
 * The getters live on the record prototype, so the values are copied into a
 * plain object before crossing the `page.evaluate` boundary.
 */
interface TextStyleSnapshot {
  name: string
  obliquingAngle?: number
  fileName?: string
}

/**
 * The slice of the CAD globals these tests reach for.
 *
 * `window.AcApDocManager` is the *class* (exposed by `App.vue` in dev builds),
 * so the live document has to be reached through its `instance` getter.
 */
interface DocManagerLike {
  instance?: {
    curDocument?: {
      database?: {
        textstyle?: string
        tables: {
          textStyleTable: {
            newIterator: () => Iterable<{
              name?: string
              obliquingAngle?: number
              fileName?: string
              textStyle?: { name?: string }
            }>
          }
        }
      }
    }
  }
}

/** Opens the fixture in Write mode and waits until the viewer is usable. */
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
  // DXF conversion, font caching and the first render need a beat.
  await page.waitForTimeout(2000)
}

/** Runs the STYLE command from the command line and waits for the dialog. */
async function openTextStyleDialog(page: Page) {
  await page.locator('.ml-cli-text').click()
  await page.keyboard.type('style')
  await page.keyboard.press('Enter')

  const dialog = page.locator('.ml-text-style-dlg')
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

/**
 * Reads the STYLE table and the current `$TEXTSTYLE` from the live database.
 *
 * The upload helper pins the English locale, so the labels asserted below are
 * the English ones.
 */
async function readTextStyles(page: Page): Promise<{
  current: string
  records: TextStyleSnapshot[]
}> {
  return page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager
    const database = manager?.instance?.curDocument?.database
    const records: TextStyleSnapshot[] = []
    for (const record of database?.tables.textStyleTable.newIterator() ?? []) {
      // The dialog labels a style with `record.name` falling back to
      // `record.textStyle.name` (see `useTextStyle.listTextStyleNames`); the
      // table record's own `name` can be empty for styles read from DXF.
      records.push({
        name: record.name?.trim() || record.textStyle?.name?.trim() || '',
        obliquingAngle: record.obliquingAngle,
        fileName: record.fileName
      })
    }
    return { current: database?.textstyle ?? '', records }
  })
}

/** Case-insensitive lookup of one snapshot by style name. */
function findStyle(
  snapshot: { records: TextStyleSnapshot[] },
  name: string
): TextStyleSnapshot | undefined {
  return snapshot.records.find(
    record => record.name.toUpperCase() === name.toUpperCase()
  )
}

/** Name of the style the dialog currently has selected. */
async function selectedStyleName(dialog: Locator): Promise<string> {
  return (
    await dialog
      .locator('.ml-text-style-dlg__list-item--active')
      .first()
      .innerText()
  ).trim()
}

/**
 * The base-dialog chrome around the Text Style dialog.
 *
 * Its footer lives *outside* `.ml-text-style-dlg` (that class marks the body
 * content rendered into the `MlBaseDialog` slot), so footer buttons must be
 * looked up from the ancestor.
 */
function dialogChrome(page: Page): Locator {
  return page
    .locator('.ml-base-dialog')
    .filter({ has: page.locator('.ml-text-style-dlg') })
}

/** Clicks a footer button of the Text Style dialog by its label. */
async function clickFooter(page: Page, label: string) {
  await dialogChrome(page)
    .locator('.ml-base-dialog-footer-actions button')
    .filter({ hasText: label })
    .click()
}

test('Text Style dialog limits the oblique angle to ±85 and writes it to the database', async ({
  page
}) => {
  await openEmptyDrawing(page)
  const dialog = await openTextStyleDialog(page)
  const styleName = await selectedStyleName(dialog)

  // The dialog keeps AutoCAD's action column: Set Current / New / Delete /
  // Apply.
  const actionButtons = dialog.locator('.ml-text-style-dlg__actions button')
  await expect(actionButtons).toHaveCount(4)
  const applyButton = actionButtons.filter({ hasText: 'Apply' })
  await expect(applyButton).toHaveCount(1)

  // The obliquing angle field carries AutoCAD's accepted bounds. antdv puts
  // the aria bounds on the inner spinbutton input, not on the wrapper.
  const obliqueField = dialog.locator(
    'input.ant-input-number-input[aria-valuemax="85"]'
  )
  await expect(obliqueField).toHaveCount(1)
  await expect(obliqueField).toHaveAttribute('aria-valuemin', '-85')

  // An out-of-range angle must not stick in the field.
  await obliqueField.click()
  await obliqueField.press('Control+a')
  await obliqueField.fill('130')
  await obliqueField.blur()
  await expect(obliqueField).toHaveValue('85')

  // "Apply" saves without closing the dialog, and confirms it.
  await applyButton.click()
  await expect(page.locator('.ant-message')).toContainText('applied', {
    timeout: 10000
  })
  await expect(dialog).toBeVisible()

  const afterApply = await readTextStyles(page)
  expect(
    findStyle(afterApply, styleName)?.obliquingAngle,
    `the clamped oblique angle did not reach the database: ${JSON.stringify(
      afterApply
    )}`
  ).toBe(85)

  // Cancel closes without reverting the applied value (Apply already saved it).
  await clickFooter(page, 'Cancel')
  await expect(dialog).toHaveCount(0, { timeout: 10000 })
})

test('Text Style dialog accepts a font name the drawing does not reference', async ({
  page
}) => {
  await openEmptyDrawing(page)
  const dialog = await openTextStyleDialog(page)
  const styleName = await selectedStyleName(dialog)
  const before = await readTextStyles(page)
  const fontBefore = findStyle(before, styleName)?.fileName

  const fontSelect = dialog
    .locator('.ml-text-style-dlg__pair-grid .ant-select')
    .first()
  await fontSelect.click()

  // A name outside the drawing's font catalog is offered as a marked custom
  // option, mirroring AutoCAD's free-text font name field.
  await page.keyboard.type('MyCustomFont.ttf')
  const customOption = page
    .locator('.ant-select-item-option')
    .filter({ hasText: '(Custom)' })
  await expect(customOption).toHaveCount(1, { timeout: 10000 })
  await expect(customOption).toContainText('MyCustomFont.ttf')

  // Cancel discards the edit, so the custom name must not reach the database.
  await page.keyboard.press('Escape')
  await clickFooter(page, 'Cancel')
  await expect(dialog).toHaveCount(0, { timeout: 10000 })

  const after = await readTextStyles(page)
  expect(after.records.length, 'the STYLE table is empty').toBeGreaterThan(0)
  expect(findStyle(after, styleName)?.fileName).toBe(fontBefore)
})
