/**
 * AutoCAD-style ribbon model.
 *
 * Data flows: this file → AntdRibbon.vue → AntdRibbonPanel / AntdDropdownButton.
 *
 * Organisation follows AutoCAD's "workflow-based" grouping:
 *   Home  → Draw | Modify | Annotation | Layer | Properties | Utilities
 *   Insert, Review, Measure, View are dedicated workflow tabs.
 *
 * Within each panel, `size: 'large'` items render as 48×56 icon+label
 * buttons (the primary tools); `size: 'small'` items collapse into the
 * panel-title dropdown.
 */
import {
  ClearOutlined,
  ColumnHeightOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  LineOutlined,
  PictureOutlined,
  RedoOutlined,
  ReloadOutlined,
  RotateRightOutlined,
  SaveOutlined,
  SearchOutlined,
  SwapOutlined,
  RobotFilled,
  ToolOutlined,
  UndoOutlined,
  UnlockOutlined
} from '@ant-design/icons-vue'
import type { Component } from 'vue'

import {
  iconArc,
  iconArcThreePoints,
  iconAttachDwg,
  iconCircle,
  iconCircleCenterDiameter,
  iconCircleCenterRadius,
  iconCircleTanTanRadius,
  iconCircleTanTanTan,
  iconCircleThreePoints,
  iconCircleTwoPoints,
  iconClearMeasurements,
  iconDefineAttribute,
  iconEditAttribute,
  iconHatch,
  iconInsertBlock,
  iconLayer,
  iconLayerFreeze,
  iconLayerIsolate,
  iconLayerLock,
  iconLayerOff,
  iconLayerOn,
  iconLayerPrevious,
  iconLayerSetCurrent,
  iconLayerThawed,
  iconLayerUnisolate,
  iconLine,
  iconMeasureAngle,
  iconMeasureArea,
  iconMeasureArc,
  iconMeasureDistance,
  iconMeasurePoint,
  iconMline,
  iconMove,
  iconMultiPoints,
  iconMtext,
  iconOffset,
  iconPan,
  iconPolygon,
  iconPolyline,
  iconProperties,
  iconQselect,
  iconRay,
  iconRect,
  iconSelect,
  iconSplineFitPoints,
  iconSwitchBg,
  iconXline,
  iconZoomToBox,
  iconZoomToExtent
} from '../icons'
import type {
  QatItemDef,
  RibbonDropdownDef,
  RibbonFileItemDef,
  RibbonItemDef,
  RibbonPanelDef,
  RibbonTabDef
} from './ribbonTypes'

// ── helpers ──────────────────────────────────────────────────────────

function btn(
  id: string,
  command: string,
  icon: Component,
  label: string,
  size: 'large' | 'small' = 'large',
  keyTip?: string
): RibbonItemDef {
  return { type: 'button', id, command, icon, label, size, keyTip }
}

function dropdown(
  id: string,
  command: string,
  icon: Component,
  label: string,
  options: RibbonDropdownDef['options'],
  size: 'large' | 'small' = 'large',
  keyTip?: string
): RibbonDropdownDef {
  return { type: 'dropdown', id, command, icon, label, options, size, keyTip }
}

// ── QAT ──────────────────────────────────────────────────────────────

export const qatItems: QatItemDef[] = [
  { id: 'qnew', command: 'qnew', icon: FileAddOutlined, label: 'New' },
  { id: 'open', command: 'open', icon: FolderOpenOutlined, label: 'Open' },
  { id: 'undo', command: 'undo', icon: UndoOutlined, label: 'Undo' },
  { id: 'redo', command: 'redo', icon: RedoOutlined, label: 'Redo' }
]

// ── File menu ────────────────────────────────────────────────────────

export const fileItems: RibbonFileItemDef[] = [
  { id: 'qnew', command: 'qnew' },
  { id: 'open', command: 'open' },
  { id: 'exportDxf', command: 'cdxf' },
  { id: 'exportPng', command: 'pngout' },
  { id: 'exportPdf', command: 'cpdf' },
  { id: 'exportSvg', command: 'csvg' },
  { id: 'exportHtml', command: 'chtml' },
  { id: 'units', command: 'units' },
  { id: 'about', command: 'about' },
  { id: 'quit', command: 'quit' }
]

// ── Home tab ─────────────────────────────────────────────────────────

const drawPanel: RibbonPanelDef = {
  id: 'draw',
  title: 'Draw',
  items: [
    btn('line', 'line', iconLine, 'Line', 'large', 'L'),
    dropdown(
      'circle',
      'circle',
      iconCircle,
      'Circle',
      [
        { id: 'circleCR', command: 'circle', icon: iconCircleCenterRadius, label: 'Center, Radius' },
        { id: 'circleCD', command: 'circle\nD', icon: iconCircleCenterDiameter, label: 'Center, Diameter' },
        { id: 'circle2P', command: 'circle\n2P', icon: iconCircleTwoPoints, label: '2 Point' },
        { id: 'circle3P', command: 'circle\n3P', icon: iconCircleThreePoints, label: '3 Point' },
        { id: 'circleTTR', command: 'circle\nTTR', icon: iconCircleTanTanRadius, label: 'Tan, Tan, Radius' },
        { id: 'circleTTT', command: 'circle\nTTT', icon: iconCircleTanTanTan, label: 'Tan, Tan, Tan' }
      ],
      'large',
      'C'
    ),
    btn('rect', 'rectang', iconRect, 'Rectangle', 'large', 'REC'),
    dropdown(
      'arc',
      'arc',
      iconArc,
      'Arc',
      [
        { id: 'arc3P', command: 'arc', icon: iconArcThreePoints, label: '3 Point' },
        { id: 'arcCSE', command: 'arc\nC', icon: iconArc, label: 'Center, Start, End' },
        { id: 'arcCSA', command: 'arc\nC, Start, Angle', icon: iconArc, label: 'Center, Start, Angle' }
      ],
      'large',
      'A'
    ),
    btn('polyline', 'pline', iconPolyline, 'Polyline', 'small', 'PL'),
    btn('polygon', 'polygon', iconPolygon, 'Polygon', 'small'),
    btn('spline', 'spline', iconSplineFitPoints, 'Spline', 'small', 'SPL'),
    btn('point', 'point', iconMultiPoints, 'Point', 'small', 'PO'),
    btn('ray', 'ray', iconRay, 'Ray', 'small'),
    btn('xline', 'xline', iconXline, 'XLine', 'small', 'XL'),
    btn('mline', 'mline', iconMline, 'MLine', 'small')
  ]
}

const modifyPanel: RibbonPanelDef = {
  id: 'modify',
  title: 'Modify',
  items: [
    btn('erase', 'erase', DeleteOutlined, 'Erase', 'large', 'E'),
    btn('copy', 'copy', CopyOutlined, 'Copy', 'large', 'CO'),
    btn('move', 'move', iconMove, 'Move', 'large', 'M'),
    btn('rotate', 'rotate', RotateRightOutlined, 'Rotate', 'large', 'RO'),
    btn('offset', 'offset', iconOffset, 'Offset', 'large', 'O'),
    btn('select', 'select', iconSelect, 'Select', 'large', 'ESC'),
    btn('hideObjects', 'hideobjects', EyeInvisibleOutlined, 'Hide Objects', 'small'),
    btn('unisolateObjects', 'unisolateobjects', EyeOutlined, 'Unisolate', 'small')
  ]
}

const annotationPanel: RibbonPanelDef = {
  id: 'annotation',
  title: 'Annotation',
  items: [
    btn('mtext', 'mtext', iconMtext, 'MText', 'large', 'MT'),
    btn('hatch', '-hatch', iconHatch, 'Hatch', 'large', 'H'),
    btn('dimLinear', 'dimlinear', ToolOutlined, 'Dimension', 'large', 'DLI'),
    btn('textStyle', 'style', FontSizeOutlined, 'Text Style', 'small'),
    btn('attDef', 'attdef', iconDefineAttribute, 'Att. Def.', 'small'),
    btn('attEdit', 'attedit', iconEditAttribute, 'Att. Edit', 'small')
  ]
}

const layerPanel: RibbonPanelDef = {
  id: 'layer',
  title: 'Layer',
  items: [
    btn('layerPalette', 'layer', iconLayer, 'Layer\nManager', 'large', 'LA'),
    btn('layIso', 'layiso', iconLayerIsolate, 'Isolate', 'small'),
    btn('layUniso', 'layuniso', iconLayerUnisolate, 'Unisolate', 'small'),
    btn('layOff', 'layoff', iconLayerOff, 'Off', 'small'),
    btn('layOn', 'layon', iconLayerOn, 'On', 'small'),
    btn('layFrz', 'layfrz', iconLayerFreeze, 'Freeze', 'small'),
    btn('layThw', 'laythw', iconLayerThawed, 'Thaw', 'small'),
    btn('layLck', 'laylck', iconLayerLock, 'Lock', 'small'),
    btn('layUlk', 'layulk', UnlockOutlined, 'Unlock', 'small'),
    btn('layCur', 'laycur', iconLayerSetCurrent, 'Set Current', 'small'),
    btn('layerP', 'layerp', iconLayerPrevious, 'Previous', 'small')
  ]
}

const propertiesPanel: RibbonPanelDef = {
  id: 'properties',
  title: 'Properties',
  items: [
    btn('properties', 'properties', iconProperties, 'Properties', 'large', 'PR'),
    btn('quickSelect', 'qselect', iconQselect, 'Quick\nSelect', 'small')
  ]
}

const utilitiesPanel: RibbonPanelDef = {
  id: 'utilities',
  title: 'Utilities',
  items: [
    btn('agent', 'agent', RobotFilled, 'CAD\nAgent', 'large'),
    btn('regen', 'regen', ReloadOutlined, 'Regen', 'small', 'RE'),
    btn('invertSelect', 'invertsel', SwapOutlined, 'Invert\nSelect', 'small'),
    btn('search', 'search', SearchOutlined, 'Search', 'small'),
    btn('switchBg', 'switchbg', iconSwitchBg, 'Switch\nBackground', 'small')
  ]
}

// ── Insert tab ───────────────────────────────────────────────────────

const insertPanel: RibbonPanelDef = {
  id: 'insert',
  title: 'Insert',
  items: [
    btn('insertBlock', 'insert', iconInsertBlock, 'Block', 'large', 'I'),
    btn('attachImage', 'imageattach', PictureOutlined, 'Image', 'large'),
    btn('attachDwg', 'xattach', iconAttachDwg, 'DWG\nReference', 'large')
  ]
}

// ── Review tab ───────────────────────────────────────────────────────

const markupPanel: RibbonPanelDef = {
  id: 'markup',
  title: 'Markup',
  items: [
    btn('markupText', 'markuptext', FontSizeOutlined, 'Text', 'large'),
    btn('markupLine', 'markupline', LineOutlined, 'Line', 'large'),
    btn('markupRect', 'markuprect', iconRect, 'Rectangle', 'large'),
    btn('markupCircle', 'markupcircle', iconCircle, 'Circle', 'large'),
    btn('markupArrow', 'markuparrow', ColumnHeightOutlined, 'Arrow', 'large'),
    btn('markupHighlight', 'markuphighlight', HighlightOutlined, 'Highlight', 'large'),
    btn('clearMarkups', 'clearmarkups', ClearOutlined, 'Clear', 'small'),
    btn('markupExport', 'markupexport', SaveOutlined, 'Export', 'small'),
    btn('markupImport', 'markupimport', FileAddOutlined, 'Import', 'small')
  ]
}

// ── Measure tab ──────────────────────────────────────────────────────

const measurePanel: RibbonPanelDef = {
  id: 'measure',
  title: 'Measure',
  items: [
    btn('measureDistance', 'measuredistance', iconMeasureDistance, 'Distance', 'large', 'DI'),
    btn('measureAngle', 'measureangle', iconMeasureAngle, 'Angle', 'large'),
    btn('measureArea', 'measurearea', iconMeasureArea, 'Area', 'large'),
    btn('measureArc', 'measurearc', iconMeasureArc, 'Arc\nLength', 'large'),
    btn('measurePoint', 'measurepoint', iconMeasurePoint, 'Point', 'large'),
    btn('clearMeasurements', 'clearmeasurements', iconClearMeasurements, 'Clear', 'small'),
    btn('measurementImport', 'measurementimport', FileAddOutlined, 'Import', 'small'),
    btn('measurementExport', 'measurementexport', SaveOutlined, 'Export', 'small')
  ]
}

// ── View tab ─────────────────────────────────────────────────────────

const viewPanel: RibbonPanelDef = {
  id: 'view',
  title: 'Navigation',
  items: [
    btn('zoomAll', 'zoom\nall', iconZoomToExtent, 'Zoom\nExtents', 'large', 'ZA'),
    btn('zoomWindow', 'zoom\nwindow', iconZoomToBox, 'Zoom\nWindow', 'large', 'ZW'),
    btn('pan', 'pan', iconPan, 'Pan', 'large', 'P'),
    btn('regen', 'regen', ReloadOutlined, 'Regen', 'small', 'RE'),
    btn('switchBg', 'switchbg', iconSwitchBg, 'Switch\nBackground', 'small')
  ]
}

// ── tabs ─────────────────────────────────────────────────────────────

export const ribbonTabs: RibbonTabDef[] = [
  {
    id: 'home',
    title: 'Home',
    panels: [drawPanel, modifyPanel, annotationPanel, layerPanel, propertiesPanel, utilitiesPanel]
  },
  {
    id: 'insert',
    title: 'Insert',
    panels: [insertPanel]
  },
  {
    id: 'review',
    title: 'Review',
    panels: [markupPanel]
  },
  {
    id: 'measure',
    title: 'Measure',
    panels: [measurePanel]
  },
  {
    id: 'view',
    title: 'View',
    panels: [viewPanel]
  }
]
