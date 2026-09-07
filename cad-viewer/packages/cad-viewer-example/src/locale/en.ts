export default {
  command: {
    ACAD: {
      quit: {
        description: 'Exits the application and closes all open drawings'
      },
      exit: {
        description: 'Exits the application and closes all open drawings'
      }
    }
  },
  fileUpload: {
    title: 'Select CAD File to View',
    subtitle: 'Import DXF drawings into the viewer',
    newDrawing: 'New Drawing',
    or: 'or',
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
    dropFile: 'Drop file or',
    browse: 'browse',
    openOptions: 'Open options',
    initialView: 'Initial view',
    accessMode: 'Access mode',
    textRendering: 'Text rendering',
    progressive: 'Progressive',
    nonPlottable: 'Non-plottable',
    viewModes: {
      auto: 'Auto',
      autoDesc: 'Based on access mode',
      extents: 'Extents',
      extentsDesc: 'Fit drawing',
      saved: 'Saved',
      savedDesc: 'AutoCAD saved view'
    },
    accessModes: {
      read: 'Read',
      readDesc: 'View only',
      review: 'Review',
      reviewDesc: 'View & review',
      write: 'Write',
      writeDesc: 'Full access'
    },
    textRenderingModes: {
      worker: 'Worker',
      workerDesc: 'Faster, more memory',
      mainThread: 'Main thread',
      mainThreadDesc: 'Slower, less memory'
    },
    progressiveModes: {
      on: 'On',
      onDesc: 'Show geometry while loading',
      off: 'Off',
      offDesc: 'Wait until fully converted'
    },
    nonPlottableModes: {
      hide: 'Hide',
      hideDesc: 'Web viewer default',
      show: 'Show',
      showDesc: 'AutoCAD editor semantics'
    }
  },
  shell: {
    ribbon: {
      fileMenu: 'File',
      tablist: 'Ribbon tabs',
      locale: 'Language',
      command: 'Command: {command}',
      collapse: 'Collapse ribbon',
      expand: 'Expand ribbon',
      undo: 'Undo',
      redo: 'Redo',
      tab: {
        home: 'Home',
        insert: 'Insert',
        review: 'Review',
        measure: 'Measure',
        view: 'View'
      },
      group: {
        draw: 'Draw',
        modify: 'Modify',
        annotation: 'Annotation',
        layer: 'Layers',
        properties: 'Properties',
        utilities: 'Utilities',
        insert: 'Insert',
        markup: 'Markups',
        measure: 'Measure',
        view: 'View'
      },
      button: {
        line: 'Line',
        polyline: 'Polyline',
        circle: 'Circle',
        arc: 'Arc',
        ellipse: 'Ellipse',
        rect: 'Rectangle',
        rectangle: 'Rectangle',
        polygon: 'Polygon',
        spline: 'Spline',
        point: 'Point',
        ray: 'Ray',
        xline: 'XLine',
        mline: 'MLine',
        erase: 'Erase',
        copy: 'Copy',
        move: 'Move',
        rotate: 'Rotate',
        offset: 'Offset',
        select: 'Select',
        hideObjects: 'Hide',
        unisolateObjects: 'Unisolate',
        mtext: 'Text',
        hatch: 'Hatch',
        dimLinear: 'Dimension',
        textStyle: 'Text Style',
        attDef: 'Define Attr',
        attEdit: 'Edit Attr',
        layerPalette: 'Layers',
        layIso: 'Isolate',
        layUniso: 'Unisolate',
        layOff: 'Off',
        layOn: 'All On',
        layFrz: 'Freeze',
        layThw: 'Thaw',
        layLck: 'Lock',
        layUlk: 'Unlock',
        layCur: 'Set Current',
        layerP: 'Previous',
        properties: 'Properties',
        quickSelect: 'Quick Select',
        undo: 'Undo',
        redo: 'Redo',
        regen: 'Regen',
        invertSelect: 'Invert Selection',
        search: 'Object Search',
        agent: 'CAD Agent',
        switchBg: 'Switch BG',
        insertBlock: 'Insert Block',
        attachImage: 'Attach Image',
        attachDwg: 'Attach DWG',
        markupText: 'Text',
        markupLine: 'Line',
        markupRect: 'Rectangle',
        markupCircle: 'Circle',
        markupArrow: 'Arrow',
        markupHighlight: 'Highlight',
        clearMarkups: 'Clear',
        markupExport: 'Export',
        markupImport: 'Import',
        measureDistance: 'Distance',
        measureAngle: 'Angle',
        measureArea: 'Area',
        measureArc: 'Arc',
        measurePoint: 'Point',
        clearMeasurements: 'Clear',
        measurementImport: 'Import',
        measurementExport: 'Export',
        zoomAll: 'Zoom All',
        zoomWindow: 'Zoom Window',
        zoomOut: 'Zoom',
        pan: 'Pan'
      },
      option: {
        circleCR: 'Center, Radius',
        circleCD: 'Center, Diameter',
        circle2P: '2 Point',
        circle3P: '3 Point',
        circleTTR: 'Tan, Tan, Radius',
        circleTTT: 'Tan, Tan, Tan',
        arc3P: '3 Point',
        arcCSE: 'Center, Start, End',
        arcCSA: 'Center, Start, Angle'
      },
      file: {
        qnew: 'New Drawing',
        open: 'Open…',
        exportDxf: 'Export DXF',
        exportPng: 'Export PNG',
        exportPdf: 'Export PDF',
        exportSvg: 'Export SVG',
        exportHtml: 'Export HTML',
        units: 'Drawing Units…',
        about: 'About',
        quit: 'Quit'
      },
      qat: {
        qnew: 'New',
        open: 'Open',
        qsave: 'Save',
        undo: 'Undo',
        redo: 'Redo'
      }
    },
    propertyBar: {
      layer: 'Layer',
      color: 'Color',
      linetype: 'Linetype',
      lineweight: 'Lineweight'
    },
    panels: {
      layers: 'Layers',
      blocks: 'Blocks',
      properties: 'Properties',
      agent: 'AI Assistant',
      search: 'Search'
    },
    status: {
      ortho: 'Ortho mode',
      lineweight: 'Show lineweights',
      dynamicInput: 'Dynamic input',
      theme: 'Switch theme',
      fullscreen: 'Fullscreen',
      zoomExtents: 'Zoom extents'
    },
    layerPanel: {
      searchPlaceholder: 'Search layers',
      noLayers: 'No layers in this drawing',
      newLayer: 'New layer',
      deleteLayer: 'Delete layer',
      setCurrent: 'Set current',
      allOn: 'Turn all layers on',
      isolate: 'Isolate layer',
      currentLayer: 'Current: {name}',
      hideLayer: 'Hide layer {name}',
      showLayer: 'Show layer {name}',
      freezeLayer: 'Freeze layer {name}',
      thawLayer: 'Thaw layer {name}',
      lockLayer: 'Lock layer {name}',
      unlockLayer: 'Unlock layer {name}',
      colOn: 'On',
      colFrozen: 'Frozen',
      colLocked: 'Locked',
      colName: 'Name',
      colColor: 'Color',
      colLinetype: 'Linetype',
      zoomToLayer: 'Zoomed to layer {name}',
      confirm: 'OK',
      cancel: 'Cancel',
      newLayerPlaceholder: 'Layer name',
      createFailed: 'Failed to create layer',
      layerExists: 'Layer {name} already exists',
      layerCreated: 'Layer {name} created',
      deleteConfirm: 'Delete layer {name}?',
      deleteFailed: 'Failed to delete layer {name}',
      cannotDeleteLayer0: 'Layer 0 cannot be deleted',
      cannotDeleteCurrent: 'The current layer cannot be deleted',
      layerDeleted: 'Layer {name} deleted',
      selectLayerFirst: 'Select a layer first',
      setCurrentSuccess: 'Current layer set to {name}',
      setCurrentFailed: 'Failed to set current layer {name}'
    },
    blocksPanel: {
      empty: 'No insertable blocks in this drawing'
    },
    propertiesPanel: {
      noSelection: 'Select an entity to see its properties',
      multipleEntities: '{count} entities selected',
      arrayCount: 'Array({count})'
    },
    errors: {
      openFailed: 'Failed to open file: {fileName}',
      failedToGetAvaiableFonts: 'Failed to get available fonts from {url}'
    },
    notifications: {
      openFailedTitle: 'Failed to open file',
      fontNotFound: 'Font not found',
      fontsNotLoaded: 'These fonts could not be loaded: {fonts}',
      fontsNotFound: 'These fonts were not found: {fonts}',
      fontMissedInDrawing:
        'Font "{font}" is required by {count} entities; using "{replacementFont}" instead'
    }
  }
}
