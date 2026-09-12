import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Drawing with two TEXT STYLE records (`Standard` + `HZ`, different fonts).
 *
 * A second style is what makes the "change the text style before committing"
 * step observable at all: with a single style the picker has nothing to
 * choose, and the style assertions below would pass vacuously.
 */
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'mtext-two-styles.dxf'
)

/**
 * The shape most real drawings (and every drawing authored by this app) have:
 * exactly ONE text style, `Standard`, on a Windows CJK face.
 *
 * The Text Style dropdown then has nothing to switch to, so the only way to
 * restyle the text from the editor is the Font control - which is why the
 * "font reaches the text already typed" case below exists.
 */
const singleStyleFixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'mtext-single-style.dxf'
)

/** Style picked in the Format panel after the text has been typed. */
const TARGET_STYLE = 'HZ'

/** Font picked in the Format panel after the text has been typed. */
const TARGET_FONT = '宋体'

/** Default style the drawing starts on. */
const DEFAULT_STYLE = 'Standard'

/** The Chinese string typed into the MTEXT editor. */
const CHINESE_TEXT = '中文测试'

/** Typed *after* the style change, to prove the caret survived it. */
const CHINESE_TEXT_AFTER_STYLE = '追加文字'

/** Text box picked on the canvas, in CSS pixels. */
const BOX_WIDTH = 200
const BOX_HEIGHT = 30

/**
 * Where the text box starts: 30% into the canvas, which keeps the region clear
 * of the UCS icon in the lower-left corner and of the command line at the
 * bottom.
 */
const BOX_ORIGIN_X_RATIO = 0.3
const BOX_ORIGIN_Y_RATIO = 0.3

/**
 * Headless machines have no GPU. Without these flags Chromium may refuse to
 * create a WebGL context and the canvas stays empty.
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

interface MTextSnapshot {
  dxfTypeName?: string
  contents?: string
  styleName?: string
  height?: number
  width?: number
}

interface DocManagerLike {
  instance?: {
    curDocument?: {
      database?: {
        textstyle?: string
        tables: {
          blockTable: {
            modelSpace: { newIterator: () => Iterable<MTextSnapshot> }
          }
        }
      }
    }
  }
}

// ── page helpers ─────────────────────────────────────────────────────

/** Every entity in model space, flattened for transport out of the page. */
async function readModelSpaceEntities(page: Page): Promise<MTextSnapshot[]> {
  return page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager?.instance
    const modelSpace =
      manager?.curDocument?.database?.tables.blockTable.modelSpace
    if (!modelSpace) return []
    const entities: MTextSnapshot[] = []
    for (const entity of modelSpace.newIterator()) {
      entities.push({
        dxfTypeName: entity.dxfTypeName,
        contents: entity.contents,
        styleName: entity.styleName,
        height: entity.height,
        width: entity.width
      })
    }
    return entities
  })
}

/** The committed MTEXT entities, as plain snapshots. */
async function readMTextEntities(page: Page): Promise<MTextSnapshot[]> {
  return (await readModelSpaceEntities(page)).filter(
    entity => entity.dxfTypeName === 'MTEXT'
  )
}

/** `$TEXTSTYLE`, i.e. the drawing's current text style. */
async function readCurrentTextStyle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager?.instance
    return manager?.curDocument?.database?.textstyle ?? ''
  })
}

/**
 * Opens the two-style fixture in Write mode with deterministic framing.
 *
 * `window.AcApDocManager` is only published by dev builds, which is what the
 * Playwright web server runs.
 */
async function openDrawing(page: Page, drawingPath: string) {
  await page.goto('/')
  await uploadFixture(page, drawingPath, {
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
  await page.waitForTimeout(3000)
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { AcApDocManager?: unknown })
          .AcApDocManager !== 'undefined'
    ),
    'window.AcApDocManager is missing: the e2e server must run a dev build'
  ).toBe(true)
}

/** Opens the two-style fixture. */
async function openTwoStyleDrawing(page: Page) {
  await openDrawing(page, fixturePath)
}

/** Opens the single-`Standard`-style fixture. */
async function openSingleStyleDrawing(page: Page) {
  await openDrawing(page, singleStyleFixturePath)
}

/** Clicks the ribbon Text button (「文字」/Multiline Text) and waits for it. */
async function clickTextRibbonButton(page: Page) {
  // The button carries its keytip as `aria-keyshortcuts`, which keeps the
  // selector locale independent: the label is 「文字」 in zh-CN and
  // "Multiline Text" in the English locale the upload helper pins.
  const textButton = page.locator('button[aria-keyshortcuts="Alt+T"]').first()
  await expect(textButton).toBeVisible({ timeout: 15000 })
  await textButton.click()
  await expect(page.locator('.ml-cli-prompt')).toContainText('corner', {
    timeout: 15000
  })
}

/** Picks the two box corners the MTEXT command prompts for. */
async function pickBoxCorners(page: Page) {
  const canvas = page.locator('.ml-cad-container canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas bounding box is unavailable')
  const p1 = {
    x: box.x + box.width * BOX_ORIGIN_X_RATIO,
    y: box.y + box.height * BOX_ORIGIN_Y_RATIO
  }
  const p2 = { x: p1.x + BOX_WIDTH, y: p1.y + BOX_HEIGHT }
  for (const point of [p1, p2]) {
    await page.mouse.move(point.x, point.y, { steps: 4 })
    await page.waitForTimeout(80)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(250)
  }

  // The hidden IME textarea is the signal that the box was accepted and the
  // editor opened.
  await expect(page.locator('body > textarea')).toHaveCount(1, {
    timeout: 15000
  })
}

/**
 * Types `text` into the editor's hidden IME textarea.
 *
 * `keyboard.insertText` goes to whatever holds focus, so the focus assertion is
 * what keeps a delayed IME attach - or a formatting command that failed to
 * return focus - from silently losing the keystrokes.
 */
async function typeIntoEditor(page: Page, text: string) {
  const ime = page.locator('body > textarea')
  await expect(ime).toBeFocused({ timeout: 5000 })
  await page.keyboard.insertText(text)
  await page.waitForTimeout(300)
}

/** The Format panel's Text Style field (the first field in the panel). */
function textStyleField(page: Page): Locator {
  return page.locator('.antd-mtext-format .antd-mtext-field').first()
}

/**
 * Picks `styleName` in the Format panel's Text Style dropdown.
 *
 * The option list is portalled to `body`, so it is looked up from the page.
 * The filter is anchored (`^HZ$`) because option labels share prefixes once a
 * drawing defines several styles.
 */
async function chooseTextStyle(page: Page, styleName: string) {
  await textStyleField(page).locator('.ant-select').click()
  const option = page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: new RegExp(`^${styleName}$`) })
    .first()
  await expect(option).toBeVisible({ timeout: 10000 })
  await option.click()
}

/** Text currently shown by the Text Style dropdown. */
async function shownTextStyle(page: Page): Promise<string> {
  return (
    await textStyleField(page)
      .locator('.ant-select-selection-item')
      .first()
      .innerText()
  ).trim()
}

/** The Format panel's Font field (the second field in the panel). */
function fontField(page: Page): Locator {
  return page.locator('.antd-mtext-format .antd-mtext-field').nth(1)
}

/**
 * Picks `fontName` in the Format panel's Font dropdown.
 *
 * The field is searchable and its catalogue is long, so the name is typed into
 * the search box (`insertText`, because the name is not on the physical
 * keyboard) and the single remaining option is clicked.
 */
async function chooseFont(page: Page, fontName: string) {
  await fontField(page).locator('.ant-select').click()
  await page.keyboard.insertText(fontName)
  const option = page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .first()
  await expect(option).toBeVisible({ timeout: 10000 })
  await expect(option).toContainText(fontName)
  await option.click()
}

/**
 * Commits the open editor through the contextual ribbon's Close button.
 *
 * Escape is the *cancel* path since the MTEXT editor rework, so Close is the
 * user-visible commit affordance; in Write mode the input box's own toolbar is
 * hidden.
 */
async function clickClose(page: Page) {
  await page.locator('.antd-mtext-close button').first().click()
}

/** Waits until exactly one MTEXT reached model space and returns it. */
async function waitForCommittedMText(page: Page): Promise<MTextSnapshot> {
  await expect
    .poll(async () => (await readMTextEntities(page)).length, {
      timeout: 15000,
      message: 'the MTEXT entity was never committed'
    })
    .toBe(1)
  const [mtext] = await readMTextEntities(page)
  return mtext
}

/**
 * Waits for the MTEXT whose contents contain `marker`.
 *
 * Needed for drawings that already carry text (the single-style fixture ships
 * one entity): the count-based helper above cannot tell the new entity from the
 * pre-existing one.
 */
async function waitForMTextContaining(
  page: Page,
  marker: string
): Promise<MTextSnapshot> {
  const matching = async () =>
    (await readMTextEntities(page)).filter(entity =>
      (entity.contents ?? '').includes(marker)
    )
  await expect
    .poll(async () => (await matching()).length, {
      timeout: 15000,
      message: `no committed MTEXT contains ${marker}`
    })
    .toBe(1)
  const [mtext] = await matching()
  return mtext
}

/**
 * Switches the shell language through the ribbon's locale dropdown.
 *
 * The success signal is the select's own value, not the dropdown closing: the
 * option list is portalled to `body` and antdv keeps it mounted (hidden) after
 * the choice, so a "no options left" assertion can never pass.
 */
async function switchLocale(page: Page, optionLabel: string) {
  const localeSelect = page.locator('.antd-ribbon-locale').first()
  await localeSelect.click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: optionLabel })
    .first()
    .click()
  await expect(
    localeSelect.locator('.ant-select-selection-item')
  ).toContainText(optionLabel, { timeout: 10000 })
}

// ── tests ────────────────────────────────────────────────────────────

/**
 * The user path under test: 「注释」→「文字」 → pick the text box → type
 * Chinese → change the text style in the contextual Format panel → click
 * 「关闭」/Close to commit.
 *
 * Asserts both halves of "did the style change stick": the panel shows the
 * chosen style (otherwise the user cannot tell the click did anything), and the
 * committed MTEXT carries it as its TEXT STYLE (DXF group 7).
 */
test('the Text workflow commits the Chinese MTEXT with the style chosen while editing', async ({
  page
}) => {
  await openTwoStyleDrawing(page)
  expect(await readCurrentTextStyle(page)).toBe(DEFAULT_STYLE)

  await clickTextRibbonButton(page)
  await pickBoxCorners(page)
  await typeIntoEditor(page, CHINESE_TEXT)

  // The editor must survive the ribbon interaction: a style change is part of
  // the edit, not a commit.
  await expect(
    page.locator('#antd-ribbon-tab-mtextEditorContext')
  ).toBeVisible()
  await chooseTextStyle(page, TARGET_STYLE)
  await expect(page.locator('body > textarea')).toHaveCount(1)

  expect(
    await shownTextStyle(page),
    'the Format panel still shows the previous style after the user picked a new one'
  ).toBe(TARGET_STYLE)

  await clickClose(page)
  const mtext = await waitForCommittedMText(page)

  expect(mtext.contents, 'the typed text was lost on commit').toContain(
    CHINESE_TEXT
  )
  expect(
    mtext.contents,
    `the committed text does not carry the chosen style's font: ${mtext.contents}`
  ).toMatch(/simkai/i)
  expect(
    mtext.styleName,
    'the committed MTEXT kept the pre-edit text style'
  ).toBe(TARGET_STYLE)
  expect(
    await readCurrentTextStyle(page),
    'the drawing text style was not updated by the panel'
  ).toBe(TARGET_STYLE)
})

/**
 * The style change must not eat the text that follows it.
 *
 * Applying a text style with the caret collapsed rewrites the whole MTEXT, so
 * this is the regression guard for the destructiveness that would come with a
 * selection left behind - and for a caret that `selectAll` would otherwise park
 * at the end of the string: the characters typed afterwards have to be appended
 * after the first ones, not replace them.
 */
test('typing after the mid-edit style change appends to the same MTEXT', async ({
  page
}) => {
  await openTwoStyleDrawing(page)
  await clickTextRibbonButton(page)
  await pickBoxCorners(page)
  await typeIntoEditor(page, CHINESE_TEXT)

  await chooseTextStyle(page, TARGET_STYLE)
  await typeIntoEditor(page, CHINESE_TEXT_AFTER_STYLE)

  await clickClose(page)
  const mtext = await waitForCommittedMText(page)
  const contents = mtext.contents ?? ''

  expect(
    contents,
    'the text typed after the style change is missing'
  ).toContain(CHINESE_TEXT_AFTER_STYLE)
  expect(contents, 'the text typed before the style change was lost').toContain(
    CHINESE_TEXT
  )
  expect(
    contents.indexOf(CHINESE_TEXT_AFTER_STYLE),
    `typing after the style change did not append to the end: ${contents}`
  ).toBeGreaterThan(contents.indexOf(CHINESE_TEXT))
  expect(mtext.styleName).toBe(TARGET_STYLE)
})

/**
 * Escape is the documented cancel path, so the style the panel picked while the
 * editor was open has to be rolled back with the rest of the edit: a cancelled
 * edit may not leave the drawing's `$TEXTSTYLE` changed.
 */
test('cancelling with Escape rolls the mid-edit style choice back', async ({
  page
}) => {
  await openTwoStyleDrawing(page)
  await clickTextRibbonButton(page)
  await pickBoxCorners(page)
  await typeIntoEditor(page, CHINESE_TEXT)
  await chooseTextStyle(page, TARGET_STYLE)
  expect(await shownTextStyle(page)).toBe(TARGET_STYLE)

  await page.keyboard.press('Escape')

  await expect(page.locator('body > textarea')).toHaveCount(0, {
    timeout: 15000
  })
  await expect(page.locator('#antd-ribbon-tab-mtextEditorContext')).toHaveCount(
    0,
    { timeout: 15000 }
  )
  expect(
    await readMTextEntities(page),
    'a cancelled edit still created an entity'
  ).toHaveLength(0)
  expect(
    await readCurrentTextStyle(page),
    'the cancelled style choice was left behind on the drawing'
  ).toBe(DEFAULT_STYLE)
})

/**
 * The same path driven through the Chinese UI the user actually sees:
 * 「文字」 under the annotation tab and the 「关闭」 submit button.
 *
 * The command prompt is not asserted here: the viewer core's own locale is
 * switched by the same control, but the assertion below stays on the ribbon
 * labels, which is what this case is about.
 */
test('the Chinese UI labels drive the same Text workflow', async ({ page }) => {
  await openTwoStyleDrawing(page)
  await switchLocale(page, '中文')

  const textButton = page.locator('button[aria-keyshortcuts="Alt+T"]').first()
  await expect(textButton).toContainText('文字', { timeout: 15000 })
  await textButton.click()
  await expect(page.locator('.ml-cli-prompt')).toContainText('角点', {
    timeout: 15000
  })

  const canvas = page.locator('.ml-cad-container canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas bounding box is unavailable')
  const p1 = {
    x: box.x + box.width * BOX_ORIGIN_X_RATIO,
    y: box.y + box.height * BOX_ORIGIN_Y_RATIO
  }
  const p2 = { x: p1.x + BOX_WIDTH, y: p1.y + BOX_HEIGHT }
  for (const point of [p1, p2]) {
    await page.mouse.move(point.x, point.y, { steps: 4 })
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(250)
  }
  await expect(page.locator('body > textarea')).toHaveCount(1, {
    timeout: 15000
  })

  await typeIntoEditor(page, CHINESE_TEXT)
  await chooseTextStyle(page, TARGET_STYLE)

  const closeButton = page.locator('.antd-mtext-close button').first()
  await expect(closeButton).toContainText('关闭')
  await closeButton.click()

  const mtext = await waitForCommittedMText(page)
  expect(mtext.contents).toContain(CHINESE_TEXT)
  expect(mtext.styleName).toBe(TARGET_STYLE)
})

/**
 * The single-style reality behind the reported "after committing, the entity
 * still has the old style".
 *
 * A drawing authored by this app (and most imported drawings) carries exactly
 * one TEXT STYLE, so the Text Style dropdown has nothing to switch to; the only
 * restyling control left in the editor is the Font field. Changing it after the
 * text has been typed must therefore reach that text - the entity's DXF group 7
 * deliberately stays `Standard`, because a font chosen inside the MTEXT editor
 * is an inline override (`\f...`), not a new text style.
 */
test('changing the font after typing restyles the text that is already there', async ({
  page
}) => {
  await openSingleStyleDrawing(page)
  expect(await readCurrentTextStyle(page)).toBe(DEFAULT_STYLE)

  await clickTextRibbonButton(page)
  await pickBoxCorners(page)
  await typeIntoEditor(page, CHINESE_TEXT)

  await chooseFont(page, TARGET_FONT)
  await expect(page.locator('body > textarea')).toHaveCount(1)
  await expect(
    fontField(page).locator('.ant-select-selection-item').first()
  ).toContainText(TARGET_FONT)

  await clickClose(page)
  const mtext = await waitForMTextContaining(page, CHINESE_TEXT)

  expect(mtext.contents, 'the typed text was lost on commit').toContain(
    CHINESE_TEXT
  )
  expect(
    mtext.contents,
    `the font picked after typing never reached the text: ${mtext.contents}`
  ).toMatch(new RegExp(`${TARGET_FONT}|simsun`, 'i'))
  // A font override is inline MTEXT data, not a new drawing text style.
  expect(mtext.styleName).toBe(DEFAULT_STYLE)
})
