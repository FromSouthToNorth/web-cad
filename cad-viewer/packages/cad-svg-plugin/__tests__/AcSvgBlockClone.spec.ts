import {
  AcCmColor,
  AcCmTransparency,
  AcDbRenderingCache,
  AcGeMatrix3d,
  AcGiLineWeight,
  AcGiSubEntityTraits
} from '@hy/data-model'

import { AcSvgEntity } from '../src/AcSvgEntity'
import { AcSvgGroup } from '../src/AcSvgGroup'
import { AcSvgLine } from '../src/AcSvgLine'
import { AcSvgMText } from '../src/AcSvgMText'
import { AcSvgRenderer } from '../src/AcSvgRenderer'
import { AcSvgStyleContext } from '../src/AcSvgStyleUtil'

const ctx: AcSvgStyleContext = {
  ltscale: 1,
  celtscale: 1,
  backgroundColor: 0xffffff,
  foregroundColor: 0x000000,
  showLineWeight: false
}

function createTraits(): AcGiSubEntityTraits {
  const color = new AcCmColor()
  color.setRGB(0, 0, 0)
  return {
    color,
    lineType: {
      type: 'ByLayer',
      name: 'Continuous',
      standardFlag: 0,
      description: 'Solid line',
      totalPatternLength: 0
    },
    lineTypeScale: 1,
    lineWeight: AcGiLineWeight.LineWeight013,
    fillType: {
      solidFill: true,
      patternAngle: 0,
      definitionLines: []
    },
    transparency: new AcCmTransparency(),
    thickness: 0,
    layer: '0',
    drawOrder: 0
  }
}

function createBlockChild() {
  return new AcSvgLine(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ],
    createTraits(),
    ctx
  )
}

function createMText(widthFactor: number) {
  return new AcSvgMText(
    {
      text: 'ABCD',
      height: 10,
      width: 0,
      position: { x: 0, y: 0, z: 0 },
      widthFactor
    } as never,
    // 'Arial' maps to a font size scale of 1, so 1 world unit of cap height
    // equals 1 SVG user unit in the exported markup.
    { font: 'Arial' } as never,
    createTraits(),
    ctx
  )
}

function createNamedBlockRecord(name: string, entities: unknown[]) {
  return {
    name,
    newIterator: function* () {
      for (const entity of entities) {
        yield entity
      }
    }
  }
}

function createBlockEntity() {
  return {
    objectId: '1A',
    ownerId: '1F',
    layer: '0',
    visibility: true,
    color: new AcCmColor().setRGBValue(0xffffff),
    worldDraw(renderer: AcSvgRenderer) {
      return renderer.lines([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      ])
    }
  }
}

function multiplyMatrixText(svg: string): string | undefined {
  return /matrix\(([^)]*)\)/.exec(svg)?.[1]
}

/** Both arguments of one `matrix(a,b,c,d,e,f)` transform, as numbers. */
function translateArgs(svg: string): number[] {
  const text = multiplyMatrixText(svg)
  expect(text).toBeDefined()
  const values = text!.split(',').map(Number)
  return [values[4], values[5]]
}

describe('AcSvgEntity.fastDeepClone', () => {
  it('returns a distinct object that does not share mutable state', () => {
    const template = createBlockChild()
    const clone = template.fastDeepClone()

    expect(clone).not.toBe(template)
    expect(clone.getLocalSvg()).toBe(template.getLocalSvg())
    expect(clone.box).not.toBe(template.box)
  })

  it('does not multiply the second instance transform onto the first one', () => {
    const template = createBlockChild()

    const first = template.fastDeepClone()
    first.applyMatrix(new AcGeMatrix3d().makeTranslation(100, 0, 0))

    const second = template.fastDeepClone()
    second.applyMatrix(new AcGeMatrix3d().makeTranslation(0, 50, 0))

    // Regression: fastDeepClone returned `this`, so both INSERTs shared one
    // entity and the second transform was multiplied by the first one.
    expect(second).not.toBe(first)
    expect(translateArgs(second.renderSvg())).toEqual([0, 50])
    expect(translateArgs(first.renderSvg())).toEqual([100, 0])
    expect(template.renderSvg()).not.toContain('matrix(')
    expect(template.box.min.x).toBeCloseTo(0, 10)
    expect(template.box.max.y).toBeCloseTo(0, 10)
    expect(second.box.min.x).toBeCloseTo(0, 10)
    expect(second.box.max.y).toBeCloseTo(50, 10)
  })

  it('hands every cached INSERT of a named block its own template clone', () => {
    const cache = AcDbRenderingCache.instance
    cache.clear()
    try {
      const renderer = new AcSvgRenderer()
      const blockRecord = createNamedBlockRecord('CLONE_BLOCK', [
        createBlockEntity()
      ])
      const blockColor = new AcCmColor().setRGBValue(0xffffff)

      const first = cache.draw(
        renderer,
        blockRecord as never,
        blockColor,
        [],
        true,
        new AcGeMatrix3d().makeTranslation(100, 0, 0)
      ) as AcSvgEntity | undefined
      const second = cache.draw(
        renderer,
        blockRecord as never,
        blockColor,
        [],
        true,
        new AcGeMatrix3d().makeTranslation(0, 50, 0)
      ) as AcSvgEntity | undefined
      const template = cache.get('CLONE_BLOCK') as AcSvgEntity | undefined

      expect(template).toBeDefined()
      expect(first).not.toBe(template)
      expect(second).not.toBe(template)
      expect(first).not.toBe(second)
      expect(translateArgs(first!.svg)).toEqual([100, 0])
      expect(translateArgs(second!.svg)).toEqual([0, 50])
      // The cached template must stay at identity for later INSERTs.
      expect(template!.svg).not.toContain('matrix(')
    } finally {
      cache.clear()
    }
  })
})

describe('AcSvgGroup.fastDeepClone', () => {
  it('does not share the transform with the cached group template', () => {
    const template = new AcSvgGroup([createBlockChild()])
    const first = template.fastDeepClone()
    first.applyMatrix(new AcGeMatrix3d().makeTranslation(100, 0, 0))
    const second = template.fastDeepClone()
    second.applyMatrix(new AcGeMatrix3d().makeTranslation(0, 50, 0))

    expect(second).not.toBe(template)
    expect(translateArgs(second.renderSvg())).toEqual([0, 50])
    expect(template.renderSvg()).not.toContain('matrix(')
  })
})

describe('AcSvgMText width factor', () => {
  it('scales the exported width by the width factor exactly once', () => {
    // 4 latin chars * 10 (height) * 0.6 = 24, then * 0.5 = 12.
    const scaled = createMText(0.5)
    const plain = createMText(1)

    expect(plain.box.max.x).toBeCloseTo(24, 6)
    expect(scaled.box.max.x).toBeCloseTo(12, 6)
    // Regression: the tspan also carried `transform="scale(0.5,1)"`, which
    // squared the compression (effective 6 world units).
    expect(scaled.getLocalSvg()).not.toContain('scale(0.5')
    expect(scaled.renderSvg()).toContain('scale(1,-1)')
    expect(scaled.renderSvg()).not.toMatch(/<tspan[^>]*transform=/)
  })

  it('does not shrink a default MTEXT by the removed 0.85 constant', () => {
    const entity = createMText(1)

    // Regression: absolute width factors were multiplied by 0.85, so the
    // exported width was 24 * 0.85 = 20.4.
    expect(entity.box.max.x).toBeCloseTo(24, 6)
    expect(entity.getLocalSvg()).not.toContain('scale(0.85')
  })

  it('applies the width factor of the entity text style once', () => {
    const entity = new AcSvgMText(
      {
        text: 'ABCD',
        height: 10,
        width: 0,
        position: { x: 0, y: 0, z: 0 }
      } as never,
      { font: 'Arial', widthFactor: 0.5 } as never,
      createTraits(),
      ctx
    )

    expect(entity.box.max.x).toBeCloseTo(12, 6)
    expect(entity.renderSvg()).not.toMatch(/<tspan[^>]*transform=/)
  })

  it('applies an inline \\W width factor once', () => {
    // Inline run overrides arrive through the token context, the entity-level
    // factor through initialCtx; both feed layout through measureText only.
    const entity = new AcSvgMText(
      {
        text: '\\W0.5;ABCD',
        height: 10,
        width: 0,
        position: { x: 0, y: 0, z: 0 }
      } as never,
      { font: 'Arial' } as never,
      createTraits(),
      ctx
    )

    expect(entity.getLocalSvg()).toContain('ABCD')
    expect(entity.box.max.x).toBeCloseTo(12, 6)
    expect(entity.renderSvg()).not.toMatch(/<tspan[^>]*transform=/)
  })
})
