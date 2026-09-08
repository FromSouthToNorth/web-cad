import {
  AcDbCurve,
  AcDbCustomEntity,
  AcDbDxfFiler,
  AcDbEntityProperties,
  AcDbEntityPropertyGroup
} from '@mlightcad/data-model'
import {
  AcGeBox3d,
  AcGeCircArc3d,
  AcGeMatrix3d,
  AcGePoint3d,
  AcGePoint3dLike,
  AcGeVector3d,
  TAU
} from '@mlightcad/geometry-engine'
import type { AcGiEntity, AcGiRenderer } from '@mlightcad/graphic-interface'

/** XDATA application name used to persist the shaft metadata in DXF. */
const SHAFT_XDATA_APP = 'SHAFT'

/** Default shaft symbol radius in drawing units. */
export const DEFAULT_SHAFT_RADIUS = 15

/** Default extra width of the outer shaft ring in drawing units. */
export const DEFAULT_SHAFT_OUTER = 5

/** GeoJSON-derived attributes carried by a shaft (立井) entity. */
export interface ShaftRoadwayInfo {
  /** Feature `id` property. */
  id?: string
  /** Feature name (usually the `tunnelName` property). */
  name?: string
  /** Symbol circle radius in drawing units. */
  radius?: number
  /** Extra width of the outer ring in drawing units. */
  outer?: number
}

const toPoint = (point: AcGePoint3dLike): AcGePoint3d =>
  new AcGePoint3d(point.x, point.y, point.z ?? 0)

/**
 * A vertical shaft (立井巷道) symbol drawn from GeoJSON tunnel features whose
 * `tunnelType` is 1, 2, 9 or 15.
 *
 * The symbol is two concentric circles around the shaft bottom plus the
 * horizontal diameter line. Bottom/top points, radius and the feature
 * metadata (`id` / `name`) are persisted in DXF (`SHAFTCIRCLE` record, XDATA
 * application `SHAFT`) so the entity round-trips through DXF while the plugin
 * is loaded. The property palette shows them in a dedicated 立井信息 group.
 */
export class ShaftRoadway extends AcDbCustomEntity {
  static override typeName = 'ShaftCircle'

  override get dxfTypeName() {
    return 'SHAFTCIRCLE'
  }

  private _bottom = new AcGePoint3d()
  private _top = new AcGePoint3d()
  private _radius = DEFAULT_SHAFT_RADIUS
  private _outer = DEFAULT_SHAFT_OUTER
  private _id = ''
  private _name = ''

  /**
   * Creates a new shaft symbol.
   *
   * @param bottom - Shaft bottom (井底) position in WCS
   * @param top - Shaft mouth (井口) position in WCS
   * @param info - Feature metadata and symbol sizing overrides
   */
  constructor(
    bottom?: AcGePoint3dLike,
    top?: AcGePoint3dLike,
    info?: ShaftRoadwayInfo
  ) {
    super()
    if (bottom) this._bottom = toPoint(bottom)
    if (top) this._top = toPoint(top)
    this._name = info?.name ?? this.defaultName
    this._id = info?.id ?? ''
    if (info?.radius != null && info.radius > 0) this._radius = info.radius
    if (info?.outer != null && info.outer >= 0) this._outer = info.outer
  }

  /** Default display name used when the source feature has no name. */
  protected get defaultName(): string {
    return '立井'
  }

  /** DXF subclass marker written after the AcDbEntity fields. */
  protected get dxfSubclassMarker(): string {
    return 'AcDbShaftCircle'
  }

  /** XDATA application name of the trailing metadata block. */
  protected get xdataAppName(): string {
    return SHAFT_XDATA_APP
  }

  /** Property palette group name. */
  protected get shaftInfoGroupName(): string {
    return '立井信息'
  }

  /** Shaft bottom (井底) position in WCS. */
  get bottom(): AcGePoint3d {
    return this._bottom
  }
  set bottom(value: AcGePoint3dLike) {
    this._bottom = toPoint(value)
  }

  /** Shaft mouth (井口) position in WCS. */
  get top(): AcGePoint3d {
    return this._top
  }
  set top(value: AcGePoint3dLike) {
    this._top = toPoint(value)
  }

  /** Symbol circle radius in drawing units. Values `<= 0` are ignored. */
  get radius(): number {
    return this._radius
  }
  set radius(value: number) {
    if (value > 0) {
      this._radius = value
    }
  }

  /** Extra width of the outer ring in drawing units. Negative values are ignored. */
  get outer(): number {
    return this._outer
  }
  set outer(value: number) {
    if (value >= 0) {
      this._outer = value
    }
  }

  /** Feature `id` property. */
  get id(): string {
    return this._id
  }
  set id(value: string) {
    this._id = value
  }

  /** Feature name (usually the `tunnelName` property). */
  get name(): string {
    return this._name
  }
  set name(value: string) {
    this._name = value
  }

  override get geometricExtents(): AcGeBox3d {
    const half = this._radius + this._outer
    const { x, y, z } = this._bottom
    return new AcGeBox3d(
      new AcGePoint3d(x - half, y - half, z),
      new AcGePoint3d(x + half, y + half, z)
    )
  }

  override get closed(): boolean {
    return true
  }

  /** Area of the outer symbol circle. */
  override get area(): number {
    const radius = this._radius + this._outer
    return Math.PI * radius * radius
  }

  override getOffsetCurves(_offsetDist: number): AcDbCurve[] {
    // Offsetting a compound symbol is not meaningful.
    return []
  }

  /**
   * Moves / rotates / mirrors the symbol for the MOVE, ROTATE, COPY and
   * similar commands. The base {@link AcDbEntity.transformBy} is a no-op, so
   * without this override the symbol would stay at its original position
   * after those commands.
   */
  override transformBy(matrix: AcGeMatrix3d): this {
    this._bottom = toPoint(this._bottom.applyMatrix4(matrix))
    this._top = toPoint(this._top.applyMatrix4(matrix))
    return this
  }

  subWorldDraw(renderer: AcGiRenderer): AcGiEntity | undefined {
    const entities: AcGiEntity[] = []
    this.collectDrawEntities(renderer, entities)
    if (entities.length === 0) return undefined
    return renderer.group(entities)
  }

  /**
   * Pushes the shaft symbol primitives (outer ring, inner circle, horizontal
   * diameter line) into `entities`. Subclasses append extra primitives.
   */
  protected collectDrawEntities(
    renderer: AcGiRenderer,
    entities: AcGiEntity[]
  ): void {
    const radius = this.radius
    if (radius <= 0) return
    const { x, y, z } = this.bottom
    entities.push(
      renderer.circularArc(this.circleAt(x, y, z, radius + this.outer))
    )
    entities.push(renderer.circularArc(this.circleAt(x, y, z, radius)))
    entities.push(
      renderer.lines([
        new AcGePoint3d(x - radius, y, z),
        new AcGePoint3d(x + radius, y, z)
      ])
    )
  }

  /** A full XY-plane circle centered at (x, y, z). */
  private circleAt(
    x: number,
    y: number,
    z: number,
    radius: number
  ): AcGeCircArc3d {
    return new AcGeCircArc3d(
      new AcGePoint3d(x, y, z),
      radius,
      0,
      TAU,
      AcGeVector3d.Z_AXIS
    )
  }

  override get properties(): AcDbEntityProperties {
    return {
      type: this.type,
      groups: [this.getGeneralProperties(), this.getShaftInfoProperties()]
    }
  }

  /**
   * The shaft attribute group shown after the general group. Names are raw
   * Chinese strings (`skipTranslation: true`) because the host property
   * palette translates unknown names through its own i18n table.
   */
  protected getShaftInfoProperties(): AcDbEntityPropertyGroup {
    const readOnlyCoordinate = (
      name: string,
      value: () => number
    ) => ({
      name,
      type: 'float' as const,
      editable: false,
      skipTranslation: true,
      accessor: { get: value }
    })
    return {
      groupName: this.shaftInfoGroupName,
      properties: [
        {
          name: '巷道id',
          type: 'string',
          editable: true,
          skipTranslation: true,
          accessor: {
            get: () => this.id,
            set: (v: string) => {
              this.id = v
            }
          }
        },
        {
          name: '巷道名称',
          type: 'string',
          editable: true,
          skipTranslation: true,
          accessor: {
            get: () => this.name,
            set: (v: string) => {
              this.name = v
            }
          }
        },
        readOnlyCoordinate('井底坐标X', () => this.bottom.x),
        readOnlyCoordinate('井底坐标Y', () => this.bottom.y),
        readOnlyCoordinate('井底坐标Z', () => this.bottom.z),
        readOnlyCoordinate('井口坐标X', () => this.top.x),
        readOnlyCoordinate('井口坐标Y', () => this.top.y),
        readOnlyCoordinate('井口坐标Z', () => this.top.z)
      ]
    }
  }

  override dxfOutFields(filer: AcDbDxfFiler) {
    super.dxfOutFields(filer)
    filer.writeSubclassMarker(this.dxfSubclassMarker)
    filer.writePoint3d(10, this._top)
    filer.writePoint3d(11, this._bottom)
    filer.writeDouble(40, this._radius)
    filer.writeDouble(41, this._outer)
    filer.writeString(1001, this.xdataAppName)
    filer.writeString(1000, this._id)
    filer.writeString(1000, this._name)
    return this
  }

  override dxfInFields(filer: AcDbDxfFiler): this {
    super.dxfInFields(filer)
    filer.atSubclassData(this.dxfSubclassMarker)

    const top = new AcGePoint3d()
    const bottom = new AcGePoint3d()
    let radius = this._radius
    let outer = this._outer

    while (!filer.atEndOfObject && !filer.atEof && !filer.atExtendedData) {
      const item = filer.readItem()
      if (!item) break
      const code = Number(item.code)
      const value = Number(item.value)
      switch (code) {
        case 10:
          top.x = value
          break
        case 20:
          top.y = value
          break
        case 30:
          top.z = value
          break
        case 11:
          bottom.x = value
          break
        case 21:
          bottom.y = value
          break
        case 31:
          bottom.z = value
          break
        case 40:
          radius = value
          break
        case 41:
          outer = value
          break
        default:
          break
      }
    }

    this._top = top
    this._bottom = bottom
    if (radius > 0) this._radius = radius
    if (outer >= 0) this._outer = outer
    this.dxfInShaftXData(filer)
    return this
  }

  /**
   * Reads the trailing XDATA block written by {@link dxfOutFields}: the
   * `1001` application name followed by the `id` and `name` `1000` strings.
   */
  private dxfInShaftXData(filer: AcDbDxfFiler): void {
    if (!filer.atExtendedData) return
    const app = filer.readItem()
    if (!app || Number(app.code) !== 1001 || app.value !== this.xdataAppName) {
      return
    }
    const values: string[] = []
    while (filer.atExtendedData) {
      const item = filer.readItem()
      if (!item || Number(item.code) !== 1000) break
      if (typeof item.value === 'string') values.push(item.value)
    }
    this._id = values[0] ?? ''
    this._name = values[1] ?? ''
  }
}
