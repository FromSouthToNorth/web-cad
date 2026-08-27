/** Callback that opens or focuses the search tab in the host tool palette. */
export type SearchPaletteOpener = () => void

/** Palette opener registered by cad-viewer at startup. */
let paletteOpener: SearchPaletteOpener | undefined

/**
 * Registers the function cad-viewer calls when the `search` command runs.
 *
 * @param opener - Palette opener, or `undefined` to clear the registration.
 */
export function setSearchPaletteOpener(opener: SearchPaletteOpener | undefined) {
  paletteOpener = opener
}

/**
 * Invokes the registered palette opener.
 *
 * @returns `true` if an opener was registered and called; otherwise `false`.
 */
export function openSearchPalette(): boolean {
  if (!paletteOpener) {
    return false
  }
  paletteOpener()
  return true
}
