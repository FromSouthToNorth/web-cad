import { AcGePoint2dLike } from '@mlightcad/geometry-engine'
import { AcGiRenderer } from '@mlightcad/graphic-interface'

import { AcDbDxfFiler } from '../base/AcDbDxfFiler'
import { AcDbCenterlineCurve } from './AcDbCenterlineCurve'
import {
  createWidePolylineArea,
  type WidePolylinePoint
} from './AcDbPolyline'

/**
 * Default roadway width in drawing units.
 */
const DEFAULT_ROADWAY_WIDTH = 2

/**
 * Represents a roadway (巷道) entity.
 *
 * A roadway is defined by a centerline polyline (with optional bulge arc
 * segments) and a width parameter. It renders as a solid band of the given
 * width around the centerline (same tessellation path as wide polylines);
 * the width is editable in the property palette and persisted in DXF.
 *
 * The DXF record type is the custom name `ROADWAY`. This library reads it
 * back through the custom entity registry (the type self-registers at module
 * load via {@link AcDbCustomEntity.rxInit}); other CAD applications treat it
 * as a proxy entity.
 *
 * @example
 * ```typescript
 * const roadway = new AcDbRoadway(
 *   [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }],
 *   3.5
 * )
 * db.tables.blockTable.modelSpace.appendEntity(roadway)
 * ```
 */
export class AcDbRoadway extends AcDbCenterlineCurve {
  /** The entity type name */
  static override typeName: string = 'Roadway'

  override get dxfTypeName() {
    return 'ROADWAY'
  }

  /** The roadway width in drawing units (DXF group 40) */
  private _width: number = DEFAULT_ROADWAY_WIDTH

  /**
   * Creates a new roadway entity.
   *
   * @param points - Centerline vertices in the XY plane
   * @param width - The roadway width in drawing units
   * @param closed - Whether the centerline forms a closed loop
   */
  constructor(points?: AcGePoint2dLike[], width?: number, closed = false) {
    super()
    if (width != null && width > 0) {
      this._width = width
    }
    points?.forEach((point, index) => this.addVertexAt(index, point))
    this.closed = closed
  }

  /**
   * Gets the roadway width in drawing units.
   */
  get width(): number {
    return this._width
  }

  /**
   * Sets the roadway width in drawing units. Values `<= 0` are ignored.
   */
  set width(value: number) {
    if (value > 0) {
      this._width = value
    }
  }

  /**
   * This roadway draws as a solid filled band: `area` when the width is
   * renderable, otherwise the thin centerline as `lineStrip`.
   *
   * @internal
   */
  override get directBatchPrimitive() {
    return this._width > 0 ? ('area' as const) : ('lineStrip' as const)
  }

  /**
   * Draws this roadway as a solid band of {@link width} around the centerline
   * (same tessellation path as wide polylines). Falls back to the thin
   * centerline when the width is not renderable.
   *
   * @param renderer - The renderer to use for drawing
   * @returns The rendered entity, or undefined when there is nothing drawable
   */
  subWorldDraw(renderer: AcGiRenderer) {
    if (this.numberOfVertices < 2) return undefined
    const widthProfile = this.createWidthProfile()
    if (widthProfile != null) {
      const area = createWidePolylineArea(widthProfile, this.closed)
      if (area != null) {
        const traits = renderer.subEntityTraits
        traits.fillType = {
          solidFill: true,
          patternAngle: 0,
          definitionLines: []
        }
        return renderer.area(area)
      }
    }
    return renderer.lines(this.getCenterlinePoints3d())
  }

  /**
   * The band extends half the roadway width beyond the centerline, so the
   * geometric extents include it (selection / zoom-to-fit).
   */
  override get geometricExtents() {
    return this.getExtentsWithMargin(this._width / 2)
  }

  /** Sampled centerline points carrying the constant roadway width. */
  private createWidthProfile(): WidePolylinePoint[] | null {
    if (this._width <= 0) return null
    const sampled = this._geo.getPoints(100)
    if (sampled.length < 2) return null
    return sampled.map(point => ({
      x: point.x,
      y: point.y,
      width: this._width
    }))
  }

  /**
   * Appends the editable roadway width to the geometry property group.
   */
  protected override getCenterlineGeometryProperties() {
    const group = super.getCenterlineGeometryProperties()
    group.properties.push({
      name: 'width',
      type: 'float',
      editable: true,
      accessor: {
        get: () => this.width,
        set: (v: number) => {
          this.width = v
        }
      }
    })
    return group
  }

  /**
   * Writes DXF fields for this object.
   *
   * @param filer - DXF output writer.
   * @returns The instance (for chaining).
   */
  override dxfOutFields(filer: AcDbDxfFiler) {
    super.dxfOutFields(filer)
    filer.writeSubclassMarker('AcDbRoadway')
    filer.writeDouble(40, this._width)
    this.dxfOutCenterlineFields(filer)
    return this
  }

  override dxfInFields(filer: AcDbDxfFiler): this {
    super.dxfInFields(filer)
    filer.atSubclassData('AcDbRoadway')
    this.dxfInCenterlineFields(filer, (code, value) => {
      if (code === 40) {
        this._width = value
        return true
      }
      return false
    })
    return this
  }
}

// Self-register for DXF import (see AcDbCustomEntity.rxInit). This module is
// marked as side-effectful in package.json so bundlers do not tree-shake the
// registration away.
new AcDbRoadway().rxInit()
