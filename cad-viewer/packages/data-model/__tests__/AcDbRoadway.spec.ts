import { AcGeMatrix3d, AcGePoint2d } from '@hy/geometry-engine'

import { AcDbDxfFiler } from '../src/base'
import { acdbDxfInEntity } from '../src/dxf/AcDbDxfEntityFactory'
import {
  AcDbPolyline,
  AcDbRoadway,
  acdbCreateCustomEntity,
  acdbHasCustomEntity,
  acdbRegisterCustomEntity
} from '../src/entity'
import type { AcDbEntityRuntimeProperty } from '../src/entity'
import { expectDetachedClone } from '../test-utils/cloneTestUtils'
import {
  attachEntityToNewModelSpace,
  getDxfGroupValues
} from '../test-utils/entityTestUtils'

describe('AcDbRoadway', () => {
  it('creates a detached clone with a new objectId', () => {
    expectDetachedClone(() => new AcDbRoadway())
  })

  it('covers constructor behavior, vertices and width', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 }
      ],
      3.5,
      false
    )

    expect(roadway.dxfTypeName).toBe('ROADWAY')
    expect(roadway.type).toBe('Roadway')
    expect(roadway.numberOfVertices).toBe(3)
    expect(roadway.closed).toBe(false)
    expect(roadway.width).toBe(3.5)
    expect(roadway.getPoint2dAt(1)).toEqual({ x: 10, y: 0 })
    expect(roadway.getPoint3dAt(1).z).toBe(0)

    roadway.closed = true
    expect(roadway.closed).toBe(true)
    roadway.elevation = 8
    expect(roadway.elevation).toBe(8)
    expect(roadway.getPoint3dAt(0).z).toBe(8)

    // Width values <= 0 are ignored.
    roadway.width = 0
    expect(roadway.width).toBe(3.5)
    roadway.width = -1
    expect(roadway.width).toBe(3.5)
    roadway.width = 6
    expect(roadway.width).toBe(6)
  })

  it('adds, moves and removes centerline vertices', () => {
    const roadway = new AcDbRoadway()
    roadway.addVertexAt(0, { x: 0, y: 0 })
    roadway.addVertexAt(1, { x: 10, y: 0 }, 0.5)
    expect(roadway.numberOfVertices).toBe(2)
    expect(roadway.getPoint2dAt(1)).toEqual({ x: 10, y: 0 })
    expect(roadway.getBulgeAt(1)).toBe(0.5)

    roadway.setPoint2dAt(0, { x: 1, y: 2 })
    expect(roadway.getPoint2dAt(0)).toEqual({ x: 1, y: 2 })

    roadway.removeVertexAt(0)
    expect(roadway.numberOfVertices).toBe(1)

    roadway.clearVertices()
    expect(roadway.numberOfVertices).toBe(0)
  })

  it('draws the roadway width as one solid filled band', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2
    )
    roadway.elevation = 6

    const renderer = {
      subEntityTraits: { fillType: null as unknown },
      area: jest.fn(() => 'area-rendered'),
      lines: jest.fn(() => 'line-rendered')
    }

    expect(roadway.directBatchPrimitive).toBe('area')
    const result = roadway.subWorldDraw(renderer as never)
    expect(result).toBe('area-rendered')
    expect(renderer.area).toHaveBeenCalledTimes(1)
    expect(renderer.lines).not.toHaveBeenCalled()
    expect(renderer.subEntityTraits.fillType).toEqual({
      solidFill: true,
      patternAngle: 0,
      definitionLines: []
    })
    const [area] = renderer.area.mock.calls[0] as unknown as [
      { loops: unknown[] }
    ]
    expect(area.loops.length).toBeGreaterThan(0)

    // Nothing drawable without a centerline.
    const empty = new AcDbRoadway()
    expect(empty.subWorldDraw({} as never)).toBeUndefined()
  })

  it('computes geometric extents including the half-width band', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 }
      ],
      2
    )
    const extents = roadway.geometricExtents
    expect(extents.min.x).toBeCloseTo(-1)
    expect(extents.max.x).toBeCloseTo(11)
    expect(extents.min.y).toBeCloseTo(-1)
    expect(extents.max.y).toBeCloseTo(6)
  })

  it('transforms the centerline and flips bulge on mirroring', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 1 },
        { x: 10, y: 0 }
      ],
      2
    )
    roadway.addVertexAt(0, { x: 0, y: 0 }, 0.5)

    const mirror = new AcGeMatrix3d().makeScale(1, -1, 1)
    expect(mirror.determinant()).toBeLessThan(0)
    roadway.transformBy(mirror)

    expect(roadway.getPoint2dAt(0).y).toBeCloseTo(0)
    expect(roadway.getPoint2dAt(1).y).toBeCloseTo(-1)
    expect(roadway.getPoint2dAt(2).y).toBeCloseTo(0)
    expect(roadway.getBulgeAt(0)).toBeCloseTo(-0.5)
  })

  it('exposes vertex grips and moves them', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2
    )

    const grips = roadway.subGetGripPoints()
    expect(grips.length).toBeGreaterThanOrEqual(2)

    roadway.subMoveGripPointsAt([0], { x: 1, y: 2, z: 0 })
    expect(roadway.getPoint2dAt(0)).toEqual({ x: 1, y: 2 })

    // When midpoint grips are included, moving the first one moves both
    // adjacent vertices.
    const midGripIndex = roadway.numberOfVertices
    if (grips.length > roadway.numberOfVertices) {
      roadway.subMoveGripPointsAt([midGripIndex], { x: 5, y: 0, z: 0 })
      expect(roadway.getPoint2dAt(0).x).toBeCloseTo(6)
      expect(roadway.getPoint2dAt(1).x).toBeCloseTo(15)
    }
  })

  it('offsets the centerline for the OFFSET command', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2
    )
    const curves = roadway.getOffsetCurves(2)
    expect(curves).toHaveLength(1)
    const offset = curves[0] as AcDbPolyline
    expect(offset.getPoint2dAt(0).y).toBeCloseTo(2)
    expect(offset.getPoint2dAt(1).y).toBeCloseTo(2)
  })

  it('writes dxf fields with the ROADWAY subclass marker and centerline codes', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 1, y: 2 },
        { x: 3, y: 4 }
      ],
      3.5,
      true
    )
    roadway.elevation = 12
    attachEntityToNewModelSpace(roadway)

    const filer = new AcDbDxfFiler()
    expect(roadway.dxfOutFields(filer)).toBe(roadway)

    const dxf = filer.toString()
    expect(getDxfGroupValues(dxf, 100)).toContain('AcDbRoadway')
    expect(getDxfGroupValues(dxf, 40)).toEqual(['3.5'])
    expect(getDxfGroupValues(dxf, 90)).toContain('2')
    expect(getDxfGroupValues(dxf, 70)).toContain('1')
    expect(getDxfGroupValues(dxf, 38)).toContain('12')
    expect(getDxfGroupValues(dxf, 10)).toEqual(['1', '3'])
    expect(getDxfGroupValues(dxf, 20)).toEqual(['2', '4'])
  })

  it('reads a ROADWAY record back through the custom entity registry', () => {
    const dxf = [
      '0',
      'ROADWAY',
      '5',
      '1A',
      '100',
      'AcDbEntity',
      '8',
      '0',
      '100',
      'AcDbRoadway',
      '40',
      '4.5',
      '90',
      '2',
      '70',
      '1',
      '38',
      '7',
      '10',
      '1',
      '20',
      '2',
      '10',
      '5',
      '20',
      '6',
      '42',
      '0.5',
      '0',
      'ENDSEC'
    ].join('\n')

    const filer = AcDbDxfFiler.fromString(dxf)
    const entity = acdbDxfInEntity(filer)
    expect(entity).toBeInstanceOf(AcDbRoadway)

    const roadway = entity as AcDbRoadway
    expect(roadway.width).toBe(4.5)
    expect(roadway.closed).toBe(true)
    expect(roadway.elevation).toBe(7)
    expect(roadway.numberOfVertices).toBe(2)
    expect(roadway.getPoint2dAt(0)).toEqual(new AcGePoint2d(1, 2))
    expect(roadway.getPoint2dAt(1)).toEqual(new AcGePoint2d(5, 6))
    expect(roadway.getBulgeAt(1)).toBeCloseTo(0.5)
  })

  it('exposes the width in the property palette definition', () => {
    const roadway = new AcDbRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2
    )
    const geometry = roadway.properties.groups.find(
      group => group.groupName === 'geometry'
    )
    expect(geometry).toBeDefined()
    if (!geometry) return
    const width = geometry.properties.find(
      p => p.name === 'width'
    ) as AcDbEntityRuntimeProperty
    expect(width.type).toBe('float')
    expect(width.editable).toBe(true)
    expect(width.accessor.get()).toBe(2)
    width.accessor.set?.(9)
    expect(roadway.width).toBe(9)
  })

  it('registers the ROADWAY type for DXF import and rejects duplicates', () => {
    expect(acdbHasCustomEntity('ROADWAY')).toBe(true)
    expect(acdbHasCustomEntity('roadway')).toBe(true)
    expect(acdbCreateCustomEntity('ROADWAY')).toBeInstanceOf(AcDbRoadway)
    expect(() =>
      acdbRegisterCustomEntity('ROADWAY', () => new AcDbRoadway())
    ).toThrow(/already been registered/)
  })
})
