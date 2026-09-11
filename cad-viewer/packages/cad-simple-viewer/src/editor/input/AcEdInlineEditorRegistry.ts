/**
 * Registry for cancelling whatever inline editor is currently open.
 *
 * The MTEXT input box is a browser-side widget that `AcEdCommandStack` and
 * `AcApDocManager` must be able to dismiss without importing the widget (and its
 * DOM/WebGL dependencies) themselves. `AcEdMTextEditor` registers a closer when
 * its module loads; callers go through {@link closeActiveInlineEditor}.
 *
 * Keeping the registry dependency-free also keeps command-stack and document
 * unit tests from pulling the input box module into their module graph.
 */

/** Closes the open inline editor; returns `true` when it asked one to close. */
export type AcEdInlineEditorCloser = () => boolean

let activeCloser: AcEdInlineEditorCloser | null = null

/**
 * Registers (or clears) the closer for the inline editor.
 *
 * @param closer - Closer implementation, or `null` to unregister.
 */
export function registerInlineEditorCloser(
  closer: AcEdInlineEditorCloser | null
): void {
  activeCloser = closer
}

/**
 * Closes the inline editor that is currently open, if any.
 *
 * @returns `true` when a closer was registered and reported a closed editor.
 */
export function closeActiveInlineEditor(): boolean {
  return activeCloser ? activeCloser() : false
}
