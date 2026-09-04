/**
 * Entity-type census for a DXF file: parses once and reports per-type counts
 * plus circle/arc/ellipse radius distribution buckets (for arc-LOD impact
 * assessment).
 *
 * Usage: node bench/entity-census.cjs <dxf-file>
 */
const path = require('path')
const fs = require('fs')

const file = process.argv[2]
if (!file) {
  console.error('Usage: node bench/entity-census.cjs <dxf-file>')
  process.exit(1)
}

async function main() {
  const {
    AcDbDatabase,
    AcDbCircle,
    AcDbArc,
    AcDbEllipse,
    AcDbLine,
    AcDbPolyline,
    AcDb2dPolyline,
    AcDbMText,
    AcDbText,
    AcDbHatch,
    AcDbBlockReference,
    AcDbPoint,
    AcDbSpline,
    AcDbSolid,
    AcDbTrace,
    AcDbFace,
    AcDbDimension,
    AcDbLeader,
    AcDbMLeader
  } = require('@mlightcad/data-model')

  const data = fs.readFileSync(file)
  const db = new AcDbDatabase()
  const t0 = Date.now()
  await db.read(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), {
    readOnly: true
  })
  const parseMs = Date.now() - t0

  const counts = new Map()
  const radii = []
  let total = 0
  const tally = (dbms, space) => {
    for (const entity of dbms.newIterator()) {
      total++
      const name = entity.constructor?.name ?? 'unknown'
      counts.set(name, (counts.get(name) ?? 0) + 1)
      if (
        entity instanceof AcDbCircle ||
        entity instanceof AcDbArc ||
        entity instanceof AcDbEllipse
      ) {
        const r =
          entity instanceof AcDbEllipse
            ? Math.max(entity.majorAxisRadius, entity.minorAxisRadius)
            : entity.radius
        if (Number.isFinite(r)) radii.push(r)
      }
    }
  }
  tally(db.tables.blockTable.modelSpace, 'model')

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  console.log(`file      : ${path.basename(file)}`)
  console.log(`parseMs   : ${parseMs}`)
  console.log(`entities  : ${total} (model space)`)
  console.log(`types (${sorted.length}):`)
  for (const [name, n] of sorted.slice(0, 25)) {
    console.log(`  ${name.padEnd(30)} ${n}`)
  }
  if (radii.length) {
    radii.sort((a, b) => a - b)
    const q = p => radii[Math.min(radii.length - 1, Math.floor(p * radii.length))]
    console.log(
      `curve radii: n=${radii.length} min=${q(0)} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${q(1)}`
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
