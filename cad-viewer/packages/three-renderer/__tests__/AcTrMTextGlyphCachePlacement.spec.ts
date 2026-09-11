import { MTextObject } from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import { clonePlacedMTextTemplate } from '../src/renderer/AcTrMTextGlyphCache'

/**
 * Placement tests for the content-level glyph template cache.
 *
 * A cached template carries both a root transform and an axis-aligned `box`
 * describing where it was laid out. Serving that template at a new insertion
 * point therefore has to move the box with the root; copying it verbatim left
 * the selection frame behind at the template's original insertion point.
 */

const TEMPLATE_POSITION = new THREE.Vector3(100, 200, 0)

function createTemplate(
  box: THREE.Box3 | null,
  position = TEMPLATE_POSITION
): MTextObject {
  const root = new THREE.Group()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  )
  root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  root.position.copy(position)
  if (box) {
    ;(root as unknown as MTextObject).box = box
  }
  return root as unknown as MTextObject
}

/** Template laid out at (100, 200) with a 5x3 bound in its own frame. */
function createBoundedTemplate(): MTextObject {
  return createTemplate(
    new THREE.Box3(
      new THREE.Vector3(100, 200, 0),
      new THREE.Vector3(105, 203, 0)
    )
  )
}

describe('clonePlacedMTextTemplate box placement', () => {
  it('translates the cached box by the delta to the new insertion point', () => {
    const template = createBoundedTemplate()

    const clone = clonePlacedMTextTemplate(template, {
      x: 130,
      y: 250,
      z: 7
    })

    const box = clone.box
    expect(box).toBeDefined()
    // Delta is (30, 50, 7): the bound follows the root, so it stays aligned with
    // the glyphs instead of parking at the template's insertion point.
    expect(box?.min.x).toBe(130)
    expect(box?.min.y).toBe(250)
    expect(box?.min.z).toBe(7)
    expect(box?.max.x).toBe(135)
    expect(box?.max.y).toBe(253)
    expect(box?.max.z).toBe(7)
    // Size is preserved: only the origin moved.
    expect(box?.getSize(new THREE.Vector3()).x).toBe(5)
    expect(box?.getSize(new THREE.Vector3()).y).toBe(3)
    expect(clone.position.x).toBe(130)
    expect(clone.position.y).toBe(250)
    expect(clone.position.z).toBe(7)
  })

  it('uses the insertion point, not box.min, as the translation origin', () => {
    // A template whose box is offset from its insertion point, exactly as an
    // attachment point or rotation makes it. Reading `box.min` as the origin
    // would shift every clone by that offset.
    const template = createTemplate(
      new THREE.Box3(
        new THREE.Vector3(96, 194, 0),
        new THREE.Vector3(104, 206, 0)
      )
    )

    const clone = clonePlacedMTextTemplate(template, { x: 0, y: 0, z: 0 })

    // Relative offset of the box to its insertion point survives the move.
    expect(clone.box?.min.x).toBe(-4)
    expect(clone.box?.min.y).toBe(-6)
    expect(clone.box?.max.x).toBe(4)
    expect(clone.box?.max.y).toBe(6)
  })

  it('leaves the template box and its own placement untouched', () => {
    const template = createBoundedTemplate()

    clonePlacedMTextTemplate(template, { x: -50, y: -60, z: 0 })

    expect(template.box?.min.x).toBe(100)
    expect(template.box?.min.y).toBe(200)
    expect(template.position.x).toBe(100)
    expect(template.position.y).toBe(200)
  })

  it('gives every clone its own box instance', () => {
    const template = createBoundedTemplate()

    const first = clonePlacedMTextTemplate(template, { x: 1, y: 1, z: 0 })
    const second = clonePlacedMTextTemplate(template, { x: 2, y: 2, z: 0 })

    expect(first.box).not.toBe(template.box)
    expect(first.box).not.toBe(second.box)
    expect(first.box?.min.x).toBe(1)
    expect(second.box?.min.x).toBe(2)
  })

  it('copies an empty box without relocating it', () => {
    // `new THREE.Box3()` is the worker-path placeholder: min/max are infinite.
    const template = createTemplate(new THREE.Box3())

    const clone = clonePlacedMTextTemplate(template, { x: 42, y: 24, z: 0 })

    expect(clone.box?.isEmpty()).toBe(true)
    expect(clone.position.x).toBe(42)
  })

  it('copies a degenerate zero-extent box without relocating it', () => {
    const template = createTemplate(
      new THREE.Box3(new THREE.Vector3(3, 3, 0), new THREE.Vector3(3, 3, 0))
    )

    const clone = clonePlacedMTextTemplate(template, { x: 500, y: 600, z: 0 })

    // An empty bound has nothing to relocate, so it must not become an
    // off-origin box.
    expect(clone.box?.min.x).toBe(3)
    expect(clone.box?.min.y).toBe(3)
    expect(clone.box?.max.x).toBe(3)
    expect(clone.position.x).toBe(500)
  })

  it('tolerates a template without any box', () => {
    const template = createTemplate(null)

    const clone = clonePlacedMTextTemplate(template, { x: 8, y: 9, z: 10 })

    expect(clone.box).toBeUndefined()
    expect(clone.position.x).toBe(8)
    expect(clone.position.y).toBe(9)
    expect(clone.position.z).toBe(10)
  })
})
