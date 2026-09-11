/**
 * REG-3 regression guard for {@link AcApDocManager.destroy}.
 *
 * An open inline MTEXT editor parks its `mtext` command on the editor's promise
 * and binds a capture `keydown` listener on `window`. `destroy()` used to tear
 * the view and the drawing database down without closing it, leaving the
 * session, its input box, its toolbar host and that window listener alive while
 * the command never settled.
 *
 * The editor itself is not reachable from here (this harness replaces the whole
 * editor barrel), so the assertion targets the documented contract: `destroy()`
 * calls the inline-editor registry's closer. That the registered closer really
 * is `AcEdMTextEditor.closeActive` is covered separately by the editor's own
 * suite, because both sides share the process-wide registry singleton.
 */

const mockInitialize = jest.fn()
const mockGetInstance = jest.fn(() => ({
  initialize: mockInitialize,
  setRenderMode: jest.fn(),
  setDefaultFonts: jest.fn(() => Promise.resolve()),
  setLazyFontLoading: jest.fn(() => Promise.resolve()),
  setAwaitFontsBeforeDraw: jest.fn(() => Promise.resolve()),
  clearDocument: jest.fn()
}))

/** Stand-in with the one member the manager configures (`baseUrl`). */
class MockAcApFontLoader {
  baseUrl = ''
  load = jest.fn(() => Promise.resolve())
  avaiableFonts: string[] = []
}

const mockUnloadAllPlugins = jest.fn(() => Promise.resolve())
const mockDocDestroy = jest.fn()
const mockStopAnimationLoop = jest.fn()
const mockViewDispose = jest.fn()
const mockBindDrawDatabase = jest.fn()
const mockUninstallOpenFileDialog = jest.fn()
const mockCloseActiveInlineEditor = jest.fn(() => true)

jest.mock('../src/app/AcApFontLoader', () => ({
  AcApFontLoader: MockAcApFontLoader
}))

jest.mock('@hy/three-renderer', () => ({
  // The shipped bundle cannot initialize in the jest `node` environment, so the
  // two members the manager's module graph touches are stood in for: the font
  // loader it constructs and the renderer singleton it configures.
  AcTrFontLoader: class AcTrFontLoader {},
  AcTrMTextRenderer: {
    getInstance: mockGetInstance,
    resetInstance: jest.fn()
  }
}))

jest.mock('../src/view', () => ({
  AcTrView2d: jest.fn().mockImplementation(() => ({
    container: {},
    editor: {
      clearScriptInputs: jest.fn(),
      enqueueScriptInputs: jest.fn()
    },
    renderer: {},
    ltscale: 1,
    celtscale: 1,
    clear: jest.fn(),
    zoomToFitDrawing: jest.fn(),
    zoomTo: jest.fn(),
    stopAnimationLoop: mockStopAnimationLoop,
    dispose: mockViewDispose,
    bindDrawDatabase: mockBindDrawDatabase
  }))
}))

jest.mock('../src/app/AcApDocument', () => ({
  AcApDocument: jest.fn().mockImplementation(() => ({
    openMode: 0,
    destroy: mockDocDestroy,
    database: {
      events: {
        openProgress: {
          addEventListener: jest.fn()
        }
      },
      ltscale: 1,
      celtscale: 1,
      lwdisplay: false,
      extents: {
        isEmpty: jest.fn(() => true)
      },
      tables: {
        blockTable: {
          modelSpace: {
            objectId: 'model-space'
          }
        }
      },
      currentSpaceId: 'model-space'
    }
  }))
}))

jest.mock('../src/app/AcApProgress', () => ({
  AcApProgress: jest.fn().mockImplementation(() => ({
    hide: jest.fn(),
    show: jest.fn(),
    setMessage: jest.fn()
  }))
}))

jest.mock('../src/app/AcApContext', () => ({
  AcApContext: jest.fn().mockImplementation((view, doc) => ({ view, doc }))
}))

jest.mock('../src/plugin/AcApPluginManager', () => ({
  AcApPluginManager: jest.fn().mockImplementation(() => ({
    unloadAllPlugins: mockUnloadAllPlugins,
    loadPluginsFromConfig: jest.fn(() =>
      Promise.resolve({ loaded: [], failed: [] })
    ),
    loadPluginsFromFolder: jest.fn(() =>
      Promise.resolve({ loaded: [], failed: [] })
    )
  }))
}))

jest.mock('../src/ui/AcApDrawStyleToolbar', () => ({
  AcApDrawStyleToolbar: jest.fn().mockImplementation(() => ({
    dispose: jest.fn()
  }))
}))

// The closer is asserted through the registry contract instead of the editor
// implementation: this file must not pull the browser-side input box in.
jest.mock('../src/editor', () => ({
  AcEdCommandStack: jest.fn().mockImplementation(() => ({
    addCommand: jest.fn(),
    lookupGlobalCmd: jest.fn(),
    lookupLocalCmd: jest.fn(),
    searchCommandsByPrefix: jest.fn()
  })),
  AcEdOpenMode: {
    Read: 0
  },
  eventBus: {
    emit: jest.fn()
  },
  closeActiveInlineEditor: mockCloseActiveInlineEditor
}))

// `registerCommands` instantiates one object per command class, so every export
// has to be a constructor rather than a bare mock.
jest.mock('../src/command', () => {
  const commandNames = [
    'AcApAboutCmd',
    'AcApArcCmd',
    'AcApCacheFontCmd',
    'AcApCircleCmd',
    'AcApClearMarkupsCmd',
    'AcApClearMeasurementsCmd',
    'AcApConvertToDxfCmd',
    'AcApConvertToPngCmd',
    'AcApEntityPreviewCmd',
    'AcApCopyCmd',
    'AcApDimLinearCmd',
    'AcApEllipseCmd',
    'AcApEraseCmd',
    'AcApHideObjectsCmd',
    'AcApHatchCmd',
    'AcApImageAttachCmd',
    'AcApInsertCmd',
    'AcApLayerCloseCmd',
    'AcApLayerCmd',
    'AcApLayerCurCmd',
    'AcApLayerDelCmd',
    'AcApLayerFreezeCmd',
    'AcApLayerIsoCmd',
    'AcApLayerLockCmd',
    'AcApLayerOnCmd',
    'AcApLayerPCmd',
    'AcApLayerThawCmd',
    'AcApLayerUnisoCmd',
    'AcApLayerUnlockCmd',
    'AcApLayoffCmd',
    'AcApLineCmd',
    'AcApLogCmd',
    'AcApMarkupArrowCmd',
    'AcApMarkupCalloutCmd',
    'AcApMarkupCircleCmd',
    'AcApMarkupCloudCmd',
    'AcApMarkupExportCmd',
    'AcApMarkupHighlightCmd',
    'AcApMarkupImportCmd',
    'AcApMarkupLineCmd',
    'AcApMarkupRectCmd',
    'AcApMarkupStampCmd',
    'AcApMarkupTextCmd',
    'AcApMarkupVisibilityCmd',
    'AcApMeasureAngleCmd',
    'AcApMeasureArcCmd',
    'AcApMeasureAreaCmd',
    'AcApMeasureDistanceCmd',
    'AcApMeasurementExportCmd',
    'AcApMeasurementImportCmd',
    'AcApMeasurementVisibilityCmd',
    'AcApMeasurePointCmd',
    'AcApMLineCmd',
    'AcApMoveCmd',
    'AcApMTextCmd',
    'AcApOffsetCmd',
    'AcApOpenCmd',
    'AcApPanCmd',
    'AcApPointCmd',
    'AcApPolygonCmd',
    'AcApPolylineCmd',
    'AcApQNewCmd',
    'AcApRayCmd',
    'AcApRectCmd',
    'AcApRegenCmd',
    'AcApRevCloudCmd',
    'AcApRedoCmd',
    'AcApRotateCmd',
    'AcApSelectCmd',
    'AcApSketchCmd',
    'AcApSplineCmd',
    'AcApSwitchBgCmd',
    'AcApSysVarCmd',
    'AcApUndoCmd',
    'AcApUnisolateObjectsCmd',
    'AcApXAttachCmd',
    'AcApXLineCmd',
    'AcApZoomCmd'
  ]
  return {
    ...Object.fromEntries(
      commandNames.map(name => [
        name,
        jest.fn().mockImplementation(() => ({ trigger: jest.fn() }))
      ])
    ),
    resetMarkupSession: jest.fn(),
    resetMeasurementSession: jest.fn()
  }
})

jest.mock('../src/app/AcApOpenFileDialog', () => ({
  acapInstallOpenFileDialog: jest.fn(),
  acapUpdateOpenFileDialogOptions: jest.fn(),
  acapUninstallOpenFileDialog: mockUninstallOpenFileDialog
}))

jest.mock('@hy/data-model', () => ({
  AcCmColor: jest.fn(),
  AcCmEventManager: jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    dispatch: jest.fn()
  })),
  AcDbDatabaseConverterManager: {
    instance: {
      register: jest.fn()
    }
  },
  AcDbFileType: {
    DXF: 'DXF',
    DWG: 'DWG'
  },
  AcDbSysVarManager: {
    instance: jest.fn(() => ({
      getAllDescriptors: jest.fn(() => [])
    }))
  },
  AcGeBox2d: jest.fn(),
  acdbHostApplicationServices: jest.fn(() => ({})),
  log: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}))

import { AcApDocManager } from '../src/app/AcApDocManager'

/** Shape destroy() needs from the view the manager built. */
interface FakeDestroyableView {
  stopAnimationLoop: jest.Mock
  dispose: jest.Mock
  bindDrawDatabase: jest.Mock
}

describe('AcApDocManager.destroy inline editor cleanup', () => {
  beforeEach(() => {
    ;(AcApDocManager as unknown as { _instance: unknown })._instance = undefined
    mockCloseActiveInlineEditor.mockClear()
    mockUnloadAllPlugins.mockClear()
    mockDocDestroy.mockClear()
    mockStopAnimationLoop.mockClear()
    mockViewDispose.mockClear()
    mockBindDrawDatabase.mockClear()
    mockUninstallOpenFileDialog.mockClear()
  })

  it('closes the active inline editor before tearing the view down', async () => {
    const manager = AcApDocManager.createInstance({})
    // `createInstance` is typed as optional, but this harness satisfies every
    // dependency the constructor needs, so a missing instance is a real failure.
    expect(manager).toBeDefined()
    const view = manager!.context.view as unknown as FakeDestroyableView

    await manager!.destroy()

    // The contract the editor registry exposes: whoever holds the open inline
    // editor is asked to close it, exactly once, for this call.
    expect(mockCloseActiveInlineEditor).toHaveBeenCalledTimes(1)
    // Ordering matters: the editor's teardown touches the view it renders into,
    // so closing it after the view is gone would leave the session half alive.
    const closeOrder = mockCloseActiveInlineEditor.mock.invocationCallOrder[0]
    expect(closeOrder).toBeLessThan(
      view.stopAnimationLoop.mock.invocationCallOrder[0]
    )
    expect(closeOrder).toBeLessThan(mockDocDestroy.mock.invocationCallOrder[0])
    // The rest of the teardown still runs.
    expect(mockUnloadAllPlugins).toHaveBeenCalledTimes(1)
    expect(mockUninstallOpenFileDialog).toHaveBeenCalledTimes(1)
    // The singleton slot is cleared, so a destroyed manager cannot be reached.
    // Read through the field: the `instance` getter throws once it is cleared.
    expect(
      (AcApDocManager as unknown as { _instance: unknown })._instance
    ).toBeUndefined()
  })
})
