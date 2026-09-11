import {
  AcDbSystemVariables,
  AcDbSysVarManager,
  AcGePoint3dLike,
  AcGiMTextAttachmentPoint
} from '@hy/data-model'
import {
  MTextInputBox,
  type MTextToolbarColorPickerFactory,
  type MTextToolbarTheme
} from '@mlightcad/mtext-input-box'
import { MTextAttachmentPoint, MTextColor } from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import { AcApDocManager } from '../../../app'
import { AcTrView2d } from '../../../view'
import { acgiIsLightBackground } from '../../global/AcEdUiColor'
import { registerInlineEditorCloser } from '../AcEdInlineEditorRegistry'

function acGiAttachmentToMText(
  ap: AcGiMTextAttachmentPoint | undefined
): MTextAttachmentPoint | undefined {
  if (ap === undefined) return undefined
  const v = ap as number
  if (v >= 1 && v <= 12) return v as MTextAttachmentPoint
  return MTextAttachmentPoint.TopLeft
}

function mTextAttachmentToAcGi(
  ap: MTextAttachmentPoint
): AcGiMTextAttachmentPoint {
  return ap as unknown as AcGiMTextAttachmentPoint
}

/**
 * Normalizes a width for persistence as DXF group 41.
 *
 * `0` and non-finite values are the "no wrap" encoding, so they must never be
 * replaced by the editor's `Math.max(1, width)` layout floor: that floor exists
 * only to keep the input box usable and is not authored geometry.
 */
function normalizeCommittedWidth(width: number): number {
  return Number.isFinite(width) && width > 0 ? width : 0
}

export type AcEdMTextEditorCurrentFormatChangeListener = () => void
export interface AcEdMTextEditorCurrentFormatObservable {
  addCurrentFormatChangeListener: (
    listener: AcEdMTextEditorCurrentFormatChangeListener
  ) => void
  removeCurrentFormatChangeListener: (
    listener: AcEdMTextEditorCurrentFormatChangeListener
  ) => void
}
export type AcEdMTextEditorActiveInputBox = MTextInputBox &
  Partial<AcEdMTextEditorCurrentFormatObservable> & {
    /**
     * Returns keyboard focus to the hidden IME input used by the editor.
     *
     * Contextual ribbon controls use this after formatting commands so the
     * inline editor keeps behaving like its built-in toolbar.
     */
    focusEditor?: () => void
    /** Returns whether the current selection is a non-script stacked fraction. */
    isStackSelectionActive?: () => boolean
  }
export type AcEdMTextEditorActiveInputBoxChangeListener = (
  inputBox: AcEdMTextEditorActiveInputBox | null
) => void

/**
 * Handle on the MTEXT editor session that is currently open.
 *
 * The handle stays valid until the session settles, so a caller that obtained
 * it from {@link AcEdMTextEditor.getActiveEditor} can always terminate that
 * session even if a newer session replaced it meanwhile.
 */
export interface AcEdMTextEditorHandle {
  /**
   * Terminates the session without producing a result. Equivalent to
   * {@link AcEdMTextEditor.closeActive} for the session that is still active,
   * but bound to the session this handle was created for.
   */
  forceClose(): void
}

type MTextInputBoxRuntimeMethod = (...args: unknown[]) => unknown
type MTextInputBoxRuntimeMethodName =
  | 'setCurrentFormat'
  | 'refreshCurrentFormatFromDocument'
  | 'toggleCase'
  | 'toggleStackSelection'
  | 'toggleScriptSelection'
  | 'setParagraphAlignment'
  | 'setAttachmentPoint'
  | 'setLineSpacingFactor'
  | 'clearLineSpacing'

const mtextFormatBridgeKey = '__mlightcadMTextFormatBridge'

interface MTextInputBoxFormatBridge extends AcEdMTextEditorCurrentFormatObservable {
  dispose: () => void
}

type MTextInputBoxRuntime = MTextInputBox &
  Partial<Record<MTextInputBoxRuntimeMethodName, MTextInputBoxRuntimeMethod>> &
  Partial<AcEdMTextEditorCurrentFormatObservable> & {
    focusEditor?: () => void
    isStackSelectionActive?: () => boolean
    [mtextFormatBridgeKey]?: MTextInputBoxFormatBridge
  }
interface MTextInputBoxRuntimeStackNode {
  type?: string
  divider?: string
  numerator?: string
  denominator?: string
}

/**
 * The subset of a `keydown` event the capture listener reads.
 *
 * Structural on purpose: the listener is installed through a structural
 * `window` cast (a headless host has no `window` at all), so depending on the
 * DOM lib's `KeyboardEvent` would only document a shape nothing here can rely
 * on — the fakes dispatched in tests are plain objects.
 */
interface AcEdMTextEditorKeyEvent {
  key: string
  isComposing?: boolean
  keyCode?: number
  target?: unknown
  defaultPrevented?: boolean
}

type AcEdMTextEditorKeyDownListener = (event: AcEdMTextEditorKeyEvent) => void

/**
 * One live `open()` call.
 *
 * `inputBox` is always present because a session can only be registered once
 * its input box exists. `settle`, `dispose` and `released` are filled in by the
 * promise body, which runs after registration so the cancel path can settle a
 * session even when it runs on the same tick as `open()`.
 */
interface AcEdMTextEditorSession {
  inputBox: MTextInputBox
  settle?: (result: AcEdMTextEditorResult | null) => void
  dispose?: () => void
  /**
   * Marks the session cancelled and detaches the input box's own `close`
   * handling.
   *
   * `MTextInputBox.closeEditor()` emits `close` synchronously, so a cancel path
   * that asked the box to close before detaching would let the result-building
   * handler win the race and turn an Esc into a database write. Installed by the
   * promise body, so it is absent for a setup that never got that far.
   */
  cancel?: () => void
  released: boolean
  finished: boolean
}

/**
 * Result payload returned by the MTEXT editor when editing is finished.
 */
export interface AcEdMTextEditorResult {
  /** Final MTEXT contents (including inline formatting codes). */
  contents: string
  /** Final MTEXT insertion location in world coordinates. */
  location: AcGePoint3dLike
  /** Width the editor laid the text out with, in world units. */
  width: number
  /**
   * Width to persist on the entity (DXF group 41), in world units.
   *
   * Differs from {@link width} for entities with no defined wrap width: the
   * editor needs a positive layout width, but `0` must survive the round trip.
   */
  committedWidth: number
  /**
   * Text height in world units, i.e. DXF group 40.
   *
   * Provided by the caller and never rewritten here: the box on screen is a
   * layout artifact whose pixel height must not leak into the entity data.
   */
  height: number
  /** Line spacing factor used by the MTEXT input box renderer. */
  lineSpacingFactor: number
  /** MTEXT attachment (DXF group 71) matching the editor justify control. */
  attachmentPoint: AcGiMTextAttachmentPoint
  /**
   * Where {@link height} came from.
   *
   * `box` means the caller supplied the height for this session; `style` and
   * `screen` are reserved for callers that derive it from the text style or
   * from a screen-space pick. Absent when the caller did not state an origin,
   * so results stay comparable for callers that never tracked one.
   */
  heightSource?: 'box' | 'style' | 'screen'
  /**
   * Height to persist on the entity (DXF group 40), in world units.
   *
   * Mirrors {@link height} because the editor never rewrites the height; a
   * caller that resolved its own height can use this to report what it will
   * actually write. Absent when the caller did not state one.
   */
  committedHeight?: number
}

/**
 * Options used to open an interactive MTEXT editor.
 */
export interface AcEdMTextEditorOptions {
  /** Active 2D view where the editor overlay and text box are rendered. */
  view: AcTrView2d
  /** Insertion location (top-left anchor) in world coordinates. */
  location: AcGePoint3dLike
  /**
   * Initial MTEXT attachment (DXF 71). When omitted, the editor uses top-left
   * until the user changes justify in the ribbon.
   */
  initialAttachmentPoint?: AcGiMTextAttachmentPoint
  /** Initial MTEXT box width in world units. */
  width: number
  /**
   * Width to persist on the entity as DXF group 41, in world units.
   *
   * `0` and non-finite values mean "no wrap" and are persisted as `0`; a
   * positive value is persisted verbatim. Pass the entity's or the picked box's
   * own width — never the editor's layout width.
   *
   * Defaults to {@link width} normalized the same way. It deliberately does not
   * default to the input box layout width (`Math.max(1, width)`): that floor
   * would turn a sub-unit pick and a "no wrap" (`0`) entity into a 1-unit wrap
   * width on save.
   */
  committedWidth?: number
  /** Default text height in world units. */
  textHeight: number
  /**
   * Where the caller obtained {@link textHeight}.
   *
   * Purely informational: the height itself is always taken from
   * {@link textHeight} and never rewritten here. Omit it when the caller does
   * not track an origin, and the result omits it too.
   */
  heightSource?: 'box' | 'style' | 'screen'
  /** Optional initial MTEXT source string. Defaults to empty string. */
  initialText?: string
  /**
   * Optional font family list displayed in toolbar font dropdown.
   *
   * Empty values are ignored and duplicates are removed before being passed
   * to `MTextInputBox`.
   */
  toolbarFontFamilies?: string[]
  /**
   * Optional custom toolbar color picker factory. When provided (or when set via
   * {@link AcEdMTextEditor.setDefaultColorPicker}), replaces the default native
   * color input in the MTEXT toolbar.
   */
  toolbarColorPicker?: MTextToolbarColorPickerFactory
  /**
   * Controls the built-in MTEXT input box toolbar for this editor instance.
   * Defaults to {@link AcEdMTextEditor.defaultToolbarEnabled}.
   */
  toolbarEnabled?: boolean
}

/**
 * Lightweight wrapper around `MTextInputBox` for CAD editor integration.
 *
 * This class binds the MTEXT input component to the current `AcTrView2d`
 * render loop and handles lifecycle cleanup when the editor is closed.
 *
 * The editor is a singleton resource: {@link open} retires the previous
 * session first, so an overlay, its listeners and its hidden toolbar host can
 * never overlap.
 */
export class AcEdMTextEditor {
  /**
   * Fallback line spacing factor when the MTEXT input box cannot report one.
   *
   * DXF group 44 expresses the factor relative to single spacing, so `1.0` is
   * the contract value. The former `0.3` default silently rewrote the spacing
   * of every edited MTEXT.
   */
  static readonly defaultLineSpacingFactor = 1.0

  private static activeInputBox: MTextInputBox | null = null
  /**
   * Live session behind {@link activeInputBox}.
   *
   * Kept separately so a new `open()` can settle the previous `open()` promise
   * even when the input box never emits its own `close` event (a missing
   * `closeEditor()` used to park the `mtext` command forever).
   */
  private static activeSession: AcEdMTextEditorSession | null = null
  private static readonly activeInputBoxChangeListeners =
    new Set<AcEdMTextEditorActiveInputBoxChangeListener>()

  /**
   * Default toolbar color picker factory used when opening the editor if
   * per-call options do not provide {@link AcEdMTextEditorOptions.toolbarColorPicker}.
   * Set via {@link AcEdMTextEditor.setDefaultColorPicker}.
   */
  static defaultColorPicker: MTextToolbarColorPickerFactory | null = null

  /**
   * Default visibility for the built-in MTEXT input box toolbar. Applications
   * with their own contextual ribbon can disable this while keeping the input
   * box editor active.
   */
  static defaultToolbarEnabled = true

  /**
   * Registers a default toolbar color picker factory. The factory is used for
   * every subsequent {@link open} call unless overridden by
   * {@link AcEdMTextEditorOptions.toolbarColorPicker}.
   *
   * @param factory - Factory to use, or `null` to clear and use the built-in picker.
   */
  static setDefaultColorPicker(
    factory: MTextToolbarColorPickerFactory | null
  ): void {
    AcEdMTextEditor.defaultColorPicker = factory
  }

  /**
   * Registers the default built-in toolbar visibility for subsequent
   * {@link open} calls.
   *
   * @param enabled - `true` to show the MTEXT input box toolbar by default.
   */
  static setDefaultToolbarEnabled(enabled: boolean): void {
    AcEdMTextEditor.defaultToolbarEnabled = enabled
  }

  /**
   * Returns the MTEXT input box currently being edited, if any.
   */
  static getActiveInputBox(): AcEdMTextEditorActiveInputBox | null {
    return AcEdMTextEditor.activeInputBox
  }

  /**
   * Returns a handle that can force the open editor to shut down, or `null`
   * when no editor is open.
   *
   * Prefer this over {@link closeActive} when the caller needs to keep a
   * reference to the session it is cancelling: the handle keeps working even
   * after another session took over, so a stale cancel cannot kill the new
   * editor by accident.
   */
  static getActiveEditor(): AcEdMTextEditorHandle | null {
    const session = AcEdMTextEditor.activeSession
    if (!session || session.finished) return null
    return {
      forceClose: () => {
        AcEdMTextEditor.cancelSession(session)
      }
    }
  }

  /**
   * Subscribes to active MTEXT input box changes.
   */
  static addActiveInputBoxChangeListener(
    listener: AcEdMTextEditorActiveInputBoxChangeListener
  ): void {
    AcEdMTextEditor.activeInputBoxChangeListeners.add(listener)
  }

  /**
   * Removes an active MTEXT input box listener.
   */
  static removeActiveInputBoxChangeListener(
    listener: AcEdMTextEditorActiveInputBoxChangeListener
  ): void {
    AcEdMTextEditor.activeInputBoxChangeListeners.delete(listener)
  }

  private static setActiveInputBox(inputBox: MTextInputBox | null): void {
    if (AcEdMTextEditor.activeInputBox === inputBox) return
    AcEdMTextEditor.activeInputBox = inputBox
    AcEdMTextEditor.activeInputBoxChangeListeners.forEach(listener => {
      listener(inputBox)
    })
  }

  /**
   * Settles one session as cancelled and releases everything it owns.
   *
   * Safe to call repeatedly and from inside a `close` handler; the input box's
   * own `closeEditor()` is just one of the entry points.
   */
  private static finishSession(
    session: AcEdMTextEditorSession,
    result: AcEdMTextEditorResult | null
  ): void {
    if (session.finished) return
    session.finished = true
    if (AcEdMTextEditor.activeSession === session) {
      AcEdMTextEditor.activeSession = null
    }
    // A session that never reached the promise body (setup threw) has no
    // promise to settle; its DOM host is released by the caller.
    if (!session.released) return
    session.dispose?.()
    session.settle?.(result)
    AcEdMTextEditor.setActiveInputBox(null)
    AcEdMTextEditor.detachFormatBridge(session.inputBox)
    session.inputBox.dispose()
  }

  /**
   * Cancels one session: detaches its own `close` handling, asks the input box
   * to tear itself down and settles the promise with `null`.
   *
   * The order is the fix for the cancel path that wrote to the database: the
   * real `MTextInputBox.closeEditor()` emits `close` synchronously, so releasing
   * the box first would let the result-building handler settle the session with
   * a full result and leave the later `finishSession(session, null)` as a no-op.
   *
   * Idempotent: a stale handle pointing at an already settled session does
   * nothing, so it can neither re-resolve nor touch a box that was disposed.
   */
  private static cancelSession(session: AcEdMTextEditorSession): void {
    if (session.finished) return
    session.cancel?.()
    const inputBox = session.inputBox as MTextInputBox & {
      closeEditor?: () => void
    }
    if (typeof inputBox.closeEditor === 'function') {
      inputBox.closeEditor()
    }
    AcEdMTextEditor.finishSession(session, null)
  }

  /**
   * Closes the MTEXT editor that is currently open, if any.
   *
   * The inline editor has no prompt of its own, so the command layer's
   * `cancelActiveInput()` cannot reach it: a running `mtext` command would stay
   * parked on its `open()` promise until the user acted. Command dispatch and
   * document switches call this so the pending command settles immediately
   * (which counts as a cancel and must not write to the database).
   *
   * Unlike {@link getActiveEditor}'s `forceClose`, this targets whatever editor
   * is active right now — use it for process-wide cancellations such as a
   * document switch, and the handle when cancelling a specific session.
   *
   * @returns `true` when an open editor was asked to close.
   */
  static closeActive(): boolean {
    const session = AcEdMTextEditor.activeSession
    if (!session || session.finished) return false
    AcEdMTextEditor.cancelSession(session)
    return true
  }

  private static createHiddenToolbarContainer(
    parent: HTMLElement
  ): HTMLElement {
    const container = parent.ownerDocument.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    Object.assign(container.style, {
      display: 'none',
      pointerEvents: 'none'
    })
    parent.appendChild(container)
    return container
  }

  private static attachFormatBridge(inputBox: MTextInputBox): void {
    const runtime = inputBox as MTextInputBoxRuntime
    if (runtime[mtextFormatBridgeKey]) return

    const listeners = new Set<AcEdMTextEditorCurrentFormatChangeListener>()
    const restoreMethods: Array<() => void> = []
    const notifyFormatChanged = () => {
      listeners.forEach(listener => {
        listener()
      })
    }
    const wrapMethod = (methodName: MTextInputBoxRuntimeMethodName) => {
      const original = runtime[methodName]
      if (typeof original !== 'function') return

      runtime[methodName] = (...args: unknown[]) => {
        const result = original.apply(runtime, args)
        notifyFormatChanged()
        return result
      }
      restoreMethods.push(() => {
        runtime[methodName] = original
      })
    }

    ;(
      [
        'setCurrentFormat',
        'refreshCurrentFormatFromDocument',
        'toggleCase',
        'toggleStackSelection',
        'toggleScriptSelection',
        'setParagraphAlignment',
        'setAttachmentPoint',
        'setLineSpacingFactor',
        'clearLineSpacing'
      ] as const
    ).forEach(wrapMethod)

    runtime.addCurrentFormatChangeListener = listener => {
      listeners.add(listener)
    }
    runtime.removeCurrentFormatChangeListener = listener => {
      listeners.delete(listener)
    }
    runtime.focusEditor = () => {
      const runtimeMethods = runtime as unknown as Record<
        string,
        MTextInputBoxRuntimeMethod | undefined
      >
      const focus = runtimeMethods.focusImeInput
      if (typeof focus === 'function') {
        focus.call(runtime)
        return
      }

      const refocusSoon = runtimeMethods.refocusImeInputSoon
      if (typeof refocusSoon === 'function') {
        refocusSoon.call(runtime)
      }
    }
    runtime.isStackSelectionActive = () => {
      const runtimeMethods = runtime as unknown as Record<string, unknown>
      const getSelectionRange = runtimeMethods.getSelectionRange
      const toDocumentIndexFromLogicalIndex =
        runtimeMethods.toDocumentIndexFromLogicalIndex
      const isScriptOnlyStack = runtimeMethods.isScriptOnlyStack
      const document = runtimeMethods.document as
        | { ast?: { nodes?: MTextInputBoxRuntimeStackNode[] } }
        | undefined

      if (
        typeof getSelectionRange !== 'function' ||
        typeof toDocumentIndexFromLogicalIndex !== 'function'
      ) {
        return false
      }

      const selection = getSelectionRange.call(runtime) as
        | { start: number; end: number; isCollapsed: boolean }
        | undefined
      if (!selection || selection.isCollapsed) return false

      const start = toDocumentIndexFromLogicalIndex.call(
        runtime,
        selection.start,
        true
      ) as number
      const end = toDocumentIndexFromLogicalIndex.call(
        runtime,
        selection.end,
        false
      ) as number
      const selectedNodes = document?.ast?.nodes?.slice(start, end) ?? []
      const stackNode = selectedNodes[0]
      if (selectedNodes.length !== 1 || stackNode?.type !== 'stack') {
        return false
      }

      if (typeof isScriptOnlyStack === 'function') {
        return !isScriptOnlyStack.call(runtime, stackNode)
      }

      if (stackNode.divider !== '^') return true
      const hasNumerator = (stackNode.numerator ?? '').trim().length > 0
      const hasDenominator = (stackNode.denominator ?? '').trim().length > 0
      return hasNumerator === hasDenominator
    }
    runtime[mtextFormatBridgeKey] = {
      addCurrentFormatChangeListener: runtime.addCurrentFormatChangeListener,
      removeCurrentFormatChangeListener:
        runtime.removeCurrentFormatChangeListener,
      dispose: () => {
        restoreMethods.forEach(restore => {
          restore()
        })
        listeners.clear()
        delete runtime.addCurrentFormatChangeListener
        delete runtime.removeCurrentFormatChangeListener
        delete runtime.focusEditor
        delete runtime.isStackSelectionActive
        delete runtime[mtextFormatBridgeKey]
      }
    }
  }

  private static detachFormatBridge(inputBox: MTextInputBox): void {
    const runtime = inputBox as MTextInputBoxRuntime
    runtime[mtextFormatBridgeKey]?.dispose()
  }

  /**
   * Opens the MTEXT editor and resolves when user closes the editor UI.
   *
   * The method:
   * - retires the editor that is already open, settling its promise with `null`
   * - creates a `MTextInputBox` at the requested world location
   * - configures default text style and toolbar options
   * - updates editor state on each view render frame
   * - disposes resources and event listeners on close
   *
   * The returned promise always settles: it resolves with `null` on every
   * cancellation path (the caller closing the editor without a result, a
   * document switch, {@link closeActive}, or a later {@link open}), so a
   * command awaiting it can never park forever.
   *
   * @param options - Runtime options used to initialize the editor instance.
   * @returns A promise resolving to the final MTEXT result, or `null` when the
   * edit was cancelled.
   */
  open(options: AcEdMTextEditorOptions): Promise<AcEdMTextEditorResult | null> {
    const {
      view,
      location,
      width,
      textHeight,
      heightSource,
      initialText = '',
      toolbarFontFamilies = [],
      toolbarColorPicker,
      toolbarEnabled = AcEdMTextEditor.defaultToolbarEnabled,
      initialAttachmentPoint,
      committedWidth
    } = options
    // Retire the previous session before touching the view: a second `open()`
    // must not leave the first `mtext` command waiting for a close that its
    // disposed input box will never deliver.
    const previousSession = AcEdMTextEditor.activeSession
    if (previousSession) AcEdMTextEditor.finishSession(previousSession, null)

    const origin = new THREE.Vector3(location.x, location.y, location.z ?? 0)
    const isLightBg = acgiIsLightBackground(view.backgroundColor)
    const cursorColor = isLightBg ? '#000000' : '#ffffff'
    const docManager = AcApDocManager.instance
    const database = docManager.curDocument.database
    const { layerColor } = docManager.resolveColors()
    const getToolbarTheme = (): MTextToolbarTheme => {
      const rawTheme = AcDbSysVarManager.instance().getVar(
        AcDbSystemVariables.COLORTHEME,
        database
      )
      if (
        rawTheme === 0 ||
        rawTheme === '0' ||
        rawTheme === false ||
        rawTheme === 'dark'
      ) {
        return 'dark'
      }
      return 'light'
    }
    const fontFamilies = Array.from(
      new Set(
        toolbarFontFamilies
          .map(fontName => fontName.trim())
          .filter(fontName => fontName.length > 0)
      )
    )
    const resolveLayerTextStyle = () => {
      // `resolveAt` implements the AutoCAD fallback chain ($TEXTSTYLE →
      // Standard → first entry).
      const record = database.tables.textStyleTable.resolveAt(
        database.textstyle
      )
      return record?.textStyle
    }
    // Text height is never clamped here: clamping turned a user- or
    // style-supplied height into `1` world unit and silently changed the
    // authored DXF group 40. Callers own the minimum, if any.
    const normalizedTextHeight = textHeight
    // The input box lays out with a positive width (`Math.max(1, width)`), so
    // the width it reports back must be the width actually used. Otherwise a
    // sub-unit pick width makes preview and committed geometry disagree.
    // A non-finite pick cannot be laid out at all; the minimum keeps the input
    // box renderable instead of building a NaN-sized one.
    const layoutWidth = Number.isFinite(width) ? width : 0
    const effectiveWidth = Math.max(1, layoutWidth)
    // What the caller persists. DXF group 41 keeps "no wrap" as `0`, so this is
    // normalized on its own and never inherits the layout floor above; an
    // editing session passes the entity's own width here.
    const persistedWidth = normalizeCommittedWidth(committedWidth ?? width)
    const layerTextStyle = resolveLayerTextStyle()
    const defaultTextStyle = layerTextStyle
      ? {
          ...layerTextStyle,
          fixedTextHeight: normalizedTextHeight,
          lastHeight: normalizedTextHeight
        }
      : undefined
    // MTextInputBox still uses its shared toolbar object for internal format
    // sync while editing. Keep that object alive when the app hides the built-in
    // toolbar, but mount it into a hidden host so only the contextual ribbon is
    // visible.
    const hiddenToolbarContainer = toolbarEnabled
      ? null
      : AcEdMTextEditor.createHiddenToolbarContainer(view.container)
    // Closing the session is the only exit, so the hidden toolbar host is
    // released from the same place that releases the listeners. Keeping it in
    // one closure is what makes repeated `open()` calls leak-free.
    const removeToolbarContainer = () => {
      hiddenToolbarContainer?.remove()
    }
    const mtextAttachment = acGiAttachmentToMText(initialAttachmentPoint)

    // The session owns the hidden host, and `dispose` is installed before the
    // input box is built so a failure in between still releases it.
    const session: AcEdMTextEditorSession = {
      inputBox: null as unknown as MTextInputBox,
      released: false,
      finished: false,
      dispose: () => {
        removeToolbarContainer()
      }
    }
    try {
      const mtextInputBox = new MTextInputBox({
        scene: view.internalScene,
        camera: view.internalCamera,
        width: effectiveWidth,
        position: origin.clone(),
        initialText,
        ...(mtextAttachment !== undefined
          ? { initialAttachmentPoint: mtextAttachment }
          : {}),
        textStyle: defaultTextStyle,
        cursorStyle: {
          color: cursorColor,
          glowColor: cursorColor
        },
        boundingBoxStyle: {
          padding: 0
        },
        imeTarget: view.canvas,
        colorSettings: {
          layer: database.clayer,
          color: new MTextColor(),
          byLayerColor: layerColor,
          byBlockColor: layerColor
        },
        toolbar: {
          enabled: true,
          theme: getToolbarTheme(),
          fontFamilies,
          container: hiddenToolbarContainer ?? view.container,
          offsetY: 10,
          colorPicker:
            toolbarColorPicker ??
            AcEdMTextEditor.defaultColorPicker ??
            undefined
        }
      })
      AcEdMTextEditor.attachFormatBridge(mtextInputBox)
      session.inputBox = mtextInputBox
    } catch {
      // Setup can fail (for example when the options do not describe a usable
      // text box). The caller must still get a settled promise instead of a
      // rejection, because the command layer treats a rejection as fatal.
      removeToolbarContainer()
      return Promise.resolve(null)
    }
    AcEdMTextEditor.activeSession = session
    AcEdMTextEditor.setActiveInputBox(session.inputBox)

    return new Promise<AcEdMTextEditorResult | null>(resolve => {
      const mtextInputBox = session.inputBox
      const sysVarChanged = AcDbSysVarManager.instance().events.sysVarChanged
      const frameEvents = view.events.renderFrame
      let unbindFrame: (() => void) | null = null
      let unbindSysVar: (() => void) | null = null
      let unbindEscape: (() => void) | null = null

      session.dispose = () => {
        unbindFrame?.()
        unbindFrame = null
        unbindSysVar?.()
        unbindSysVar = null
        unbindEscape?.()
        unbindEscape = null
        mtextInputBox.off('close', onClose)
        mtextInputBox.off('change', onEditorVisualChange)
        mtextInputBox.off('cursorMove', onEditorVisualChange)
        mtextInputBox.off('selectionChange', onEditorVisualChange)
        removeToolbarContainer()
        view.isHtmlDirty = true
      }
      // From here on the session is cancellable: `finishSession` releases the
      // bindings installed below even if it runs on this very tick.
      session.released = true

      session.settle = result => {
        resolve(result)
      }

      /**
       * Marks the WebGL scene dirty so the glyphs the input box draws into
       * `view.internalScene` are actually painted.
       *
       * `isHtmlDirty` alone only triggers a CSS2D pass ("Does not force a
       * WebGL redraw" in AcTrView2d); typing used to stay invisible until a
       * pan or zoom happened to set `isDirty`.
       *
       * Event driven on purpose: marking `isDirty` unconditionally inside
       * `onRenderFrame` would repaint the whole WebGL scene every frame for
       * as long as the editor is open.
       */
      const onEditorVisualChange = () => {
        if (session.finished) return
        view.isDirty = true
      }

      const onRenderFrame = () => {
        if (session.finished) return
        mtextInputBox.update()
        view.isHtmlDirty = true
      }

      const onSysVarChanged = (args: { name: string; database: unknown }) => {
        if (
          args.name.toLowerCase() !==
          AcDbSystemVariables.COLORTHEME.toLowerCase()
        ) {
          return
        }
        mtextInputBox.setToolbarTheme(getToolbarTheme())
        view.isHtmlDirty = true
      }

      // A `close` from the input box is only a *candidate* result. The library
      // funnels both its `Esc` handler and a click outside the box through
      // `closeEditor()`, and emits the same `close` for each, so the event alone
      // cannot tell a cancel from a commit. Settling is therefore deferred by
      // one microtask: a cancel raised in the same task — the command layer's
      // `Esc` handling, a document switch, a second `open()`, which all arrive
      // after the library's own key handler — then wins the race. Settling
      // synchronously here is what used to resolve a full result on Esc and
      // leave the later `finishSession(session, null)` a no-op that wrote the
      // cancelled MTEXT into the database.
      let cancelRequested = false
      let pendingResult: AcEdMTextEditorResult | null = null
      let commitScheduled = false

      const commitPendingResult = () => {
        if (session.finished) return
        AcEdMTextEditor.finishSession(
          session,
          cancelRequested ? null : pendingResult
        )
      }

      const onClose = () => {
        // A cancelled session must never produce a result, and one `close` must
        // schedule exactly one settle.
        if (session.finished || cancelRequested || commitScheduled) return
        commitScheduled = true
        const insertionPoint = mtextInputBox.getMTextInsertionPoint()
        pendingResult = {
          contents: mtextInputBox.getText(),
          location: {
            x: insertionPoint.x,
            y: insertionPoint.y,
            z: insertionPoint.z
          },
          width: effectiveWidth,
          committedWidth: persistedWidth,
          height: normalizedTextHeight,
          lineSpacingFactor:
            mtextInputBox.getLineSpacingFactor?.() ??
            AcEdMTextEditor.defaultLineSpacingFactor,
          attachmentPoint: mTextAttachmentToAcGi(
            mtextInputBox.getMTextAttachmentPoint()
          ),
          // Optional fields are echoed only when the caller stated them: a
          // caller that never tracked a height origin must keep seeing the
          // result shape it signed up for.
          ...(heightSource !== undefined ? { heightSource } : {}),
          ...(heightSource !== undefined
            ? { committedHeight: normalizedTextHeight }
            : {})
        }
        queueMicrotask(commitPendingResult)
      }

      // Detach before asking the box to close: `closeEditor()` emits `close`
      // synchronously, and this handler is what would otherwise turn a cancel
      // into a result. The flag covers a runtime whose `off()` is a no-op.
      session.cancel = () => {
        if (session.finished) return
        cancelRequested = true
        mtextInputBox.off('close', onClose)
      }

      // The library funnels its own Escape handling and a click outside the box
      // through the single closeEditor()/close pair, so the event alone cannot
      // tell a cancel from a commit; a bare Escape would resolve a full result and
      // commit the text. Claim the key in the capture phase, before the library's
      // window-level handler sees it, so Escape stays a real cancel. The library
      // still runs its own teardown for the same key press, which then settles this
      // session as cancelled.
      //
      // A capture listener sees the key before anyone else — including whoever the
      // key was actually meant for — so it has to reproduce the exemptions the
      // library applies in its own window handler (`onWindowKeyDown`): an IME owns
      // Escape while it composes, and a native editable element other than the
      // library's own IME bridge owns it always (the toolbar's font size input, a
      // host's command line, any form control). `defaultPrevented` belongs to the
      // same contract: a key another handler already dealt with is not ours. A
      // listener without those guards settles this session as cancelled on an
      // Escape that never addressed the editor, silently discarding the MTEXT.
      //
      // `window` is absent in headless hosts (unit tests, non-browser runners);
      // the library guards its own window listeners the same way.
      const keydownTarget =
        typeof window === 'undefined'
          ? null
          : (window as unknown as {
              addEventListener: (
                type: string,
                listener: AcEdMTextEditorKeyDownListener,
                options?: boolean
              ) => void
              removeEventListener: (
                type: string,
                listener: AcEdMTextEditorKeyDownListener,
                options?: boolean
              ) => void
            })

      /**
       * Whether a key event is addressed to some other editable element.
       *
       * The library focuses a hidden `<textarea>` it appends to the document body
       * (`attachImeBridge`), not the canvas it was handed as `imeTarget`, so the
       * events this listener must act on target that textarea. Exempting every
       * native editable but the canvas would therefore exempt the editor's own
       * keyboard focus and swallow every real Escape — the field is undocumented
       * (private in the shipped types, present at runtime) and is read per event
       * because the bridge is rebuilt whenever the editor re-activates.
       */
      const isForeignEditableKeyTarget = (target: unknown): boolean => {
        if (!target || typeof target !== 'object') return false
        const element = target as {
          tagName?: string
          isContentEditable?: boolean
        }
        const tagName =
          typeof element.tagName === 'string'
            ? element.tagName.toUpperCase()
            : ''
        const isNativeEditable =
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          element.isContentEditable === true
        if (!isNativeEditable) return false
        const imeInput = (
          session.inputBox as unknown as { imeInput?: unknown }
        ).imeInput
        return target !== imeInput && target !== view.canvas
      }

      const onEscapeKeyDown: AcEdMTextEditorKeyDownListener = event => {
        // A composing IME turns Escape into "dismiss the candidate window"; the
        // text is still being typed, so the session must stay open. `keyCode 229`
        // is how browsers report composition without setting `isComposing`.
        if (event.isComposing || event.keyCode === 229) return
        if (event.key !== 'Escape') return
        if (event.defaultPrevented) return
        if (isForeignEditableKeyTarget(event.target)) return
        if (session.finished) return
        // `cancelSession` settles this session as null and is idempotent, so the
        // library's own close cannot turn the same key press into a commit.
        AcEdMTextEditor.cancelSession(session)
      }
      if (keydownTarget) {
        keydownTarget.addEventListener('keydown', onEscapeKeyDown, true)
        unbindEscape = () => {
          keydownTarget.removeEventListener('keydown', onEscapeKeyDown, true)
        }
      }

      mtextInputBox.on('close', onClose)
      mtextInputBox.on('change', onEditorVisualChange)
      mtextInputBox.on('cursorMove', onEditorVisualChange)
      mtextInputBox.on('selectionChange', onEditorVisualChange)
      frameEvents.addEventListener(onRenderFrame)
      unbindFrame = () => {
        frameEvents.removeEventListener(onRenderFrame)
      }
      sysVarChanged.addEventListener(onSysVarChanged)
      unbindSysVar = () => {
        sysVarChanged.removeEventListener(onSysVarChanged)
      }
    })
  }
}

// Let the command stack and the document manager dismiss an open editor without
// importing this module (and the browser-side input box it depends on).
registerInlineEditorCloser(() => AcEdMTextEditor.closeActive())
