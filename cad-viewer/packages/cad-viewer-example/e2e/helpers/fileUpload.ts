import { expect, type Page } from '@playwright/test'

/**
 * The app boots straight into the viewer with an empty drawing. This
 * navigates back to the upload screen (via the `quit` command) and pins the
 * English locale so the radio labels match the selectors below.
 */
export async function openUploadScreen(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('preferred_lang', 'en')
  })
  await page.reload()
  // Wait for viewer to fully initialize
  await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
    timeout: 30000
  })
  await expect(page.locator('.ml-cli-text')).toBeVisible()
  await page.locator('.ml-cli-text').click()
  await page.keyboard.type('quit')
  await page.keyboard.press('Enter')
  await expect(page.locator('.upload-screen')).toBeVisible()
}

/**
 * Clicks an antd radio-button by its visible label. The native input is
 * visually hidden (`opacity: 0`), so Playwright cannot action it directly;
 * clicking the label wrapper is the user-equivalent interaction.
 */
async function clickRadioButton(page: Page, name: RegExp) {
  await page
    .locator('.ant-radio-button-wrapper', { hasText: name })
    .first()
    .click()
}

export async function selectAccessMode(
  page: Page,
  mode: 'Read' | 'Review' | 'Write'
) {
  await clickRadioButton(page, new RegExp(`^${mode}\\b`))
}

export async function selectInitialViewMode(
  page: Page,
  mode: 'Auto' | 'Extents' | 'Saved'
) {
  await clickRadioButton(page, new RegExp(`^${mode}\\b`))
}

/**
 * Uploads a fixture through the example app's open-options UI.
 *
 * Pixel-based e2e checks need {@link AcApOpenViewMode.Extents} so the full
 * drawing is framed; Write access mode alone defaults to Saved (VPORT) view.
 */
export async function uploadFixture(
  page: Page,
  filePath: string,
  options?: {
    accessMode?: 'Read' | 'Review' | 'Write'
    initialView?: 'Auto' | 'Extents' | 'Saved'
  }
) {
  await openUploadScreen(page)
  const fileInput = page.locator('input[type="file"]').first()
  await expect(fileInput).toBeAttached()
  await selectAccessMode(page, options?.accessMode ?? 'Write')
  await selectInitialViewMode(page, options?.initialView ?? 'Extents')
  await fileInput.setInputFiles(filePath)
}
