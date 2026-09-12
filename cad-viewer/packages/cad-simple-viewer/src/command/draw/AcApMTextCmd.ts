import { AcDbMText, AcGiMTextAttachmentPoint } from '@hy/data-model'

import { AcApContext, AcApDocManager } from '../../app'
import {
  AcEdCommand,
  AcEdMTextEditor,
  AcEdOpenMode,
  AcEdPromptBoxOptions,
  AcEdPromptStatus
} from '../../editor'
import { AcApI18n } from '../../i18n'
import { AcTrView2d } from '../../view'

/**
 * World-unit floor for a text height.
 *
 * It guards one branch only: the on-screen fallback, which is estimated from a
 * pixel size via the current camera and can collapse to a non-positive value.
 * It is deliberately far below any plausible drawing unit so that a picked box
 * or an authored style height is never raised to it — clamping those would
 * silently rewrite DXF group 40.
 */
export const ACDB_MTEXT_MIN_HEIGHT = 1e-4

/**
 * On-screen fallback height, in CSS pixels, used only when neither the current
 * text style nor the picked box can supply a height. Mirrors the "readable
 * default" idea of AutoCAD's `TEXTSIZE` prompt.
 */
const FALLBACK_TEXT_HEIGHT_PX = 24

/**
 * Normalizes a picked box width into the value persisted as DXF group 41.
 *
 * `0` is a meaningful authored value ("no wrap"), not a missing one, so every
 * degenerate pick collapses to it rather than to a substitute width. Only a
 * non-finite width — a broken measurement, never a real pick — joins the same
 * branch, because a NaN would otherwise be stored and hide the entity.
 */
function toCommittedWidth(width: number) {
  return Number.isFinite(width) && width > 0 ? width : 0
}

/**
 * Which input supplied the height written to DXF group 40.
 *
 * Reported to the editor so a height that surprises the user can be traced back
 * to the branch that produced it.
 */
export type AcApMTextHeightSource = 'box' | 'style' | 'screen'

/**
 * Command to create one mtext entity.
 *
 * Text height resolution (see `docs/03-缺陷修复与功能改造/text-audit/修复契约.md` D1):
 * 1. the height of the box the user just picked (an explicit action wins over
 *    any stored default);
 * 2. otherwise a fixed height on the current text style (`fixedTextHeight`,
 *    DXF group 40 of the style);
 * 3. otherwise a readable on-screen height.
 */
export class AcApMTextCmd extends AcEdCommand {
  private readonly mtextEditor = new AcEdMTextEditor()

  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(context: AcApContext) {
    const boxPrompt = new AcEdPromptBoxOptions(
      AcApI18n.t('main.inputManager.firstCorner'),
      AcApI18n.t('main.inputManager.secondCorner')
    )
    boxPrompt.useBasePoint = false
    boxPrompt.useDashedLine = false
    const boxResult = await AcApDocManager.instance.editor.getBox(boxPrompt)
    if (boxResult.status !== AcEdPromptStatus.OK || !boxResult.value) return
    const box = boxResult.value

    const database = context.doc.database
    const width = Math.abs(box.max.x - box.min.x)
    const view = context.view as AcTrView2d
    // `$TEXTSTYLE` as it was before the editor opened. The inline editor's
    // Format panel repoints it while the user is typing, so a cancelled or
    // rejected edit has to put it back: without a new entity there is nothing
    // for that choice to apply to and the drawing must be exactly as it was
    // (fix contract D2/D5 - cancel means zero database writes).
    const textStyleBeforeEdit = database.textstyle
    /**
     * Discards an edit that produced no entity, including the text style the
     * Format panel may have switched in the meantime.
     */
    const discardEdit = () => {
      database.textstyle = textStyleBeforeEdit
    }
    // Snapshot used for the height contract below only. The style written to
    // the entity is resolved again after the editor closes, because the
    // contextual Format panel can switch the drawing's current text style
    // while the user is typing (see `committedStyleName`).
    const textStyleRecord = database.tables.textStyleTable.resolveAt(
      database.textstyle
    )
    const resolvedHeight = this.resolveTextHeight(
      view,
      textStyleRecord,
      box.max.y - box.min.y
    )
    // Checked before opening the editor as well: an invalid height would make
    // the editor lay out a degenerate box for an entity that can never pass
    // the post-edit validation below.
    if (!(resolvedHeight.height > 0)) {
      this.showMessage(AcApI18n.t('jig.mtext.invalidHeight'), 'warning')
      return
    }
    const location = { x: box.min.x, y: box.max.y, z: 0 }
    const toolbarFontFamilies = Array.from(
      new Set(
        AcApDocManager.instance.avaiableFonts
          .flatMap(fontInfo => fontInfo.name)
          .map(fontName => fontName.trim())
          .filter(fontName => fontName.length > 0)
      )
    )
    const result = await this.mtextEditor.open({
      view,
      location,
      width,
      // The picked width is the authored value for DXF group 41, so it is passed
      // explicitly: without it the editor persists its own layout width, which
      // is floored to at least one world unit to keep the input box usable, and
      // a sub-unit pick (or the degenerate `0` = "no wrap" pick) would silently
      // be written as 1.
      committedWidth: toCommittedWidth(width),
      textHeight: resolvedHeight.height,
      heightSource: resolvedHeight.source,
      toolbarFontFamilies
    })
    if (!result) {
      // Cancel (Esc, a document switch, a second `open()`): the style the
      // Format panel picked is rolled back with the rest of the edit.
      discardEdit()
      return
    }

    const contents = result.contents.trim()
    if (!contents) {
      discardEdit()
      this.showMessage(AcApI18n.t('jig.mtext.emptyContents'), 'warning')
      return
    }
    const height = Number(result.height)
    if (!(height > 0)) {
      discardEdit()
      this.showMessage(AcApI18n.t('jig.mtext.invalidHeight'), 'warning')
      return
    }

    // Normalized exactly like the value handed to the editor: a `0` committed
    // width means "no wrap" (DXF group 41) and must survive the round trip, so
    // the editor must never be able to widen the authored pick.
    const mtextWidth = toCommittedWidth(Number(result.committedWidth))

    const mtext = new AcDbMText()
    mtext.location = result.location
    mtext.contents = result.contents
    mtext.width = mtextWidth
    // The editor echoes the height it was opened with; this command owns that
    // value and never re-derives it from the final box.
    mtext.height = height
    mtext.lineSpacingFactor = result.lineSpacingFactor
    // DXF group 71 is only valid in 1..9; never let an out-of-range editor
    // value reach the database.
    const attachment = Number(result.attachmentPoint)
    mtext.attachmentPoint =
      Number.isInteger(attachment) && attachment >= 1 && attachment <= 9
        ? (attachment as AcGiMTextAttachmentPoint)
        : AcGiMTextAttachmentPoint.TopLeft
    // The style is re-resolved *after* the editor closed rather than taken from
    // the pre-open snapshot, because the inline editor's Format panel makes the
    // style the user picked the drawing's current one (`$TEXTSTYLE`) while the
    // editor is open: fix contract D5 freezes the entity's DXF group 7 to the
    // current text style record at commit time, so the text that was just
    // styled is created with the style the user chose. The pre-open snapshot
    // still supplies the height above and is the defensive fallback here.
    const committedStyleName =
      database.tables.textStyleTable.resolveAt(database.textstyle)?.name ??
      textStyleRecord?.name
    if (committedStyleName) {
      mtext.styleName = committedStyleName
    }
    mtext.layer = database.clayer ?? '0'

    database.tables.blockTable.modelSpace.appendEntity(mtext)
  }

  /**
   * Resolves the text height written to DXF group 40 together with the input
   * it came from.
   *
   * Priority follows "explicit user action first" (see the fix contract D1):
   * the box the user just picked, else a fixed height on the current text style,
   * else a readable on-screen default.
   *
   * The style priorSize ("last height used", DXF group 42) is deliberately
   * not consulted: AutoCAD default drawings set $TEXTSIZE = 0.2, so trusting
   * it would render a 200x30 pixel pick as 0.2 drawing units of text -
   * visible only as a few ink pixels.
   *
   * @param view - Active 2D view used for the on-screen fallback.
   * @param styleRecord - Resolved current text style record, when available.
   * @param boxHeight - Picked box height in world units (may be negative).
   */
  private resolveTextHeight(
    view: AcTrView2d,
    styleRecord: { textSize?: number } | undefined,
    boxHeight: number
  ): { height: number; source: AcApMTextHeightSource } {
    const pickedHeight = Math.abs(boxHeight)
    if (pickedHeight > 0) return { height: pickedHeight, source: 'box' }
    const fixedHeight = styleRecord?.textSize ?? 0
    if (fixedHeight > 0) return { height: fixedHeight, source: 'style' }
    return {
      height: this.pixelsToWorldY(view, FALLBACK_TEXT_HEIGHT_PX),
      source: 'screen'
    }
  }

  private pixelsToWorldY(view: AcTrView2d, pixels: number) {
    const p0 = view.screenToWorld({ x: 0, y: 0 })
    const p1 = view.screenToWorld({ x: 0, y: pixels })
    return Math.max(Math.abs(p1.y - p0.y), ACDB_MTEXT_MIN_HEIGHT)
  }
}
