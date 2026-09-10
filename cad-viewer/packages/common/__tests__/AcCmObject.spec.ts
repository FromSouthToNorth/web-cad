import { AcCmAttributes, AcCmEventManager, AcCmObject } from '../src'

interface ObjectAttrs extends AcCmAttributes {
  attr1: number
  attr2?: string
}

describe('Test AcCmObject', () => {
  it('constructs instance correctly', () => {
    const attrs: ObjectAttrs = {
      attr1: 1,
      attr2: 'test'
    }
    const defaults: ObjectAttrs = {
      attr1: 2,
      attr2: 'another test'
    }

    const object = new AcCmObject(attrs, defaults)
    expect(object.get('attr1')).toBe(1)
    expect(object.get('attr2')).toBe('test')
    expect(object.has('attr1')).toBeTruthy()
    expect(object.has('attr2')).toBeTruthy()
    expect(object.hasChanged()).toBe(false)
    expect(object.hasChanged('attr1')).toBe(false)
    expect(object.hasChanged('attr2')).toBe(false)
    expect(object.changed).toEqual({})
    expect(object.previous('attr1')).toBeUndefined()
    expect(object.previous('attr2')).toBeUndefined()
    expect(object.previousAttributes()).toEqual({})
  })

  it('constructs instance with default values correctly', () => {
    const attrs: ObjectAttrs = {
      attr1: 1
    }
    const defaults: ObjectAttrs = {
      attr1: 2,
      attr2: 'test'
    }
    const object = new AcCmObject(attrs, defaults)
    expect(object.get('attr1')).toBe(1)
    expect(object.get('attr2')).toBe('test')
  })

  it('records changes correctly', () => {
    const attrs: ObjectAttrs = {
      attr1: 1,
      attr2: 'test'
    }
    const object = new AcCmObject(attrs)
    // `changed` bookkeeping is only maintained while something observes the
    // object, so register an observer to exercise the tracked path.
    object.events.attrChanged.addEventListener(jest.fn())

    object.set('attr1', 2)
    expect(object.get('attr1')).toBe(2)
    expect(object.get('attr2')).toBe('test')
    expect(object.hasChanged()).toBe(true)
    expect(object.hasChanged('attr1')).toBe(true)
    expect(object.hasChanged('attr2')).toBe(false)
    expect(object.changed.attr1).toEqual(2)
    expect(object.changed.attr2).toBeUndefined()
    expect(object.previous('attr1')).toBe(1)
    expect(object.previous('attr2')).toBe('test')
    expect(object.previousAttributes().attr1).toEqual(1)
    expect(object.previousAttributes().attr2).toEqual('test')

    const untouched = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'x' })
    untouched.events.attrChanged.addEventListener(jest.fn())
    untouched.set('attr1', 1)
    expect(untouched.changed.attr1).toBeUndefined()
  })

  it('triggers events correctly after modified attributes', () => {
    const attrs: ObjectAttrs = {
      attr1: 1,
      attr2: 'test'
    }
    const object = new AcCmObject(attrs)
    object.events.modelChanged.addEventListener(args => {
      expect(args.object.get('attr1')).toBe(2)
      expect(args.object.get('attr2')).toBe('test')
    })
    object.events.attrChanged.addEventListener(args => {
      expect(args.attrName).toBe('attr1')
      expect(args.attrValue).toBe(2)
    })
    object.set('attr1', 2)
    expect(object.get('attr1')).toBe(2)
  })

  it('supports set overloads/unset/silent and changedAttributes diff', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'x' })
    object.events.attrChanged.addEventListener(jest.fn())

    expect(object.set(null as unknown as Partial<ObjectAttrs>)).toBe(object)

    object.set({ attr1: 2 }, { silent: true })
    expect(object.hasChanged('attr1')).toBe(true)

    object.set('attr2', undefined, { unset: true })
    expect(object.has('attr2')).toBe(false)

    const diff = object.changedAttributes({ attr1: 2, attr2: 'y' })
    expect(diff).toEqual({ attr2: 'y' })
    expect(object.previous(null as unknown as 'attr1')).toBeNull()
  })

  it('clones object correctly', () => {
    const attrs: ObjectAttrs = {
      attr1: 1,
      attr2: 'test'
    }
    const originalObject = new AcCmObject(attrs)

    const clonedObject = originalObject.clone()
    expect(clonedObject.get('attr1')).toBe(1)
    expect(clonedObject.get('attr2')).toBe('test')

    originalObject.set('attr1', 2)
    expect(originalObject.get('attr1')).toBe(2)
    expect(clonedObject.get('attr1')).toBe(1)
  })

  it('no-op sets keep session bookkeeping but dispatch nothing', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'test' })
    const onAttrChanged = jest.fn()
    const onModelChanged = jest.fn()
    object.events.attrChanged.addEventListener(onAttrChanged)
    object.events.modelChanged.addEventListener(onModelChanged)

    object.set('attr1', 1)
    expect(object.changed).toEqual({})
    expect(object.previousAttributes()).toEqual({ attr1: 1, attr2: 'test' })
    expect(onAttrChanged).not.toHaveBeenCalled()
    expect(onModelChanged).not.toHaveBeenCalled()

    object.set({ attr1: 1, attr2: 'test' })
    expect(object.changed).toEqual({})
    expect(onAttrChanged).not.toHaveBeenCalled()
    expect(onModelChanged).not.toHaveBeenCalled()

    // A later real change must still diff against the no-op snapshot.
    object.set('attr1', 2)
    expect(object.changed.attr1).toEqual(2)
    expect(object.previous('attr1')).toBe(1)
  })

  it('no-op sets reset the previous change snapshot like a real set', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1 })
    object.events.attrChanged.addEventListener(jest.fn())
    object.set('attr1', 2)
    expect(object.hasChanged()).toBe(true)
    object.set('attr1', 2) // no-op: resets the session
    expect(object.hasChanged()).toBe(false)
    expect(object.previous('attr1')).toBe(2)
  })

  it('nested no-op sets inside change handlers do not re-dispatch', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1 })
    const onAttrChanged = jest.fn(() => {
      // Re-setting the same value mid-session must not recurse or dispatch.
      object.set('attr1', 2)
    })
    object.events.attrChanged.addEventListener(onAttrChanged)
    object.set('attr1', 2)
    expect(onAttrChanged).toHaveBeenCalledTimes(1)
    expect(object.changed.attr1).toEqual(2)
  })

  it('mixed object-form sets skip unchanged keys in the walk', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'test' })
    const onAttrChanged = jest.fn()
    object.events.attrChanged.addEventListener(onAttrChanged)
    object.set({ attr1: 1, attr2: 'y' })
    expect(object.changed).toEqual({ attr2: 'y' })
    expect(onAttrChanged).toHaveBeenCalledTimes(1)
    expect(onAttrChanged.mock.calls[0][0].attrName).toBe('attr2')
  })

  it('writes values without change bookkeeping while no listener observes it', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'test' })

    // Single-key form: the value is written, `changed` / `previous()` are not.
    object.set('attr1', 2)
    expect(object.get('attr1')).toBe(2)
    expect(object.hasChanged()).toBe(false)
    expect(object.hasChanged('attr1')).toBe(false)
    expect(object.changedAttributes()).toEqual({})
    expect(object.previous('attr1')).toBeUndefined()
    expect(object.previousAttributes()).toEqual({})

    // Object form.
    object.set({ attr1: 1, attr2: 'y' })
    expect(object.get('attr1')).toBe(1)
    expect(object.get('attr2')).toBe('y')
    expect(object.hasChanged()).toBe(false)

    // `silent` is indistinguishable when nothing listens either.
    object.set('attr1', 5, { silent: true })
    expect(object.get('attr1')).toBe(5)
    expect(object.hasChanged('attr1')).toBe(false)

    // Registering an observer switches the very next write back to the
    // tracked contract, using the current values as the new baseline.
    const listener = jest.fn()
    object.events.attrChanged.addEventListener(listener)
    object.set('attr1', 7)
    expect(object.hasChanged('attr1')).toBe(true)
    expect(object.changed.attr1).toBe(7)
    expect(object.previous('attr1')).toBe(5)
    expect(listener).toHaveBeenCalledTimes(1)

    // Removing it restores the untracked path; the last tracked write stays
    // visible in `changed`.
    object.events.attrChanged.removeEventListener(listener)
    expect(object.events.attrChanged.listenerCount).toBe(0)
    object.set('attr1', 8)
    expect(object.get('attr1')).toBe(8)
    expect(object.hasChanged('attr1')).toBe(true)
    expect(object.changed.attr1).toBe(7)

    // Either manager having an observer is enough to keep tracking.
    const modelListener = jest.fn()
    object.events.modelChanged.addEventListener(modelListener)
    object.set('attr1', 9)
    expect(object.changed.attr1).toBe(9)
    expect(object.previous('attr1')).toBe(8)
    expect(modelListener).toHaveBeenCalledTimes(1)
  })

  it('allocates the event managers and change containers lazily', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'test' })
    const ownKeys = () => Object.getOwnPropertyNames(object)

    // Zero-listener writes take the untracked fast path and materialize none
    // of the per-instance bookkeeping containers.
    object.set('attr1', 2)
    expect(ownKeys()).not.toContain('_events')
    expect(ownKeys()).not.toContain('_changed')
    expect(ownKeys()).not.toContain('_previousAttributes')
    // The eager implementation stored both as own data properties; the lazy one
    // exposes them through prototype accessors instead.
    expect(ownKeys()).not.toContain('events')
    expect(ownKeys()).not.toContain('changed')

    // Reading `changed` materializes an empty container but must not turn the
    // object into an observed (tracked) one.
    expect(object.changed).toEqual({})
    expect(ownKeys()).toContain('_changed')
    expect(ownKeys()).not.toContain('_events')
    object.set('attr1', 3)
    expect(object.hasChanged()).toBe(false)

    // `unset` goes through the tracked code path, but its dispatch site must
    // still not allocate the managers while nobody listens.
    object.set('attr1', undefined, { unset: true })
    expect(ownKeys()).not.toContain('_events')

    // Subscribing materializes the managers and restores tracked dispatch.
    const onAttrChanged = jest.fn()
    object.events.attrChanged.addEventListener(onAttrChanged)
    expect(ownKeys()).toContain('_events')
    object.set('attr1', 4)
    expect(object.changed).toEqual({ attr1: 4 })
    expect(onAttrChanged).toHaveBeenCalledTimes(1)
    expect(onAttrChanged.mock.calls[0][0].attrName).toBe('attr1')
  })

  it('keeps the legacy tracked bookkeeping and dispatch once a listener is registered', () => {
    const object = new AcCmObject<ObjectAttrs>({ attr1: 1, attr2: 'test' })
    const onAttrChanged = jest.fn()
    const onModelChanged = jest.fn()
    object.events.attrChanged.addEventListener(onAttrChanged)
    object.events.modelChanged.addEventListener(onModelChanged)

    // Golden snapshots captured from the pre-fast-path (fully tracked)
    // implementation for the exact same call sequence.
    const golden = [
      {
        attributes: { attr1: 1, attr2: 'test' },
        changed: {},
        previousAttributes: { attr1: 1, attr2: 'test' },
        hasChanged: false
      },
      {
        attributes: { attr1: 2, attr2: 'test' },
        changed: { attr1: 2 },
        previousAttributes: { attr1: 1, attr2: 'test' },
        hasChanged: true
      },
      {
        attributes: { attr1: 3, attr2: 'test' },
        changed: { attr1: 3 },
        previousAttributes: { attr1: 2, attr2: 'test' },
        hasChanged: true
      },
      {
        attributes: { attr2: 'test' },
        changed: { attr1: undefined },
        previousAttributes: { attr1: 3, attr2: 'test' },
        hasChanged: true
      },
      {
        attributes: { attr2: 'x' },
        changed: { attr2: 'x' },
        previousAttributes: { attr2: 'test' },
        hasChanged: true
      },
      {
        attributes: { attr2: 'x', attr1: 9 },
        changed: { attr1: 9 },
        previousAttributes: { attr2: 'x' },
        hasChanged: true
      }
    ]

    const steps: Array<() => void> = [
      () => object.set('attr1', 1),
      () => object.set('attr1', 2),
      () => object.set({ attr1: 3, attr2: 'test' }),
      () => object.set('attr1', undefined, { unset: true }),
      () => object.set('attr2', 'x', { silent: true }),
      () => object.set({ attr1: 9 })
    ]

    steps.forEach((step, index) => {
      step()
      expect({
        attributes: object.attributes,
        changed: object.changed,
        previousAttributes: object.previousAttributes(),
        hasChanged: object.hasChanged()
      }).toStrictEqual(golden[index])
    })

    // Step 1 is a no-op and step 5 is silent, so 4 dispatches of each event.
    expect(onAttrChanged).toHaveBeenCalledTimes(4)
    expect(onModelChanged).toHaveBeenCalledTimes(4)
    expect(
      onAttrChanged.mock.calls.map(call => [
        call[0].attrName,
        call[0].attrValue
      ])
    ).toEqual([
      ['attr1', 2],
      ['attr1', 3],
      ['attr1', undefined],
      ['attr1', 9]
    ])
  })

  it('exposes the observer count through AcCmEventManager.listenerCount', () => {
    const manager = new AcCmEventManager<number>()
    expect(manager.listenerCount).toBe(0)

    const listener = jest.fn()
    manager.addEventListener(listener)
    expect(manager.listenerCount).toBe(1)
    manager.dispatch(1)
    expect(listener).toHaveBeenCalledWith(1)

    manager.removeEventListener(listener)
    expect(manager.listenerCount).toBe(0)
  })
})
