/**
 * P1-7 (2): `AcTrLayout._entityLayerIndex` keeps a bare `AcTrLayer` while an
 * entity lives on a single render layer and only promotes the entry to an array
 * from the second layer on.
 *
 * These tests lock both the representation and every observable behavior that
 * depends on it (has/remove/visibility/highlight/freeze), across the 0-, 1- and
 * 2-layer cardinalities. The old implementation used a one-element array for
 * every entity, so the same scenario must produce the same routed calls.
 */
jest.mock('@hy/three-renderer', () => {
  const THREE = require('three')
  return {
    AcTrBatchedGroup: jest.fn().mockImplementation(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const group: any = new THREE.Group()
      group.ids = new Set<string>()
      group.visibleById = new Map<string, boolean>()
      group.addEntity = (entity: any) => {
        group.ids.add(entity.objectId)
      }
      group.hasEntity = (id: string) => group.ids.has(id)
      group.removeEntity = (id: string) => group.ids.delete(id)
      group.setEntityVisible = (id: string, visible: boolean) => {
        if (!group.ids.has(id)) return false
        group.visibleById.set(id, visible)
        return true
      }
      group.getEntityVisible = (id: string) =>
        group.ids.has(id) ? (group.visibleById.get(id) ?? true) : undefined
      group.isIntersectWith = () => false
      group.highlightCalls = [] as string[]
      const record = (kind: string) => (ids: string | string[]) => {
        const list = Array.isArray(ids) ? ids : [ids]
        for (const id of list) group.highlightCalls.push(`${kind}:${id}`)
      }
      group.select = record('select')
      group.unselect = record('unselect')
      group.hover = record('hover')
      group.unhover = record('unhover')
      group.selectMany = record('selectMany')
      group.unselectMany = record('unselectMany')
      group.hoverMany = record('hoverMany')
      group.unhoverMany = record('unhoverMany')
      group.clear = () => group.ids.clear()
      group.computeBoundingBox = (target: any) => {
        target.makeEmpty()
        return target
      }
      group.appendLineGeometry = () => false
      group.appendLine2Geometry = () => false
      group.appendPointGeometry = () => false
      group.appendMeshGeometry = () => false
      group.createPreviewSubset = () => null
      Object.defineProperty(group, 'entityCount', {
        get: () => group.ids.size
      })
      return group
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }),
    AcTrEntityPreview: { box3ToBounds2d: jest.fn() },
    AcTrGroup: class AcTrGroup {},
    disposePreviewSubset: jest.fn()
  }
})

import { AcCmColor, AcGeBox2d } from '@hy/data-model'
import type { AcTrEntity } from '@hy/three-renderer'
import * as THREE from 'three'

import { AcTrLayout } from '../src/view/AcTrLayout'
import type { AcTrLayer } from '../src/view/AcTrLayer'

function createLayerInfo(name: string) {
  return {
    name,
    isFrozen: false,
    isOff: false,
    color: new AcCmColor()
  }
}

function createEntity(objectId: string, layerName: string): AcTrEntity {
  return {
    objectId,
    layerName,
    ownerId: 'layout-1',
    visible: true,
    userData: {},
    wcsBbox: new THREE.Box3(
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(2, 2, 0)
    )
  } as unknown as AcTrEntity
}

/** Raw reverse-index record, used to lock the stored representation. */
function rawRecord(layout: AcTrLayout, objectId: string) {
  const index = (
    layout as unknown as {
      _entityLayerIndex: Map<string, AcTrLayer | AcTrLayer[]>
    }
  )._entityLayerIndex
  return index.get(objectId)
}

/** Layers in the order the previous array-based implementation would visit. */
function rawLayers(layout: AcTrLayout, objectId: string): AcTrLayer[] {
  const record = rawRecord(layout, objectId)
  if (record === undefined) return []
  return Array.isArray(record) ? record : [record]
}

/** Mock batched group behind one layer, used to observe routed calls. */
function groupOf(layer: AcTrLayer) {
  return (
    layer as unknown as {
      _group: { highlightCalls: string[]; ids: Set<string> }
    }
  )._group
}

function createLayout(...names: string[]) {
  const layout = new AcTrLayout()
  for (const name of names) {
    layout.addLayer(createLayerInfo(name))
  }
  return layout
}

describe('AcTrLayout entity-layer reverse index', () => {
  it('stores nothing for an unknown entity (0 layers)', () => {
    const layout = createLayout('L0', 'L1')

    expect(rawRecord(layout, 'ghost')).toBeUndefined()
    expect(rawLayers(layout, 'ghost')).toEqual([])
    expect(layout.hasEntity('ghost')).toBe(false)
    expect(layout.hasVisibleEntity('ghost')).toBe(false)
    expect(layout.getEntityVisible('ghost')).toBeUndefined()
    expect(layout.removeEntity('ghost')).toBe(false)
    expect(() => layout.select(['ghost'])).not.toThrow()
    expect(() => layout.hover(['ghost'])).not.toThrow()
    expect(() => layout.unselect(['ghost'])).not.toThrow()
    expect(layout.isIntersectWith('ghost', new THREE.Raycaster())).toBe(false)
  })

  it('answers the same spatial range query for 0, 1 and 2 layers', () => {
    const layout = createLayout('L0', 'L1')
    const hitBox = new AcGeBox2d().set({ x: 0, y: 0 }, { x: 3, y: 3 })
    const missBox = new AcGeBox2d().set({ x: 50, y: 50 }, { x: 60, y: 60 })

    // 0 layers: unknown id can never be returned.
    expect(layout.search(hitBox)).toEqual([])

    // 1 layer.
    layout.addEntity(createEntity('e1', 'L0'))
    expect(layout.search(hitBox).map(hit => hit.id)).toEqual(['e1'])
    expect(layout.search(missBox)).toEqual([])

    // 2 layers: one object id must stay one hit even though two buckets
    // registered the same id in the root index.
    layout.addEntity(createEntity('insert-a', 'L0'))
    layout.addEntity(createEntity('insert-a', 'L1'))
    const hits = layout.search(hitBox)
    expect(hits.map(hit => hit.id).sort()).toEqual(['e1', 'insert-a'])
    expect(hits.filter(hit => hit.id === 'insert-a')).toHaveLength(1)
  })

  it('stores a bare layer for a one-layer entity and routes every read to it', () => {
    const layout = createLayout('L0', 'L1')
    const l0 = layout.getLayer('L0')!
    const l1 = layout.getLayer('L1')!

    layout.addEntity(createEntity('e1', 'L0'))

    const record = rawRecord(layout, 'e1')
    expect(record).not.toBeUndefined()
    expect(Array.isArray(record)).toBe(false)
    expect(record).toBe(l0)
    expect(rawLayers(layout, 'e1')).toEqual([l0])

    layout.select(['e1'])
    expect(groupOf(l0).highlightCalls).toEqual(['select:e1'])
    expect(groupOf(l1).highlightCalls).toEqual([])

    expect(layout.hasEntity('e1')).toBe(true)
    expect(layout.hasVisibleEntity('e1')).toBe(true)
    expect(layout.getEntityVisible('e1')).toBe(true)

    const l0Remove = jest.spyOn(l0, 'removeEntity')
    expect(layout.removeEntity('e1')).toBe(true)
    expect(l0Remove).toHaveBeenCalledWith('e1')
    expect(rawRecord(layout, 'e1')).toBeUndefined()
    expect(layout.hasEntity('e1')).toBe(false)
  })

  it('promotes to an array for a two-layer entity and visits every layer in order', () => {
    const layout = createLayout('L0', 'L1', 'L2')
    const l0 = layout.getLayer('L0')!
    const l1 = layout.getLayer('L1')!
    const l2 = layout.getLayer('L2')!

    layout.addEntity(createEntity('insert-a', 'L0'))
    layout.addEntity(createEntity('insert-a', 'L1'))

    const record = rawRecord(layout, 'insert-a')
    expect(Array.isArray(record)).toBe(true)
    expect(record).toEqual([l0, l1])
    expect(rawLayers(layout, 'insert-a')).toEqual([l0, l1])

    // Highlight must reach both buckets, in stored order.
    layout.select(['insert-a'])
    expect(groupOf(l0).highlightCalls).toEqual(['select:insert-a'])
    expect(groupOf(l1).highlightCalls).toEqual(['select:insert-a'])
    expect(groupOf(l2).highlightCalls).toEqual([])

    expect(layout.hasEntity('insert-a')).toBe(true)
    expect(layout.hasVisibleEntity('insert-a')).toBe(true)

    // Layer-level visibility still resolves through the same reverse index:
    // `some()` semantics, so one visible bucket is enough.
    layout.updateLayer({ ...createLayerInfo('L1'), isOff: true })
    expect(layout.hasVisibleEntity('insert-a')).toBe(true)
    layout.updateLayer({ ...createLayerInfo('L0'), isOff: true })
    expect(layout.hasVisibleEntity('insert-a')).toBe(false)
    layout.updateLayer(createLayerInfo('L0'))
    layout.updateLayer(createLayerInfo('L1'))
    expect(layout.hasVisibleEntity('insert-a')).toBe(true)

    // Entity visibility toggles reach both buckets.
    expect(layout.setEntityVisible('insert-a', false)).toBe(true)
    expect(groupOf(l0).ids.has('insert-a')).toBe(true)
    expect(groupOf(l1).ids.has('insert-a')).toBe(true)

    const l0Remove = jest.spyOn(l0, 'removeEntity')
    const l1Remove = jest.spyOn(l1, 'removeEntity')
    expect(layout.removeEntity('insert-a')).toBe(true)
    expect(l0Remove).toHaveBeenCalledWith('insert-a')
    expect(l1Remove).toHaveBeenCalledWith('insert-a')
    expect(groupOf(l0).ids.has('insert-a')).toBe(false)
    expect(groupOf(l1).ids.has('insert-a')).toBe(false)
    expect(rawRecord(layout, 'insert-a')).toBeUndefined()
    expect(layout.hasEntity('insert-a')).toBe(false)
  })

  it('does not duplicate an entry when the same layer is added twice', () => {
    const layout = createLayout('L0')
    const l0 = layout.getLayer('L0')!

    layout.addEntity(createEntity('insert-a', 'L0'))
    layout.addEntity(createEntity('insert-a', 'L0'))

    expect(rawRecord(layout, 'insert-a')).toBe(l0)
    expect(rawLayers(layout, 'insert-a')).toEqual([l0])
  })

  it('keeps promotion order across three layers', () => {
    const layout = createLayout('L0', 'L1', 'L2')
    const l0 = layout.getLayer('L0')!
    const l1 = layout.getLayer('L1')!
    const l2 = layout.getLayer('L2')!

    layout.addEntity(createEntity('insert-a', 'L2'))
    layout.addEntity(createEntity('insert-a', 'L0'))
    layout.addEntity(createEntity('insert-a', 'L1'))

    expect(rawRecord(layout, 'insert-a')).toEqual([l2, l0, l1])

    const seen: string[] = []
    for (const layer of rawLayers(layout, 'insert-a')) {
      seen.push(layer.name)
    }
    expect(seen).toEqual(['L2', 'L0', 'L1'])
  })

  it('collapses the entry back to a bare layer when only one layer remains', () => {
    const layout = createLayout('L0', 'L1')
    const l0 = layout.getLayer('L0')!
    const l1 = layout.getLayer('L1')!

    layout.addEntity(createEntity('insert-a', 'L0'))
    layout.addEntity(createEntity('insert-a', 'L1'))
    expect(Array.isArray(rawRecord(layout, 'insert-a'))).toBe(true)

    // Only L1 still holds the entity, so the rebuild must not keep a
    // two-element array around.
    jest.spyOn(l0, 'hasEntity').mockImplementation(id => id !== 'insert-a')
    jest.spyOn(l1, 'hasEntity').mockReturnValue(true)
    jest.spyOn(l0, 'removeEntity').mockImplementation(() => false)
    jest.spyOn(l1, 'removeEntity').mockReturnValue(true)

    expect(layout.updateEntity(createEntity('insert-a', 'L0'))).toBe(true)
    expect(rawRecord(layout, 'insert-a')).toBe(l1)
    expect(rawLayers(layout, 'insert-a')).toEqual([l1])
  })

  it('drops the entry when a successful update leaves no layer holding it', () => {
    const layout = createLayout('L0')
    const l0 = layout.getLayer('L0')!

    layout.addEntity(createEntity('e1', 'L0'))
    jest.spyOn(l0, 'updateEntity').mockReturnValue(true)
    jest.spyOn(l0, 'hasEntity').mockReturnValue(false)

    expect(layout.updateEntity(createEntity('e1', 'L0'))).toBe(true)
    expect(rawRecord(layout, 'e1')).toBeUndefined()
    expect(layout.hasEntity('e1')).toBe(false)
  })

  it('leaves the reverse index untouched when no layer accepts the update', () => {
    const layout = createLayout('L0')
    const l0 = layout.getLayer('L0')!

    layout.addEntity(createEntity('e1', 'L0'))
    jest.spyOn(l0, 'updateEntity').mockReturnValue(false)

    // Matches the previous implementation: a rejected update returns early and
    // never rebuilds the reverse entry.
    expect(layout.updateEntity(createEntity('e1', 'L0'))).toBe(false)
    expect(rawRecord(layout, 'e1')).toBe(l0)
    expect(layout.hasEntity('e1')).toBe(true)
  })

  it('routes insert-layer freeze to the other-layer buckets in either add order', () => {
    // INSERT layer stored first.
    const first = createLayout('Wall', 'DIM')
    const firstWall = first.getLayer('Wall')!
    const firstDim = first.getLayer('DIM')!
    const wallA = createEntity('insert-a', 'Wall')
    wallA.userData.insertLayerName = 'Wall'
    const dimA = createEntity('insert-a', 'DIM')
    dimA.userData.insertLayerName = 'Wall'
    first.addEntity(wallA)
    first.addEntity(dimA)
    jest.spyOn(firstWall, 'hasEntity').mockReturnValue(true)
    jest.spyOn(firstDim, 'hasEntity').mockReturnValue(true)
    jest.spyOn(firstWall, 'setEntityVisible').mockReturnValue(true)
    const firstDimSet = jest
      .spyOn(firstDim, 'setEntityVisible')
      .mockReturnValue(true)

    expect(first.applyInsertLayerFreeze('Wall', true)).toEqual(['insert-a'])
    expect(firstDimSet).toHaveBeenCalledWith('insert-a', false)

    // INSERT layer stored second (the other bucket is the bare/first entry).
    const second = createLayout('Wall', 'DIM')
    const secondWall = second.getLayer('Wall')!
    const secondDim = second.getLayer('DIM')!
    const dimB = createEntity('insert-b', 'DIM')
    dimB.userData.insertLayerName = 'Wall'
    const wallB = createEntity('insert-b', 'Wall')
    wallB.userData.insertLayerName = 'Wall'
    second.addEntity(dimB)
    second.addEntity(wallB)
    expect(Array.isArray(rawRecord(second, 'insert-b'))).toBe(true)
    jest.spyOn(secondWall, 'hasEntity').mockReturnValue(true)
    jest.spyOn(secondDim, 'hasEntity').mockReturnValue(true)
    jest.spyOn(secondWall, 'setEntityVisible').mockReturnValue(true)
    const secondDimSet = jest
      .spyOn(secondDim, 'setEntityVisible')
      .mockReturnValue(true)

    expect(second.applyInsertLayerFreeze('Wall', true)).toEqual(['insert-b'])
    expect(secondDimSet).toHaveBeenCalledWith('insert-b', false)
  })
})
