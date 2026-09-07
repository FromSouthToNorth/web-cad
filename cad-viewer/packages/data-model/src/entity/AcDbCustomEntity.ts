import { AcDbCurve } from './AcDbCurve'
import { acdbRegisterCustomEntity } from './AcDbCustomEntityRegistry'

/**
 * Abstract base class for custom entities, in the spirit of MxCAD
 * `McDbCustomEntity`.
 *
 * A custom entity is one semantic object in the database (one entry in the
 * selection set, one row in the property palette, one undo step) whose
 * geometry and DXF representation are fully defined by the subclass.
 *
 * Concept mapping for developers coming from MxCAD:
 *
 * | MxCAD `McDbCustomEntity`     | This class                                        |
 * | ---------------------------- | ------------------------------------------------- |
 * | `getTypeName()`              | `dxfTypeName` (getter)                            |
 * | `worldDraw(draw)`            | `subWorldDraw(renderer)`                          |
 * | `dwgInFields/dwgOutFields`   | `dxfInFields/dxfOutFields`                        |
 * | `getGripPoints()`            | `subGetGripPoints()`                              |
 * | `moveGripPointsAt(...)`      | `subMoveGripPointsAt(indices, offset)`            |
 * | `transformBy(mat)`           | `transformBy(matrix)`                             |
 * | `create(imp?)`               | `create()`                                        |
 * | `clone()`                    | `clone()` (automatic deep copy from `AcDbObject`) |
 * | `rxInit()`                   | `rxInit()`                                        |
 *
 * Minimal subclass checklist:
 * 1. Implement `dxfTypeName` and `subWorldDraw` (plus `geometricExtents`,
 *    `closed`, `area` and `getOffsetCurves` required by {@link AcDbCurve};
 *    consider deriving from `AcDbCenterlineCurve` to get those for free).
 * 2. Implement `dxfOutFields` / `dxfInFields` to persist custom parameters.
 * 3. Register the type once with `new MyEntity().rxInit()` so DXF import can
 *    recreate it (see {@link acdbRegisterCustomEntity}).
 *
 * Optional overrides: `subGetGripPoints` / `subMoveGripPointsAt` (grip
 * editing), `subGetOsnapPoints` (object snap), `transformBy` (move / rotate /
 * mirror), `properties` (property palette entries), `create` (when the
 * constructor requires arguments).
 *
 * @example
 * ```typescript
 * class AcDbMyEntity extends AcDbCustomEntity {
 *   get dxfTypeName() { return 'MYENTITY' }
 *   // ... implement the other abstract members ...
 * }
 * new AcDbMyEntity().rxInit() // register once, e.g. at plugin startup
 * ```
 */
export abstract class AcDbCustomEntity extends AcDbCurve {
  /**
   * Creates one new empty instance of this custom entity type.
   *
   * The default implementation invokes the parameterless constructor, which
   * works whenever the subclass constructor has all-optional arguments.
   * Override it when the constructor requires arguments.
   *
   * It is used by {@link rxInit} to build the DXF import factory.
   */
  create(): this {
    const ctor = this.constructor as new () => this
    return new ctor()
  }

  /**
   * Registers this custom entity type for DXF import.
   *
   * After registration, DXF files containing this entity's `dxfTypeName` are
   * read back as instances of this class instead of being skipped. Call it
   * once per type, for example at application or plugin startup:
   *
   * ```typescript
   * new AcDbMyEntity().rxInit()
   * ```
   *
   * @throws Error when the same DXF type name is registered twice
   */
  rxInit(): void {
    acdbRegisterCustomEntity(this.dxfTypeName, () => this.create())
  }
}
