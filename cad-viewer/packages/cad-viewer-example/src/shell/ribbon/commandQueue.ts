/**
 * Queue for ribbon commands clicked while the shell blocks command execution.
 *
 * The host ribbon keeps every command button natively `disabled` while a
 * document is opening, and a natively disabled `<button>` never dispatches a
 * click event — so the first click after starting to open a large drawing is
 * silently swallowed. Instead the ribbon now renders the disabled look
 * (`is-disabled` + `aria-disabled`) while staying clickable: clicks reach the
 * command dispatch, land in this queue, and are replayed once the document
 * activates.
 *
 * Behaviour (mirrors the cad-tunnel-plugin design, lifted to the whole
 * ribbon so every command benefits):
 * - `enqueue` runs the command immediately when nothing is blocked;
 *   otherwise it stores the command (a `Set`, so repeated clicks on the
 *   same button only run once).
 * - `scheduleFlush` (bound to `documentActivated`) replays after a short
 *   delay so the host gets a beat to re-enable the ribbon, then retries at
 *   a fixed interval while still blocked, capped at `maxRetryAttempts`.
 * - `dropPending` (bound to `failed-to-open-file`) discards the queue so a
 *   queued command never runs against the wrong drawing.
 * - `bindListeners`/`unbindListeners` keep the lifecycle subscriptions
 *   attached only while something is pending.
 */
export interface CommandQueueHooks {
  /** True while commands must not run (document opening, shell disabled). */
  isBlocked: () => boolean
  /** Runs one command (e.g. `sendStringToExecute`). */
  execute: (command: string) => void
  /** Attaches the document-lifecycle listeners while the queue is busy. */
  bindListeners?: () => void
  /** Detaches the document-lifecycle listeners once the queue empties. */
  unbindListeners?: () => void
}

export interface CommandQueueOptions extends CommandQueueHooks {
  /** Delay after activation before the first flush attempt. */
  flushDelayMs?: number
  /** Interval between flush retries while still blocked. */
  retryIntervalMs?: number
  /** Maximum blocked flush attempts (~60s at the default 300ms interval). */
  maxRetryAttempts?: number
}

const DEFAULT_FLUSH_DELAY_MS = 150
const DEFAULT_RETRY_INTERVAL_MS = 300
const DEFAULT_MAX_RETRY_ATTEMPTS = 200

export class CommandQueue {
  private readonly pending = new Set<string>()
  private readonly hooks: CommandQueueHooks
  private readonly flushDelayMs: number
  private readonly retryIntervalMs: number
  private readonly maxRetryAttempts: number

  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempts = 0

  constructor(options: CommandQueueOptions) {
    this.hooks = options
    this.flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
    this.maxRetryAttempts =
      options.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS
  }

  /** Number of commands currently waiting for a flush. */
  get size(): number {
    return this.pending.size
  }

  /**
   * Runs the command immediately when nothing is blocked; otherwise queues
   * it for replay. Returns true when the command was newly queued (false for
   * duplicates and for immediate execution) so callers can give feedback
   * only when a click actually starts waiting.
   */
  enqueue(command: string): boolean {
    if (this.hooks.isBlocked()) {
      const newlyAdded = !this.pending.has(command)
      this.pending.add(command)
      if (newlyAdded && this.pending.size === 1) this.hooks.bindListeners?.()
      return newlyAdded
    }
    this.hooks.execute(command)
    return false
  }

  /**
   * Lifecycle hook (document activated, or the block condition changed):
   * schedules a flush after a short delay, resetting any retry backoff.
   */
  scheduleFlush(): void {
    if (this.pending.size === 0) return
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.retryAttempts = 0
    this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs)
  }

  /** Lifecycle hook (open failed): discards every pending command. */
  dropPending(): void {
    this.clear()
  }

  /** Releases timers and lifecycle listeners; the queue becomes unusable. */
  dispose(): void {
    this.clear()
  }

  private flush(): void {
    this.flushTimer = null
    if (this.pending.size === 0) return

    if (this.hooks.isBlocked()) {
      if (this.retryAttempts >= this.maxRetryAttempts) {
        this.clear()
        return
      }
      this.retryAttempts += 1
      this.retryTimer = setTimeout(() => this.flush(), this.retryIntervalMs)
      return
    }

    for (const command of this.pending) {
      this.hooks.execute(command)
    }
    this.clear()
  }

  private clear(): void {
    this.pending.clear()
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.hooks.unbindListeners?.()
  }
}
