import { CommandQueue } from '../src/shell/ribbon/commandQueue'

describe('CommandQueue', () => {
  let blocked: boolean
  let executed: string[]
  let bindCount: number
  let unbindCount: number

  const hooks = () => ({
    isBlocked: () => blocked,
    execute: (command: string) => {
      executed.push(command)
    },
    bindListeners: () => {
      bindCount += 1
    },
    unbindListeners: () => {
      unbindCount += 1
    }
  })

  beforeEach(() => {
    jest.useFakeTimers()
    blocked = true
    executed = []
    bindCount = 0
    unbindCount = 0
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('executes immediately when nothing is blocked', () => {
    blocked = false
    const queue = new CommandQueue(hooks())
    expect(queue.enqueue('drawtunnel')).toBe(false)
    expect(executed).toEqual(['drawtunnel'])
    expect(bindCount).toBe(0)
  })

  it('queues when blocked and dedupes repeated clicks of one command', () => {
    const queue = new CommandQueue(hooks())
    expect(queue.enqueue('drawtunnel')).toBe(true)
    expect(queue.enqueue('drawtunnel')).toBe(false)
    expect(queue.enqueue('drawtunnel')).toBe(false)
    expect(queue.size).toBe(1)
    // Listeners are attached only when pending went 0 → 1.
    expect(bindCount).toBe(1)
    expect(unbindCount).toBe(0)
  })

  it('replays pending commands after scheduleFlush, then unbinds', () => {
    const queue = new CommandQueue(hooks())
    queue.enqueue('drawtunnel')
    queue.enqueue('tunnelclear')
    queue.scheduleFlush()
    expect(executed).toEqual([])

    blocked = false
    jest.advanceTimersByTime(150)
    expect(executed).toEqual(['drawtunnel', 'tunnelclear'])
    expect(unbindCount).toBe(1)
  })

  it('retries at the retry interval while still blocked', () => {
    const queue = new CommandQueue({ ...hooks(), retryIntervalMs: 300 })
    queue.enqueue('drawtunnel')
    queue.scheduleFlush()

    jest.advanceTimersByTime(150) // first attempt: still blocked
    expect(executed).toEqual([])
    jest.advanceTimersByTime(300) // second attempt: still blocked
    expect(executed).toEqual([])

    blocked = false
    jest.advanceTimersByTime(300) // third attempt: runs
    expect(executed).toEqual(['drawtunnel'])
  })

  it('gives up after maxRetryAttempts and unbinds', () => {
    const queue = new CommandQueue({
      ...hooks(),
      retryIntervalMs: 300,
      maxRetryAttempts: 2
    })
    queue.enqueue('drawtunnel')
    queue.scheduleFlush()

    jest.advanceTimersByTime(150) // attempt 1
    jest.advanceTimersByTime(300) // attempt 2
    jest.advanceTimersByTime(300) // over cap → dropped
    expect(executed).toEqual([])
    expect(queue.size).toBe(0)
    expect(unbindCount).toBe(1)
  })

  it('drops every pending command on dropPending and unbinds', () => {
    const queue = new CommandQueue(hooks())
    queue.enqueue('drawtunnel')
    queue.enqueue('tunnelclear')
    queue.dropPending()

    expect(queue.size).toBe(0)
    expect(unbindCount).toBe(1)

    queue.scheduleFlush()
    jest.advanceTimersByTime(1000)
    expect(executed).toEqual([])
  })

  it('dispose clears pending commands, timers and listeners', () => {
    const queue = new CommandQueue(hooks())
    queue.enqueue('drawtunnel')
    queue.dispose()

    expect(queue.size).toBe(0)
    expect(unbindCount).toBe(1)

    jest.advanceTimersByTime(10000)
    expect(executed).toEqual([])
  })

  it('keeps the queue busy across a flush retry and a new activation', () => {
    const queue = new CommandQueue({ ...hooks(), retryIntervalMs: 300 })
    queue.enqueue('drawtunnel')
    queue.scheduleFlush()

    jest.advanceTimersByTime(150) // attempt 1: blocked, retry pending
    queue.scheduleFlush() // a second activation resets the backoff
    expect(executed).toEqual([])

    blocked = false
    jest.advanceTimersByTime(150) // reset flush runs immediately
    expect(executed).toEqual(['drawtunnel'])
    expect(unbindCount).toBe(1)
  })
})
