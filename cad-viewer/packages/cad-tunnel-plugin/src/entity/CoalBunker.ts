import { AcGePoint3d } from '@mlightcad/geometry-engine'
import type { AcGiEntity, AcGiRenderer } from '@mlightcad/graphic-interface'

import { ShaftRoadway } from './ShaftRoadway'

/** Number of vertical tick lines between the arc and the diameter. */
const BUNKER_VERTICAL_LINE_COUNT = 4

/** Vertical lines stop slightly inside the circle. */
const BUNKER_VERTICAL_INNER_SCALE = 0.98

/**
 * A coal bunker (煤仓) symbol drawn from GeoJSON tunnel features whose
 * `tunnelType` is 3.
 *
 * Extends {@link ShaftRoadway} with four vertical tick lines dropping from
 * the upper arc (slightly inset) to the horizontal diameter. Bottom/top
 * points, radius and the feature metadata are persisted in DXF
 * (`COALBUNKER` record, XDATA application `BUNKER`) so the entity
 * round-trips through DXF while the plugin is loaded.
 */
export class CoalBunker extends ShaftRoadway {
  static override typeName = 'CoalBunker'

  override get dxfTypeName() {
    return 'COALBUNKER'
  }

  protected override get defaultName(): string {
    return '煤仓'
  }

  protected override get dxfSubclassMarker(): string {
    return 'AcDbCoalBunker'
  }

  protected override get xdataAppName(): string {
    return 'BUNKER'
  }

  protected override get shaftInfoGroupName(): string {
    return '煤仓信息'
  }

  protected override collectDrawEntities(
    renderer: AcGiRenderer,
    entities: AcGiEntity[]
  ): void {
    super.collectDrawEntities(renderer, entities)
    for (const segment of this.getVerticalLineSegments()) {
      entities.push(renderer.lines(segment))
    }
  }

  /**
   * Vertical segments from the upper arc (slightly inset) to the horizontal
   * diameter, spaced evenly across the full diameter.
   */
  private getVerticalLineSegments(): AcGePoint3d[][] {
    const radius = this.radius
    if (radius <= 0) return []
    const { x, y, z } = this.bottom
    const xStep = (2 * radius) / BUNKER_VERTICAL_LINE_COUNT
    const segments: AcGePoint3d[][] = []
    for (let index = 1; index <= BUNKER_VERTICAL_LINE_COUNT; index++) {
      const startX = Math.max(
        x - radius,
        Math.min(x + radius, x - radius + xStep * index)
      )
      const deltaX = startX - x
      if (Math.abs(deltaX) > radius) continue
      const startY =
        y +
        Math.sqrt(radius * radius - deltaX * deltaX) *
          BUNKER_VERTICAL_INNER_SCALE
      segments.push([
        new AcGePoint3d(startX, startY, z),
        new AcGePoint3d(startX, y, z)
      ])
    }
    return segments
  }
}
