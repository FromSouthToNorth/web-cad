import {
  AcDbDxfFiler,
  AcDbEntityProperties,
  AcDbEntityPropertyGroup,
  AcDbRoadway
} from '@mlightcad/data-model'
import { AcGePoint2dLike } from '@mlightcad/geometry-engine'

/** XDATA application name used to persist the tunnel metadata in DXF. */
const TUNNEL_XDATA_APP = 'TUNNEL'

/** GeoJSON-derived attributes carried by a tunnel roadway. */
export interface TunnelRoadwayInfo {
  tunnelName?: string
  tunnelType?: string
  coalbed?: string
}

/**
 * A roadway (巷道) drawn from GeoJSON tunnel data.
 *
 * Extends the built-in {@link AcDbRoadway} with the feature attributes
 * (`tunnelName` / `tunnelType` / `coalbed`) so the property palette shows a
 * dedicated 巷道信息 group next to the inherited geometry entries. The
 * metadata is persisted as XDATA (application name `TUNNEL`) so the entity
 * round-trips through DXF while the plugin is loaded.
 */
export class TunnelRoadway extends AcDbRoadway {
  static override typeName = 'TunnelRoadway'

  override get dxfTypeName() {
    return 'TUNNELROADWAY'
  }

  private _tunnelName = ''
  private _tunnelType = ''
  private _coalbed = ''

  constructor(
    points?: AcGePoint2dLike[],
    width?: number,
    closed = false,
    info?: TunnelRoadwayInfo
  ) {
    super(points, width, closed)
    if (info) {
      this._tunnelName = info.tunnelName ?? ''
      this._tunnelType = info.tunnelType ?? ''
      this._coalbed = info.coalbed ?? ''
    }
  }

  /** The tunnel name from the source feature (`tunnelName` property). */
  get tunnelName(): string {
    return this._tunnelName
  }
  set tunnelName(value: string) {
    this._tunnelName = value
  }

  /** The tunnel type from the source feature (`tunnelType` property). */
  get tunnelType(): string {
    return this._tunnelType
  }
  set tunnelType(value: string) {
    this._tunnelType = value
  }

  /** The coal bed from the source feature (`coalbed` property). */
  get coalbed(): string {
    return this._coalbed
  }
  set coalbed(value: string) {
    this._coalbed = value
  }

  /**
   * The tunnel attribute group shown after the inherited groups.
   *
   * Names are raw Chinese strings (`skipTranslation: true`) because the host
   * property palette translates unknown names through its own i18n table,
   * which has no entries for plugin properties.
   */
  protected getTunnelInfoProperties(): AcDbEntityPropertyGroup {
    return {
      groupName: '巷道信息',
      properties: [
        {
          name: '巷道名称',
          type: 'string',
          editable: true,
          skipTranslation: true,
          accessor: {
            get: () => this.tunnelName,
            set: (v: string) => {
              this.tunnelName = v
            }
          }
        },
        {
          name: '巷道类型',
          type: 'string',
          editable: true,
          skipTranslation: true,
          accessor: {
            get: () => this.tunnelType,
            set: (v: string) => {
              this.tunnelType = v
            }
          }
        },
        {
          name: '煤层',
          type: 'string',
          editable: true,
          skipTranslation: true,
          accessor: {
            get: () => this.coalbed,
            set: (v: string) => {
              this.coalbed = v
            }
          }
        }
      ]
    }
  }

  override get properties(): AcDbEntityProperties {
    return {
      type: this.type,
      groups: [
        this.getGeneralProperties(),
        this.getCenterlineGeometryProperties(),
        this.getCenterlineOtherProperties(),
        this.getTunnelInfoProperties()
      ]
    }
  }

  override dxfOutFields(filer: AcDbDxfFiler) {
    super.dxfOutFields(filer)
    filer.writeString(1001, TUNNEL_XDATA_APP)
    filer.writeString(1000, this._tunnelName)
    filer.writeString(1000, this._tunnelType)
    filer.writeString(1000, this._coalbed)
    return this
  }

  override dxfInFields(filer: AcDbDxfFiler): this {
    super.dxfInFields(filer)
    this.dxfInTunnelXData(filer)
    return this
  }

  /**
   * Reads the trailing XDATA block written by {@link dxfOutFields}. The
   * centerline reader stops before XDATA (`atExtendedData`), so this consumes
   * the `1001` application name followed by the three `1000` strings.
   */
  private dxfInTunnelXData(filer: AcDbDxfFiler): void {
    if (!filer.atExtendedData) return
    const app = filer.readItem()
    if (!app || Number(app.code) !== 1001 || app.value !== TUNNEL_XDATA_APP) {
      return
    }
    const values: string[] = []
    while (filer.atExtendedData) {
      const item = filer.readItem()
      if (!item || Number(item.code) !== 1000) break
      if (typeof item.value === 'string') values.push(item.value)
    }
    this._tunnelName = values[0] ?? ''
    this._tunnelType = values[1] ?? ''
    this._coalbed = values[2] ?? ''
  }
}
