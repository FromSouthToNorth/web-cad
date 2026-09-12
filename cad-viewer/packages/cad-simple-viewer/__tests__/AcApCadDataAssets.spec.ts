/**
 * Unit tests for the local-first cad-data base URL resolution.
 *
 * `testEnvironment` is `node`, so there is no `document`: the helpers must fall
 * back to a deterministic base instead of throwing, and the probe must never
 * perform a real network request.
 */
import {
  CAD_DATA_CDN_BASE_URL,
  resetCadDataBaseUrlCache,
  resolveCadDataBaseUrl,
  resolveDocumentBaseUrl,
  resolveLocalCadDataBaseUrl
} from '../src/app/AcApCadDataAssets'

const realFetch = globalThis.fetch

function mockFetch(implementation: () => Promise<unknown>) {
  globalThis.fetch = jest.fn(implementation) as unknown as typeof fetch
}

describe('AcApCadDataAssets', () => {
  beforeEach(() => {
    resetCadDataBaseUrlCache()
    globalThis.fetch = realFetch
  })

  afterAll(() => {
    globalThis.fetch = realFetch
  })

  it('falls back to a synthetic document base outside a browser', () => {
    expect(resolveDocumentBaseUrl()).toBe('http://localhost/')
  })

  it('resolves the mirror directory to an absolute URL', () => {
    expect(resolveLocalCadDataBaseUrl('./')).toBe('http://localhost/cad-data/')
    expect(resolveLocalCadDataBaseUrl('/sub/')).toBe(
      'http://localhost/sub/cad-data/'
    )
    expect(resolveLocalCadDataBaseUrl('/')).toBe('http://localhost/cad-data/')
  })

  it('honours a custom mirror directory name', () => {
    expect(resolveLocalCadDataBaseUrl('./', 'cad-data-custom')).toBe(
      'http://localhost/cad-data-custom/'
    )
  })

  it('selects the local mirror when the catalog is served', async () => {
    mockFetch(() => Promise.resolve({ ok: true }))

    await expect(resolveCadDataBaseUrl({ appBaseUrl: './' })).resolves.toBe(
      'http://localhost/cad-data/'
    )
  })

  it('falls back to the CDN when the probe fails', async () => {
    mockFetch(() => Promise.reject(new Error('offline')))

    await expect(resolveCadDataBaseUrl({ appBaseUrl: './' })).resolves.toBe(
      `${CAD_DATA_CDN_BASE_URL}/`
    )
  })

  it('falls back to the CDN when the catalog returns a non-OK status', async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 404 }))

    await expect(resolveCadDataBaseUrl({ appBaseUrl: './' })).resolves.toBe(
      `${CAD_DATA_CDN_BASE_URL}/`
    )
  })

  it('probes the font catalog only once per base pair', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await resolveCadDataBaseUrl({ appBaseUrl: './' })
    await resolveCadDataBaseUrl({ appBaseUrl: './' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost/cad-data/fonts/fonts.json',
      expect.objectContaining({ signal: expect.anything() })
    )
  })

  it('skips the probe and returns the local base on request', async () => {
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(
      resolveCadDataBaseUrl({ appBaseUrl: './', skipProbe: true })
    ).resolves.toBe('http://localhost/cad-data/')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a CDN fallback override', async () => {
    mockFetch(() => Promise.reject(new Error('offline')))

    await expect(
      resolveCadDataBaseUrl({
        appBaseUrl: './',
        fallbackBaseUrl: 'https://mirror.example.com/cad-data'
      })
    ).resolves.toBe('https://mirror.example.com/cad-data/')
  })
})
