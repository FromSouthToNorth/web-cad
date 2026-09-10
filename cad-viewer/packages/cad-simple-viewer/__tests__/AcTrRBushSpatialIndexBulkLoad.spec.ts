/**
 * P1-8: pins the contract that makes a bulk `load()` interchangeable with
 * sequential `insert()` for the rbush spatial index.
 *
 * The child-index build path (`AcTrHierarchicalSpatialIndex.ensureChildIndex`)
 * currently inserts child boxes one by one. Switching it to `load()` is only
 * safe if both build orders answer every query identically, so this spec drives
 * the real `rbush` implementation (no mock) and compares the two builds across
 * search / window search / collides / all / removeById / re-insert.
 */
import { AcEdSpatialQueryResultItem } from '../src/editor/view/AcEdSpatialQueryResult'
import { AcTrRBushSpatialIndex } from '../src/spatialIndex/AcTrRBushSpatialIndex'

type Item = AcEdSpatialQueryResultItem

function box(id: string, minX: number, minY: number, size = 10): Item {
  return { id, minX, minY, maxX: minX + size, maxY: minY + size }
}

/** Deterministic, spatially scattered fixture with a few clustered runs. */
function createItems(count: number): Item[] {
  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    const cluster = i % 4
    const x = cluster * 10_000 + ((i * 37) % 997)
    const y = cluster * 10_000 + ((i * 53) % 991)
    items.push(box(`E${i}`, x, y, 1 + (i % 9)))
  }
  return items
}

function buildByInsert(items: readonly Item[]) {
  const index = new AcTrRBushSpatialIndex()
  for (const item of items) {
    index.insert({ ...item })
  }
  return index
}

function buildByLoad(items: readonly Item[]) {
  const index = new AcTrRBushSpatialIndex()
  index.load(items.map(item => ({ ...item })))
  return index
}

const queries = [
  { minX: 0, minY: 0, maxX: 40, maxY: 40 },
  { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  { minX: 9_900, minY: 9_900, maxX: 10_100, maxY: 10_100 },
  { minX: 19_000, minY: 19_000, maxX: 40_000, maxY: 40_000 },
  { minX: 1_000_000, minY: 1_000_000, maxX: 1_000_010, maxY: 1_000_010 }
]

function idsOf(items: readonly Item[]) {
  return items
    .map(item => item.id)
    .sort()
    .join(',')
}

function boxesOf(items: readonly Item[]) {
  return items
    .map(
      item => `${item.id}@${item.minX},${item.minY},${item.maxX},${item.maxY}`
    )
    .sort()
    .join('|')
}

describe('AcTrRBushSpatialIndex bulk load equivalence', () => {
  const items = createItems(4000)

  it('answers range and window queries identically after load and insert', () => {
    const inserted = buildByInsert(items)
    const loaded = buildByLoad(items)

    for (const query of queries) {
      expect(idsOf(loaded.search(query))).toBe(idsOf(inserted.search(query)))
      expect(idsOf(loaded.search(query, { selectionMode: 'window' }))).toBe(
        idsOf(inserted.search(query, { selectionMode: 'window' }))
      )
      expect(idsOf(loaded.search(query, { selectionMode: 'crossing' }))).toBe(
        idsOf(inserted.search(query, { selectionMode: 'crossing' }))
      )
      expect(loaded.collides(query)).toBe(inserted.collides(query))
    }
  })

  it('returns the same full item set', () => {
    const inserted = buildByInsert(items)
    const loaded = buildByLoad(items)

    expect(loaded.all().length).toBe(items.length)
    expect(boxesOf(loaded.all())).toBe(boxesOf(inserted.all()))
    expect(loaded.getStats().itemCount).toBe(inserted.getStats().itemCount)
  })

  it('removes the same item by id after either build', () => {
    const inserted = buildByInsert(items)
    const loaded = buildByLoad(items)

    for (const id of ['E0', 'E999', 'E3999', 'missing-id']) {
      inserted.removeById(id)
      loaded.removeById(id)
    }

    expect(boxesOf(loaded.all())).toBe(boxesOf(inserted.all()))
    for (const query of queries) {
      expect(idsOf(loaded.search(query))).toBe(idsOf(inserted.search(query)))
    }
  })

  it('keeps empty-id child boxes (hatch islands) pickable after load', () => {
    const islands: Item[] = [
      { id: '', minX: 0, minY: 0, maxX: 100, maxY: 20 },
      { id: '', minX: 0, minY: 40, maxX: 100, maxY: 50 },
      box('E0', 500, 500)
    ]
    const loaded = buildByLoad(islands)
    const inserted = buildByInsert(islands)

    expect(loaded.all().length).toBe(3)
    expect(boxesOf(loaded.all())).toBe(boxesOf(inserted.all()))
    expect(
      loaded.search({ minX: 40, minY: 42, maxX: 45, maxY: 48 }).length
    ).toBe(1)
    expect(
      loaded.search({ minX: 40, minY: 5, maxX: 45, maxY: 15 }).length
    ).toBe(1)
  })

  it('keeps the duplicate-id replace semantics of insert after a load', () => {
    // `load()` is fed uniquified ids by its callers, but a later `insert()` for
    // an existing id must still replace the stale box instead of duplicating it.
    const index = new AcTrRBushSpatialIndex()
    index.load([box('A', 0, 0), box('B', 100, 100)])

    index.insert(box('A', 500, 500))
    const stale = index.search({ minX: -5, minY: -5, maxX: 20, maxY: 20 })
    expect(stale.map(item => item.id)).toEqual([])

    const moved = index.search({ minX: 495, minY: 495, maxX: 520, maxY: 520 })
    expect(moved.map(item => item.id)).toEqual(['A'])
    expect(index.all().length).toBe(2)

    // Same id + same box must not duplicate the entry.
    index.insert(box('A', 500, 500))
    expect(index.all().length).toBe(2)
  })

  it('does not change results when the load order is shuffled', () => {
    const shuffled = items.slice().reverse()
    const loaded = buildByLoad(items)
    const loadedShuffled = buildByLoad(shuffled)
    const inserted = buildByInsert(items)

    for (const query of queries) {
      expect(idsOf(loadedShuffled.search(query))).toBe(
        idsOf(inserted.search(query))
      )
    }
    expect(boxesOf(loadedShuffled.all())).toBe(boxesOf(loaded.all()))
  })
})
