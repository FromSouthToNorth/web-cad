import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page, test } from '@playwright/test'

import { CAD_DATA_ESSENTIAL_FONT_FILES } from '../../../../tools/cad-data-assets.mjs'

import { uploadFixture } from '../helpers/fileUpload'

/**
 * Local cad-data font pipeline checks.
 *
 * A font can be missing in three different places and each one used to fail
 * silently: the sync manifest (`tools/cad-data-assets.mjs`), the trimmed
 * `fonts.json` catalog the renderer maps DXF font names through, and the
 * served asset itself. A drawing that names a Windows-only CJK face such as
 * `SimKai` (楷体) then quietly degrades to the fallback chain plus a "Font not
 * found" notice. These tests pin all three.
 */

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(currentDir, '..', 'fixtures', 'empty.dxf')

/** Base path the example app serves the local mirror from, in dev and build. */
const CAD_DATA_BASE = '/cad-data/'

/**
 * The fixture's Standard text style names a Windows-only face.
 *
 * Asserted below so this file fails loudly if the fixture is ever changed to a
 * font that ships everywhere — the regression would otherwise go unnoticed.
 */
const FIXTURE_STYLE_FONT = 'SimKai'

/** Slice of the CAD globals these tests reach for. */
interface DocManagerLike {
  instance?: {
    curDocument?: {
      database?: {
        textstyle?: string
        tables: {
          textStyleTable: {
            getAt: (name: string) => { fileName?: string } | undefined
            newIterator: () => Iterable<{ name?: string; fileName?: string }>
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
  // Fonts are requested while the first frame is rendered.
  await page.waitForTimeout(3000)
}

test('the served font catalog covers every font in the sync manifest', async ({
  page
}) => {
  await page.goto('/')

  const result = await page.evaluate(async base => {
    const catalogResponse = await fetch(`${base}fonts/fonts.json`)
    if (!catalogResponse.ok) {
      return { catalogStatus: catalogResponse.status, files: {} }
    }
    const catalog = (await catalogResponse.json()) as Array<{ file: string }>
    const files: Record<string, { status: number; bytes: number }> = {}
    for (const entry of catalog) {
      const response = await fetch(`${base}fonts/${entry.file}`)
      const buffer = await response.arrayBuffer()
      files[entry.file] = {
        status: response.status,
        bytes: buffer.byteLength
      }
    }
    return {
      catalogStatus: catalogResponse.status,
      catalogFiles: catalog.map(entry => entry.file).sort(),
      files
    }
  }, CAD_DATA_BASE)

  expect(result.catalogStatus, 'fonts.json is not served').toBe(200)

  const wanted = CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => entry.file).sort()
  expect(
    result.catalogFiles,
    'the trimmed fonts.json does not list every essential font'
  ).toEqual(wanted)

  for (const entry of CAD_DATA_ESSENTIAL_FONT_FILES) {
    const served = result.files[entry.file]
    expect(served, `${entry.file} is not served`).toBeTruthy()
    expect(served.status, `${entry.file} is not served`).toBe(200)
    expect(served.bytes, `${entry.file} served empty`).toBeGreaterThan(0)
  }

  // The face this whole pipeline exists for: the catalog must expose the name
  // the drawing asks for, otherwise the lookup degrades to a substitution.
  const kai = await page.evaluate(async base => {
    const response = await fetch(`${base}fonts/fonts.json`)
    const catalog = (await response.json()) as Array<{
      file: string
      name: string[]
    }>
    return catalog.find(entry => entry.file === 'simkai.woff') ?? null
  }, CAD_DATA_BASE)
  expect(kai, 'simkai.woff is missing from fonts.json').toBeTruthy()
  const aliases = (kai?.name ?? []).map(name => name.toLowerCase())
  expect(aliases).toContain(FIXTURE_STYLE_FONT.toLowerCase())
  expect(aliases).toContain('楷体')
})

test('a drawing that asks for SimKai loads without a missing-font notice', async ({
  page
}) => {
  await openEmptyDrawing(page)

  // Guard: the fixture must still reference the Windows-only face, or this
  // test would pass for the wrong reason.
  const styleFont = await page.evaluate(() => {
    const manager = (window as Window & { AcApDocManager?: DocManagerLike })
      .AcApDocManager
    const table =
      manager?.instance?.curDocument?.database?.tables.textStyleTable
    if (!table) return null
    const current = manager?.instance?.curDocument?.database?.textstyle ?? ''
    const record = current ? table.getAt(current) : undefined
    if (record?.fileName) return record.fileName
    for (const candidate of table.newIterator()) {
      if (candidate.fileName) return candidate.fileName
    }
    return null
  })
  expect(styleFont?.toLowerCase()).toBe(FIXTURE_STYLE_FONT.toLowerCase())

  // The notice is rendered as an antd notification; with the font synced it
  // must not appear at all.
  const notice = page
    .locator('.ant-notification-notice')
    .filter({ hasText: 'Font not found' })
  await expect(notice).toHaveCount(0)
  await page.waitForTimeout(2000)
  await expect(notice).toHaveCount(0)
})
