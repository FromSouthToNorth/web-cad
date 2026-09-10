import {
  AcGeBox3d,
  AcGeMatrix3d,
  AcGePoint2d,
  AcGePoint2dLike,
  AcGePoint3d,
  AcGePoint3dLike,
  AcGePolyline2d,
  AcGeVector3dLike
} from '@hy/geometry-engine'

import { AcDbDxfFiler } from '../base/AcDbDxfFiler'
import { AcDbSystemVariables } from '../database/AcDbSystemVariables'
import { AcDbSysVarManager } from '../database/AcDbSysVarManager'
import { AcDbOsnapMode } from '../misc/AcDbOsnapMode'
import { AcDbCurve } from './AcDbCurve'
import { AcDbCustomEntity } from './AcDbCustomEntity'
import {
  AcDbEntityProperties,
  AcDbEntityPropertyGroup
} from './AcDbEntityProperties'
import {
  acdbForEachGripIndex,
  acdbMovePolyline2dVertexAt
} from './AcDbGripHelpers'
import {
  acdbCollectPolyline2dSegmentOsnapPoints,
  acdbPickNearestOsnapPoint
} from './AcDbOsnapHelpers'
import { AcDbPolyline } from './AcDbPolyline'

/**
 * Abstract base class for custom entities built around a 2D centerline
 * polyline (with optional bulge arc segments) plus an elevation.
 *
 * It centralizes every mechanism a centerline-based custom object needs, so
 * that a new custom object only has to define its own parameters and its own
 * appearance:
 * - Vertex management (add / remove / move vertices, bulge support)
 * - Grip editing (vertex grips, plus segment midpoint grips when the GRIPS
 *   system variable is `2`)
 * - Object snap points on the centerline (endpoint / midpoint / nearest /
 *   perpendicular / tangent)
 * - `transformBy` (move / rotate / mirror via matrix)
 * - Geometric extents with an optional margin (e.g. half width)
 * - `getOffsetCurves` / `getOffsetSideAtPoint` so the OFFSET command works
 * - Property palette entries (vertices, elevation, length, closed)
 * - DXF read/write of the centerline following the LWPOLYLINE group-code
 *   convention (90 vertex count, 70 closed flag, 38 elevation, 10/20 vertex,
 *   42 bulge)
 *
 * Checklist for a new centerline-based custom object:
 * 1. Derive from this class and implement `dxfTypeName` and `subWorldDraw`.
 * 2. Add custom parameters, and persist them in `dxfOutFields` / `dxfInFields`
 *    (delegate the centerline part to {@link dxfOutCenterlineFields} and
 *    {@link dxfInCenterlineFields}).
 * 3. Optionally append custom entries to `properties`.
 * 4. Register the type once with `new MyEntity().rxInit()` so DXF import can
 *    recreate it.
 *
 * @example
 * ```typescript
 * class AcDbDitch extends AcDbCenterlineCurve {
 *   get dxfTypeName() { return 'DITCH' }
 *   subWorldDraw(renderer: AcGiRenderer) {
 *     return renderer.lines(this.getCenterlinePoints3d())
 *   }
 * }
 * new AcDbDitch().rxInit()
 * ```
 */
export abstract class AcDbCenterlineCurve extends AcDbCustomEntity {
  /** The underlying centerline geometry in the XY plane */
  protected _geo: AcGePolyline2d
  /** The elevation (Z-coordinate) of the centerline plane */
  protected _elevation: number

  /**
   * Creates a new empty centerline-based custom entity.
   */
  constructor() {
    super()
    this._geo = new AcGePolyline2d()
    this._elevation = 0
  }

  /**
   * Gets the number of centerline vertices.
   */
  get numberOfVertices(): number {
    return this._geo.numberOfVertices
  }

  /**
   * Gets the elevation of this entity.
   *
   * The elevation is the distance of the centerline plane from the WCS origin
   * along the Z-axis.
   */
  get elevation(): number {
    return this._elevation
  }
  set elevation(value: number) {
    this._elevation = value
  }

  /**
   * Gets whether the centerline is closed.
   *
   * A closed centerline has a segment drawn from the last vertex to the first
   * vertex, forming a complete loop.
   */
  get closed(): boolean {
    return this._geo.closed
  }
  set closed(value: boolean) {
    this._geo.closed = value
  }

  /**
   * The area enclosed by the centerline. Open centerlines return `0`.
   *
   * Subclasses representing a strip (e.g. a corridor drawn as two parallel
   * edges) may override this to report the strip area instead.
   */
  get area(): number {
    return this._geo.area
  }

  /**
   * Gets the length of the centerline.
   */
  get length(): number {
    return this._geo.length
  }

  /**
   * Adds one vertex to the centerline at the specified index.
   *
   * @param index - The index (0-based) before which to insert the vertex
   * @param pt - The vertex location point in the XY plane
   * @param bulge - The bulge value for the segment starting at this vertex
   *   (0 for a straight segment, non-zero for an arc segment)
   */
  addVertexAt(index: number, pt: AcGePoint2dLike, bulge: number = 0) {
    this._geo.addVertexAt(index, { x: pt.x, y: pt.y, bulge })
  }

  /**
   * Removes the centerline vertex at the specified index.
   *
   * @param index - Input index (0 based) of the vertex to remove
   * @throws Error if the index is out of bounds
   */
  removeVertexAt(index: number) {
    this._geo.removeVertexAt(index)
  }

  /**
   * Replaces the location of the centerline vertex at the specified index.
   *
   * @param index - The index (0-based) of the vertex to move
   * @param pt - The new vertex location in the XY plane
   */
  setPoint2dAt(index: number, pt: AcGePoint2dLike) {
    const vertex = this._geo.vertices[index]
    if (!vertex) return
    vertex.x = pt.x
    vertex.y = pt.y
    this.markGeometryDirty()
  }

  /**
   * Removes every centerline vertex.
   */
  clearVertices() {
    this._geo.reset(false)
  }

  /**
   * Gets the 2D location of a centerline vertex at the specified index.
   *
   * @param index - The index (0-based) of the vertex
   * @returns The 2D point location of the vertex
   */
  getPoint2dAt(index: number): AcGePoint2d {
    return this._geo.getPointAt(index)
  }

  /**
   * Gets the 3D location of a centerline vertex at the specified index.
   *
   * The point is returned in World Coordinates, with the Z-coordinate set to
   * this entity's elevation.
   *
   * @param index - The index (0-based) of the vertex
   * @returns The 3D point location of the vertex
   */
  getPoint3dAt(index: number): AcGePoint3d {
    const vertex = this.getPoint2dAt(index)
    return new AcGePoint3d(vertex.x, vertex.y, this._elevation)
  }

  /**
   * Gets the bulge value of the segment starting at the specified vertex.
   *
   * A bulge of 0 indicates a straight segment; a non-zero bulge indicates an
   * arc segment (see the LWPOLYLINE group 42 documentation).
   *
   * @param index - The index (0-based) of the vertex
   * @returns The bulge value of that vertex, or 0 when out of range
   */
  getBulgeAt(index: number): number {
    return this._geo.vertices[index]?.bulge ?? 0
  }

  /**
   * Samples the centerline (including bulge arcs) into 3D points at this
   * entity's elevation, ready for `AcGiRenderer.lines()`.
   *
   * @param numPoints - Number of samples used per arc segment
   */
  protected getCenterlinePoints3d(numPoints = 100): AcGePoint3d[] {
    return this._geo.getPoints3d(numPoints, this._elevation)
  }

  /**
   * Marks the cached centerline bounding box as dirty after direct vertex
   * mutation.
   */
  protected markGeometryDirty() {
    ;(
      this._geo as AcGePolyline2d & { _boundingBoxNeedsUpdate: boolean }
    )._boundingBoxNeedsUpdate = true
  }

  /**
   * Gets the geometric extents of this entity (centerline bounding box).
   */
  get geometricExtents(): AcGeBox3d {
    return this.getExtentsWithMargin(0)
  }

  /**
   * Gets the geometric extents expanded equilaterally by the given margin.
   * Subclasses drawing geometry around the centerline (e.g. two edges at
   * half-width distance) pass that distance here.
   *
   * @param margin - Distance to expand the centerline box by, in drawing units
   */
  protected getExtentsWithMargin(margin: number): AcGeBox3d {
    const box = this._geo.box
    return new AcGeBox3d(
      { x: box.min.x - margin, y: box.min.y - margin, z: this._elevation },
      { x: box.max.x + margin, y: box.max.y + margin, z: this._elevation }
    )
  }

  /**
   * Gets the grip points for this entity: all centerline vertices, plus one
   * midpoint grip per segment when the GRIPS system variable is `2`.
   */
  subGetGripPoints() {
    const gripPoints = new Array<AcGePoint3d>()
    for (let index = 0; index < this.numberOfVertices; ++index) {
      gripPoints.push(this.getPoint3dAt(index))
    }
    if (this.getGripsMode() >= 2) {
      const geo = this._geo
      const vertexCount = geo.numberOfVertices
      const segmentCount = this.closed ? vertexCount : vertexCount - 1
      for (let index = 0; index < segmentCount; index++) {
        const segmentSnaps: AcGePoint3d[] = []
        acdbCollectPolyline2dSegmentOsnapPoints(
          geo.getPointAt(index),
          geo.getPointAt((index + 1) % vertexCount),
          geo.vertices[index]?.bulge,
          this._elevation,
          AcDbOsnapMode.MidPoint,
          { x: 0, y: 0, z: 0 },
          segmentSnaps
        )
        gripPoints.push(...segmentSnaps)
      }
    }
    return gripPoints
  }

  /** @inheritdoc */
  subMoveGripPointsAt(indices: number[], offset: AcGeVector3dLike) {
    const vertexCount = this.numberOfVertices
    const includeMidpoints = this.getGripsMode() >= 2
    const segmentCount = includeMidpoints
      ? this.closed
        ? vertexCount
        : vertexCount - 1
      : 0

    acdbForEachGripIndex(indices, index => {
      if (index < vertexCount) {
        acdbMovePolyline2dVertexAt(this._geo.vertices, index, offset)
        return
      }
      if (!includeMidpoints || index >= vertexCount + segmentCount) {
        return
      }
      const segmentIndex = index - vertexCount
      acdbMovePolyline2dVertexAt(this._geo.vertices, segmentIndex, offset)
      acdbMovePolyline2dVertexAt(
        this._geo.vertices,
        (segmentIndex + 1) % vertexCount,
        offset
      )
    })
    this.markGeometryDirty()
    return this
  }

  /**
   * Reads the current **GRIPS** system variable value.
   */
  private getGripsMode() {
    try {
      const value = AcDbSysVarManager.instance().getVar(
        AcDbSystemVariables.GRIPS,
        this.database
      )
      return typeof value === 'number' ? value : 2
    } catch {
      return 2
    }
  }

  /**
   * Gets the object snap points on the centerline for the specified snap mode.
   */
  subGetOsnapPoints(
    osnapMode: AcDbOsnapMode,
    pickPoint: AcGePoint3dLike,
    _lastPoint: AcGePoint3dLike,
    snapPoints: AcGePoint3dLike[]
  ) {
    const geo = this._geo
    const vertexCount = geo.numberOfVertices
    if (vertexCount === 0) return

    switch (osnapMode) {
      case AcDbOsnapMode.EndPoint:
        for (let index = 0; index < vertexCount; index++) {
          snapPoints.push(this.getPoint3dAt(index))
        }
        break
      case AcDbOsnapMode.MidPoint:
      case AcDbOsnapMode.Nearest:
      case AcDbOsnapMode.Perpendicular:
      case AcDbOsnapMode.Tangent: {
        const segmentCount = this.closed ? vertexCount : vertexCount - 1
        const candidates: AcGePoint3d[] = []
        for (let index = 0; index < segmentCount; index++) {
          const segmentSnaps: AcGePoint3d[] = []
          acdbCollectPolyline2dSegmentOsnapPoints(
            geo.getPointAt(index),
            geo.getPointAt((index + 1) % vertexCount),
            geo.vertices[index]?.bulge,
            this._elevation,
            osnapMode,
            pickPoint,
            segmentSnaps
          )
          candidates.push(...segmentSnaps)
        }
        if (osnapMode === AcDbOsnapMode.MidPoint) {
          snapPoints.push(...candidates)
        } else {
          const nearest = acdbPickNearestOsnapPoint(pickPoint, candidates)
          if (nearest) snapPoints.push(nearest)
        }
        break
      }
      default:
        break
    }
  }

  /**
   * Transforms this entity by the specified matrix.
   *
   * Centerline vertices are transformed in the XY plane; the bulge sign is
   * flipped for mirroring matrices (negative determinant).
   *
   * @param matrix - The transformation matrix to apply
   * @returns This entity after transformation
   */
  transformBy(matrix: AcGeMatrix3d) {
    const flipBulge = matrix.determinant() < 0
    let elevation = this._elevation

    this._geo.vertices.forEach(vertex => {
      const transformedPoint = new AcGePoint3d(
        vertex.x,
        vertex.y,
        this._elevation
      ).applyMatrix4(matrix)
      vertex.x = transformedPoint.x
      vertex.y = transformedPoint.y
      elevation = transformedPoint.z
      if (flipBulge && vertex.bulge != null) {
        vertex.bulge = -vertex.bulge
      }
    })

    this._elevation = elevation
    this.markGeometryDirty()
    return this
  }

  /**
   * Offsets the centerline and returns the result as plain polylines so that
   * the OFFSET command works on this entity.
   */
  override getOffsetCurves(offsetDist: number): AcDbCurve[] {
    const results = this._geo.offset(offsetDist)
    if (results.length === 0) return []
    return [AcDbPolyline.fromGePolyline(results[0])]
  }

  /** @inheritdoc */
  override getOffsetSideAtPoint(point: AcGePoint3dLike): 1 | -1 {
    const n = this.numberOfVertices
    let bestDist = Infinity
    let bestSide: 1 | -1 = 1
    const segCount = this.closed ? n : n - 1
    for (let i = 0; i < segCount; i++) {
      const a = this.getPoint2dAt(i)
      const b = this.getPoint2dAt((i + 1) % n)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      if (len2 === 0) continue
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2)
      )
      const d = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2
      if (d < bestDist) {
        bestDist = d
        bestSide = dx * (point.y - a.y) - dy * (point.x - a.x) >= 0 ? 1 : -1
      }
    }
    return bestSide
  }

  /**
   * Returns the property definition for this entity: the general group, one
   * geometry group (vertices, elevation, length) and one others group
   * (closed). Subclasses append custom entries by overriding
   * {@link getCenterlineGeometryProperties} or
   * {@link getCenterlineOtherProperties}.
   */
  get properties(): AcDbEntityProperties {
    return {
      type: this.type,
      groups: [
        this.getGeneralProperties(),
        this.getCenterlineGeometryProperties(),
        this.getCenterlineOtherProperties()
      ]
    }
  }

  /**
   * Creates the "geometry" property group for the centerline: vertices,
   * elevation and length.
   */
  protected getCenterlineGeometryProperties(): AcDbEntityPropertyGroup {
    return {
      groupName: 'geometry',
      properties: [
        {
          name: 'vertices',
          type: 'array',
          editable: false,
          itemSchema: {
            properties: [
              {
                name: 'x',
                type: 'float',
                editable: true
              },
              {
                name: 'y',
                type: 'float',
                editable: true
              }
            ]
          },
          accessor: {
            get: () => this._geo.vertices
          }
        },
        {
          name: 'elevation',
          type: 'float',
          editable: true,
          accessor: {
            get: () => this.elevation,
            set: (v: number) => {
              this.elevation = v
            }
          }
        },
        {
          name: 'length',
          type: 'float',
          editable: false,
          accessor: {
            get: () => this.length
          }
        }
      ]
    }
  }

  /**
   * Creates the "others" property group for the centerline: closed flag.
   */
  protected getCenterlineOtherProperties(): AcDbEntityPropertyGroup {
    return {
      groupName: 'others',
      properties: [
        {
          name: 'closed',
          type: 'boolean',
          editable: true,
          accessor: {
            get: () => this.closed,
            set: (v: boolean) => {
              this.closed = v
            }
          }
        }
      ]
    }
  }

  /**
   * Writes the centerline DXF fields following the LWPOLYLINE group-code
   * convention: 90 vertex count, 70 closed flag, 38 elevation, then per
   * vertex 10/20 location and 42 bulge.
   *
   * Call this from the subclass `dxfOutFields` after writing the subclass
   * marker and the custom parameter codes.
   */
  protected dxfOutCenterlineFields(filer: AcDbDxfFiler) {
    filer.writeInt32(90, this.numberOfVertices)
    filer.writeInt16(70, this.closed ? 1 : 0)
    filer.writeDouble(38, this.elevation)

    const vertices = this._geo.vertices
    for (let i = 0; i < vertices.length; ++i) {
      filer.writePoint2d(10, this.getPoint2dAt(i))
      const bulge = vertices[i].bulge ?? 0
      if (bulge !== 0) {
        filer.writeDouble(42, bulge)
      }
    }
  }

  /**
   * Reads DXF items until the end of this entity and reconstructs the
   * centerline. Unknown group codes are offered to the optional callback so
   * the subclass can read its own custom parameter codes.
   *
   * Call this from the subclass `dxfInFields` right after
   * `filer.atSubclassData(...)`.
   *
   * @param filer - DXF input reader positioned after the subclass marker
   * @param onCustomItem - Returns `true` when it consumed the group code
   */
  protected dxfInCenterlineFields(
    filer: AcDbDxfFiler,
    onCustomItem?: (code: number, value: number) => boolean
  ) {
    this._geo.reset(false)
    let closed = false
    let elevation = this._elevation
    let pendingX = 0
    let pendingY = 0
    let hasPending = false
    let bulge = 0
    let vertexIndex = 0

    const flushVertex = () => {
      if (!hasPending) return
      this.addVertexAt(vertexIndex++, new AcGePoint2d(pendingX, pendingY), bulge)
      hasPending = false
      bulge = 0
    }

    while (!filer.atEndOfObject && !filer.atEof && !filer.atExtendedData) {
      const item = filer.readItem()
      if (!item) break
      const code = Number(item.code)
      const n = Number(item.value)
      switch (code) {
        case 90:
          // Vertex count — informational; ignore.
          break
        case 70:
          closed = (n & 1) !== 0
          break
        case 38:
          elevation = n
          break
        case 10:
          flushVertex()
          pendingX = n
          pendingY = 0
          hasPending = true
          break
        case 20:
          pendingY = n
          break
        case 42:
          bulge = n
          break
        default:
          onCustomItem?.(code, n)
          break
      }
    }

    flushVertex()
    this.closed = closed
    this._elevation = elevation
  }
}
