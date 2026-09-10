import {
  AcApDocManager,
  type AcApDocument,
  type AcEdEvents,
  eventBus
} from '@hy/cad-simple-viewer'

/** Poll interval while waiting for the current document to appear. */
const POLL_INTERVAL_MS = 200

/**
 * Waits until `AcApDocManager.instance.curDocument` is available.
 *
 * Commands can be dispatched (ribbon, command line) before the document
 * finishes opening — the plugin registers asynchronously, and clicks can
 * land while the host is still creating/activating the document. Polling
 * here lets the command survive that window instead of failing once with
 * "no document".
 *
 * Resolves with the document as soon as it appears, with `null` when:
 * - the open attempt fails (`failed-to-open-file` is emitted), or
 * - `timeoutMs` elapses without a document.
 *
 * Only the `null` result should lead to the caller's "no document" error
 * path.
 *
 * @param timeoutMs - Upper bound for the wait (default 60s).
 */
export async function waitForCurrentDocument(
  timeoutMs = 60000
): Promise<AcApDocument | null> {
  const manager = AcApDocManager.instance
  const current = manager.curDocument as AcApDocument | null
  if (current) return current

  return new Promise<AcApDocument | null>(resolve => {
    let settled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    const onFailedToOpen = (_args: AcEdEvents['failed-to-open-file']) => {
      finish(null)
    }

    const finish = (doc: AcApDocument | null) => {
      if (settled) return
      settled = true
      if (pollTimer) clearInterval(pollTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      eventBus.off('failed-to-open-file', onFailedToOpen)
      resolve(doc)
    }

    eventBus.on('failed-to-open-file', onFailedToOpen)
    pollTimer = setInterval(() => {
      const doc = manager.curDocument as AcApDocument | null
      if (doc) finish(doc)
    }, POLL_INTERVAL_MS)
    timeoutTimer = setTimeout(() => finish(null), timeoutMs)
  })
}
