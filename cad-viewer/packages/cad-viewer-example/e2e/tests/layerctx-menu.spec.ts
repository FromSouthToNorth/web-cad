import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Locator, type Page,test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line.dxf'
)

const MENU = '.ml-layerctx-menu'
const MENU_TITLE = '.ml-layerctx-menu__title'
const MENU_ITEM = '.ml-layerctx-menu__item'
const CLI_PROMPT = '.ml-cli-prompt'

/**
 * The app starts with a new empty drawing; {@link uploadFixture} resets it to
 * the upload screen (via `quit`), pins the English locale and loads the
 * fixture with Extents framing so the line position is deterministic.
 * Progressive rendering stays off (upload screen default); its idle-gate
 * never completes under headless software WebGL.
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
  if (!box) {
    throw new Error('Canvas bounding box is null')
  }
  return box
}

/**
 * Right-clicks the canvas center, which picks the fixture line (Extents
 * framing puts it across the canvas center). With an existing selection the
 * menu opens even when the pick misses, so this doubles as "open the menu".
 */
async function rightClickCanvasCenter(page: Page) {
  const box = await canvasBox(page)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: 'right'
  })
}

/**
 * Right-clicks a canvas corner with no entity under the cursor: the menu must
 * open for the existing selection only.
 */
async function rightClickEmptyCorner(page: Page) {
  const box = await canvasBox(page)
  await page.mouse.click(box.x + 15, box.y + 15, { button: 'right' })
}

/** Opens the menu via a corner right-click and asserts the selection title. */
async function expectMenuForSelection(page: Page, count: number) {
  await rightClickEmptyCorner(page)
  await expect(page.locator(MENU)).toBeVisible()
  await expect(page.locator(MENU_TITLE)).toHaveText(
    `Selected: ${count} object(s)`
  )
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)
}

/** Waits until the fixture line is rendered and pickable by the plugin. */
async function waitForPickableLine(page: Page) {
  await expect
    .poll(
      async () => {
        await rightClickCanvasCenter(page)
        await page.waitForTimeout(300)
        // The object menu (with its title) only opens once the line was
        // picked; an unpicked empty-canvas right-click shows the navigation
        // menu instead, which must not count as "pickable".
        const opened = (await page.locator(MENU_TITLE).count()) > 0
        // Always dismiss whichever menu opened: it sits under the cursor, so
        // the next right-click would hit the menu itself and never re-pick.
        await page.keyboard.press('Escape')
        return opened
      },
      { timeout: 60_000 }
    )
    .toBe(true)
}

/** Screenshots the drawing canvas region from a full-page screenshot. */
async function canvasScreenshotB64(page: Page) {
  const box = await canvasBox(page)
  const shot = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ({ b64, x, y, w, h }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${b64}`
      await image.decode()
      const probe = document.createElement('canvas')
      probe.width = w
      probe.height = h
      const ctx = probe.getContext('2d')
      if (!ctx) throw new Error('Failed to create 2d context')
      ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
      return probe.toDataURL('image/png').split(',')[1]
    },
    { b64: shot, x: box.x, y: box.y, w: box.width, h: box.height }
  )
}

/**
 * Counts how many pixels differ between two same-size canvas screenshots
 * (per-channel tolerance absorbs antialiasing jitter between frames).
 */
async function diffPixelCount(
  page: Page,
  beforeB64: string,
  afterB64: string
) {
  return page.evaluate(
    async ([a, b]) => {
      const decode = async (base64: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const probe = document.createElement('canvas')
        probe.width = image.naturalWidth
        probe.height = image.naturalHeight
        const ctx = probe.getContext('2d')
        if (!ctx) throw new Error('Failed to create 2d context')
        ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, probe.width, probe.height).data
      }
      const [before, after] = await Promise.all([decode(a), decode(b)])
      let diff = 0
      for (let i = 0; i < before.length; i += 4) {
        if (Math.abs(before[i] - after[i]) > 8) {
          diff++
          continue
        }
        if (Math.abs(before[i + 1] - after[i + 1]) > 8) {
          diff++
          continue
        }
        if (Math.abs(before[i + 2] - after[i + 2]) > 8) {
          diff++
        }
      }
      return diff
    },
    [beforeB64, afterB64] as const
  )
}

test('右键菜单：结构/键盘导航 + 复制/移动/缩放执行后保留选择', async ({
  page
}) => {
  await loadFixtureLine(page)
  await waitForPickableLine(page)

  // --- menu opens on right-click pick, with the expected structure ---
  await rightClickCanvasCenter(page)
  await expect(page.locator(MENU)).toBeVisible()
  const items = page.locator(MENU_ITEM)
  await expect(items).toHaveCount(7)
  await expect(items.nth(0)).toContainText('Copy')
  await expect(items.nth(1)).toContainText('Move')
  await expect(items.nth(2)).toContainText('Scale')
  await expect(items.nth(3)).toContainText('Rotate')
  await expect(items.nth(4)).toContainText('Offset')
  await expect(items.nth(5)).toContainText('Deselect All')
  await expect(items.nth(6)).toContainText('Delete')
  await expect(items.nth(6)).toHaveClass(/ml-layerctx-menu__item--danger/)
  // AutoCAD-style mnemonic underlines on the access-key letters.
  await expect(items.nth(0).locator('u')).toHaveText('C')
  await expect(items.nth(1).locator('u')).toHaveText('M')
  await expect(items.nth(3).locator('u')).toHaveText('R')
  await expect(items.nth(6).locator('u')).toHaveText('e')

  // --- keyboard navigation: open focuses first item; arrows/Home move focus ---
  const focusedText = () =>
    page.evaluate(() => document.activeElement?.textContent ?? '')
  expect(await focusedText()).toContain('Copy')
  await page.keyboard.press('ArrowDown')
  expect(await focusedText()).toContain('Move')
  await page.keyboard.press('ArrowDown')
  expect(await focusedText()).toContain('Scale')
  await page.keyboard.press('Home')
  expect(await focusedText()).toContain('Copy')
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)

  // --- Move: base point → second point → selection retained ---
  await rightClickCanvasCenter(page)
  await page.locator(MENU_ITEM).filter({ hasText: 'Move' }).click()
  await expect(page.locator(CLI_PROMPT)).toContainText('Specify base point')
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2)
    await page.mouse.click(
      box.x + box.width * 0.4,
      box.y + box.height / 2 + 60
    )
  }
  await expectMenuForSelection(page, 1)

  // --- Copy: base point → placement → Escape (Multiple mode) → selection retained ---
  await rightClickCanvasCenter(page)
  await page.locator(MENU_ITEM).filter({ hasText: 'Copy' }).click()
  await expect(page.locator(CLI_PROMPT)).toContainText('Specify base point')
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7)
  }
  await page.keyboard.press('Escape')
  await expectMenuForSelection(page, 1)

  // --- Scale: base point → reference point → type factor → Enter → selection retained ---
  await rightClickCanvasCenter(page)
  await page.locator(MENU_ITEM).filter({ hasText: 'Scale' }).click()
  await expect(page.locator(CLI_PROMPT)).toContainText(
    'Specify base point for scale'
  )
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  // Wait for reference point prompt (may show in CLI or floating input)
  await page.waitForTimeout(500)
  // Click reference point
  {
    const box = await canvasBox(page)
    await page.mouse.click(
      box.x + box.width / 2 + box.width * 0.1,
      box.y + box.height / 2
    )
  }
  // Wait for new length prompt
  await page.waitForTimeout(500)
  // Type scale factor and press Enter
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await expectMenuForSelection(page, 1)

  // --- 快捷键取消选择：Esc 关闭菜单，再次 Esc 清空选择；空选中右键弹出导航菜单 ---
  await rightClickEmptyCorner(page)
  await expect(page.locator(MENU)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await rightClickEmptyCorner(page)
  await expect(page.locator(MENU)).toBeVisible()
  await expect(page.locator(MENU_TITLE)).toHaveCount(0)
  await expect(page.locator(MENU_ITEM).filter({ hasText: 'Pan' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)
})

test('右键缩放：拖动时实时预览随光标更新', async ({ page }) => {
  await loadFixtureLine(page)
  await waitForPickableLine(page)

  await rightClickCanvasCenter(page)
  await page.locator(MENU_ITEM).filter({ hasText: 'Scale' }).click()
  await expect(page.locator(CLI_PROMPT)).toContainText(
    'Specify base point for scale'
  )

  const box = await canvasBox(page)
  const baseX = box.x + box.width / 2
  const baseY = box.y + box.height / 2
  await page.mouse.click(baseX, baseY)
  
  // Wait for reference point prompt
  await page.waitForTimeout(500)
  
  // Click reference point
  const refX = baseX + box.width * 0.1
  await page.mouse.click(refX, baseY)
  
  // Wait for new length prompt (floating input)
  await page.waitForTimeout(500)
  
  // Type scale factor and press Enter
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  
  await expectMenuForSelection(page, 1)
})

test('快捷键：AutoCAD 风格单键直接触发命令，输入框内照常打字', async ({
  page
}) => {
  await loadFixtureLine(page)
  await waitForPickableLine(page)

  // Select the line, then dismiss the menu (selection is retained).
  await rightClickCanvasCenter(page)
  await expect(page.locator(MENU)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)

  // Bare `M` starts MOVE on the selection (AutoCAD alias style, no chord).
  await page.keyboard.press('m')
  await expect(page.locator(CLI_PROMPT)).toContainText('Specify base point')
  await page.keyboard.press('Escape')

  // While the command line is focused the same key must type text instead.
  const cliInput = page.locator('.ml-cli-text')
  await cliInput.click()
  await page.keyboard.press('m')
  await expect(cliInput).toHaveValue('m')
  await page.keyboard.press('Escape')
  // Canvas mousedown is preventDefaulted by the viewer, so clicking the
  // canvas never blurs the command line — blur it explicitly instead.
  await cliInput.blur()

  // Bare `E` erases the selection; the corner right-click then opens the
  // navigation menu (no selection) instead of the object menu.
  await page.keyboard.press('e')
  await page.waitForTimeout(300)
  await rightClickEmptyCorner(page)
  await expect(page.locator(MENU)).toBeVisible()
  await expect(page.locator(MENU_ITEM)).toHaveCount(3) // Repeat / Pan / Zoom
  await expect(page.locator(MENU_ITEM).first()).toContainText('Repeat')
  await expect(page.locator(MENU_ITEM).filter({ hasText: 'Pan' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)
})

test('右键菜单：颜色随明暗主题切换', async ({ page }) => {
  await loadFixtureLine(page)

  // The navigation menu (empty-canvas right-click) uses the same themed
  // stylesheet as the object menu, and opening it needs no entity pick — so
  // this test is immune to render contention under parallel workers.
  const openMenuColors = async () => {
    await expect
      .poll(
        async () => {
          await rightClickEmptyCorner(page)
          return (await page.locator(MENU).count()) > 0
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    const menu: Locator = page.locator(MENU)
    await expect(menu).toBeVisible()
    const colors = await menu.evaluate(el => {
      const style = getComputedStyle(el)
      return { bg: style.backgroundColor, text: style.color }
    })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    return colors
  }

  const before = await openMenuColors()
  const wasDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  )

  // Status-bar theme toggle switches the shell theme.
  await page.locator('.antd-status-toggle:has(.anticon-bg-colors)').click()
  await expect(page.locator('html')).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)

  const after = await openMenuColors()

  const light = wasDark ? after : before
  const dark = wasDark ? before : after
  expect(light.bg).toBe('rgb(255, 255, 255)')
  expect(light.text).toBe('rgb(48, 49, 51)')
  expect(dark.bg).toBe('rgb(29, 30, 31)')
  expect(dark.text).toBe('rgb(229, 234, 243)')
})

test('重复上次命令：置顶显示、可一键重跑；无选中时弹出导航菜单', async ({
  page
}) => {
  await loadFixtureLine(page)
  await waitForPickableLine(page)

  // Nothing executed yet: no repeat entry in the object menu.
  await rightClickCanvasCenter(page)
  await expect(page.locator(MENU_ITEM)).toHaveCount(7)
  await page.keyboard.press('Escape')

  // Run Move through the menu; it becomes the last command.
  await rightClickCanvasCenter(page)
  await page.locator(MENU_ITEM).filter({ hasText: 'Move' }).click()
  await expect(page.locator(CLI_PROMPT)).toContainText('Specify base point')
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2)
    await page.mouse.click(
      box.x + box.width * 0.4,
      box.y + box.height / 2 + 60
    )
  }

  // The object menu now leads with "Repeat Move" (8 items total).
  await rightClickCanvasCenter(page)
  const items = page.locator(MENU_ITEM)
  await expect(items).toHaveCount(8)
  await expect(items.nth(0)).toContainText('Repeat Move')
  await expect(items.nth(2).locator('u')).toHaveText('M')
  await page.keyboard.press('Escape')

  // Clear the selection: the empty-canvas right-click now opens the
  // navigation menu (repeat / pan / zoom), without object ops or a title.
  await page.keyboard.press('Escape')
  await rightClickEmptyCorner(page)
  await expect(page.locator(MENU)).toBeVisible()
  await expect(page.locator(MENU_TITLE)).toHaveCount(0)
  await expect(page.locator(MENU_ITEM)).toHaveCount(3)
  await expect(page.locator(MENU_ITEM).first()).toContainText('Repeat Move')
  await expect(
    page.locator(MENU_ITEM).filter({ hasText: 'Pan' })
  ).toHaveCount(1)
  await expect(
    page.locator(MENU_ITEM).filter({ hasText: 'Zoom' })
  ).toHaveCount(1)
  await expect(
    page.locator(MENU_ITEM).filter({ hasText: 'Copy' })
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator(MENU)).toHaveCount(0)

  // Re-pick the moved line (60 px below center) and actually re-run through
  // the repeat item.
  {
    const box = await canvasBox(page)
    await page.mouse.click(
      box.x + box.width / 2,
      box.y + box.height / 2 + 60,
      { button: 'right' }
    )
  }
  await page.locator(MENU_ITEM).first().click()
  await expect(page.locator(CLI_PROMPT)).toContainText('Specify base point')
  {
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)
    await page.mouse.click(
      box.x + box.width * 0.5,
      box.y + box.height / 2 - 60
    )
  }
  await expectMenuForSelection(page, 1)
})
