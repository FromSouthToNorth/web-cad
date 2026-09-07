import { acdbDxfKeywordUpper } from '../base/AcDbDxfKeyword'
import type { AcDbEntity } from './AcDbEntity'

/**
 * Factory that creates one empty custom entity instance, ready for `dxfIn`.
 */
export type AcDbCustomEntityFactory = () => AcDbEntity

const customEntityFactories = new Map<string, AcDbCustomEntityFactory>()

/**
 * Registers one custom entity type so that DXF import can recreate it.
 *
 * The DXF entity factory ({@link acdbCreateEntityForDxfIn}) consults this
 * registry for every type name not covered by its built-in switch, so custom
 * entities implemented by host applications or plugins round-trip through
 * DXF without modifying the library.
 *
 * Notes:
 * - The type name is case-insensitive (normalized to upper case).
 * - Custom entity types cannot round-trip through binary DWG files.
 *
 * @param dxfTypeName - DXF record type name, such as `ROADWAY`
 * @param factory - Factory that creates one empty entity instance
 * @throws Error when the same type name is registered twice
 *
 * @example
 * ```typescript
 * acdbRegisterCustomEntity('ROADWAY', () => new AcDbRoadway())
 * ```
 */
export function acdbRegisterCustomEntity(
  dxfTypeName: string,
  factory: AcDbCustomEntityFactory
): void {
  const key = acdbDxfKeywordUpper(dxfTypeName)
  if (customEntityFactories.has(key)) {
    throw new Error(
      `Custom entity type '${key}' has already been registered.`
    )
  }
  customEntityFactories.set(key, factory)
}

/**
 * Returns whether one custom entity type was registered.
 *
 * @param dxfTypeName - DXF record type name to test
 */
export function acdbHasCustomEntity(dxfTypeName: string): boolean {
  return customEntityFactories.has(acdbDxfKeywordUpper(dxfTypeName))
}

/**
 * Creates one empty instance of the registered custom entity type.
 *
 * @param dxfTypeName - DXF record type name, such as `ROADWAY`
 * @returns The new entity instance, or `null` when the type is not registered
 */
export function acdbCreateCustomEntity(
  dxfTypeName: string
): AcDbEntity | null {
  const factory = customEntityFactories.get(acdbDxfKeywordUpper(dxfTypeName))
  return factory ? factory() : null
}
