import {
  AimOutlined,
  AppstoreOutlined,
  AreaChartOutlined,
  BgColorsOutlined,
  BlockOutlined,
  BorderOuterOutlined,
  CheckOutlined,
  ClearOutlined,
  ColumnHeightOutlined,
  CompassOutlined,
  CopyOutlined,
  DeleteOutlined,
  DotChartOutlined,
  DragOutlined,
  EditOutlined,
  ExpandOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileAddOutlined,
  FontSizeOutlined,
  FormatPainterOutlined,
  HighlightOutlined,
  HistoryOutlined,
  LineChartOutlined,
  LineOutlined,
  LockOutlined,
  MinusOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  PlusOutlined,
  RadiusSettingOutlined,
  RadiusUpleftOutlined,
  RedoOutlined,
  ReloadOutlined,
  RetweetOutlined,
  RotateRightOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TableOutlined,
  ToolOutlined,
  UndoOutlined,
  UnlockOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons-vue'
import type { Component } from 'vue'

/** A single ribbon button that dispatches one CAD command. */
export interface AntdRibbonButton {
  id: string
  command: string
  icon?: Component
}

/** A labelled group of ribbon buttons (one AutoCAD "panel"). */
export interface AntdRibbonGroup {
  id: string
  buttons: AntdRibbonButton[]
}

/** A ribbon tab (Home / Insert / …) containing groups. */
export interface AntdRibbonTab {
  id: string
  groups: AntdRibbonGroup[]
}

export const ribbonTabs: AntdRibbonTab[] = [
  {
    id: 'home',
    groups: [
      {
        id: 'draw',
        buttons: [
          { id: 'line', command: 'line', icon: LineOutlined },
          { id: 'polyline', command: 'pline', icon: NodeIndexOutlined },
          { id: 'circle', command: 'circle', icon: DotChartOutlined },
          { id: 'arc', command: 'arc', icon: RadiusUpleftOutlined },
          { id: 'ellipse', command: 'ellipse', icon: RadiusSettingOutlined },
          { id: 'rectangle', command: 'rectang', icon: BorderOuterOutlined },
          { id: 'polygon', command: 'polygon', icon: AppstoreOutlined },
          { id: 'spline', command: 'spline', icon: LineChartOutlined },
          { id: 'point', command: 'point', icon: AimOutlined },
          { id: 'ray', command: 'ray', icon: ColumnHeightOutlined },
          { id: 'xline', command: 'xline', icon: MinusOutlined },
          { id: 'mline', command: 'mline', icon: TableOutlined }
        ]
      },
      {
        id: 'modify',
        buttons: [
          { id: 'erase', command: 'erase', icon: DeleteOutlined },
          { id: 'copy', command: 'copy', icon: CopyOutlined },
          { id: 'move', command: 'move', icon: DragOutlined },
          { id: 'rotate', command: 'rotate', icon: RotateRightOutlined },
          { id: 'offset', command: 'offset', icon: SwapOutlined },
          { id: 'select', command: 'select', icon: CheckOutlined },
          { id: 'hideObjects', command: 'hideobjects', icon: EyeInvisibleOutlined },
          { id: 'unisolateObjects', command: 'unisolateobjects', icon: EyeOutlined }
        ]
      },
      {
        id: 'annotation',
        buttons: [
          { id: 'mtext', command: 'mtext', icon: FontSizeOutlined },
          { id: 'hatch', command: '-hatch', icon: FormatPainterOutlined },
          { id: 'dimLinear', command: 'dimlinear', icon: ToolOutlined },
          { id: 'textStyle', command: 'style', icon: HighlightOutlined },
          { id: 'attDef', command: 'attdef', icon: EditOutlined },
          { id: 'attEdit', command: 'attedit', icon: EditOutlined }
        ]
      },
      {
        id: 'layer',
        buttons: [
          { id: 'layerPalette', command: 'layer', icon: BgColorsOutlined },
          { id: 'layIso', command: 'layiso', icon: EyeOutlined },
          { id: 'layUniso', command: 'layuniso', icon: EyeInvisibleOutlined },
          { id: 'layOff', command: 'layoff', icon: EyeInvisibleOutlined },
          { id: 'layOn', command: 'layon', icon: EyeOutlined },
          { id: 'layFrz', command: 'layfrz', icon: BgColorsOutlined },
          { id: 'layThw', command: 'laythw', icon: BgColorsOutlined },
          { id: 'layLck', command: 'laylck', icon: LockOutlined },
          { id: 'layUlk', command: 'layulk', icon: UnlockOutlined },
          { id: 'layCur', command: 'laycur', icon: AimOutlined },
          { id: 'layerP', command: 'layerp', icon: HistoryOutlined }
        ]
      },
      {
        id: 'properties',
        buttons: [
          { id: 'properties', command: 'properties', icon: SettingOutlined },
          { id: 'quickSelect', command: 'qselect', icon: ToolOutlined }
        ]
      },
      {
        id: 'utilities',
        buttons: [
          { id: 'undo', command: 'undo', icon: UndoOutlined },
          { id: 'redo', command: 'redo', icon: RedoOutlined },
          { id: 'regen', command: 'regen', icon: ReloadOutlined },
          { id: 'invertSelect', command: 'invertsel', icon: RetweetOutlined },
          { id: 'search', command: 'search', icon: SearchOutlined },
          { id: 'switchBg', command: 'switchbg', icon: SwapOutlined }
        ]
      }
    ]
  },
  {
    id: 'insert',
    groups: [
      {
        id: 'insert',
        buttons: [
          { id: 'insertBlock', command: 'insert', icon: BlockOutlined },
          { id: 'attachImage', command: 'imageattach', icon: PictureOutlined },
          { id: 'attachDwg', command: 'xattach', icon: FileAddOutlined }
        ]
      }
    ]
  },
  {
    id: 'review',
    groups: [
      {
        id: 'markup',
        buttons: [
          { id: 'markupText', command: 'markuptext', icon: FontSizeOutlined },
          { id: 'markupLine', command: 'markupline', icon: LineOutlined },
          { id: 'markupRect', command: 'markuprect', icon: BorderOuterOutlined },
          { id: 'markupCircle', command: 'markupcircle', icon: DotChartOutlined },
          { id: 'markupArrow', command: 'markuparrow', icon: ColumnHeightOutlined },
          { id: 'markupHighlight', command: 'markuphighlight', icon: HighlightOutlined },
          { id: 'clearMarkups', command: 'clearmarkups', icon: ClearOutlined },
          { id: 'markupExport', command: 'markupexport', icon: SaveOutlined },
          { id: 'markupImport', command: 'markupimport', icon: FileAddOutlined }
        ]
      }
    ]
  },
  {
    id: 'measure',
    groups: [
      {
        id: 'measure',
        buttons: [
          { id: 'measureDistance', command: 'measuredistance', icon: LineChartOutlined },
          { id: 'measureAngle', command: 'measureangle', icon: CompassOutlined },
          { id: 'measureArea', command: 'measurearea', icon: AreaChartOutlined },
          { id: 'measureArc', command: 'measurearc', icon: RadiusSettingOutlined },
          { id: 'measurePoint', command: 'measurepoint', icon: AimOutlined },
          { id: 'clearMeasurements', command: 'clearmeasurements', icon: ClearOutlined },
          { id: 'measurementImport', command: 'measurementimport', icon: FileAddOutlined },
          { id: 'measurementExport', command: 'measurementexport', icon: SaveOutlined }
        ]
      }
    ]
  },
  {
    id: 'view',
    groups: [
      {
        id: 'view',
        buttons: [
          { id: 'zoomAll', command: 'zoom\nall', icon: ExpandOutlined },
          { id: 'zoomWindow', command: 'zoom\nwindow', icon: ZoomInOutlined },
          { id: 'zoomOut', command: 'zoom', icon: ZoomOutOutlined },
          { id: 'pan', command: 'pan', icon: DragOutlined },
          { id: 'regen', command: 'regen', icon: ReloadOutlined },
          { id: 'switchBg', command: 'switchbg', icon: SwapOutlined }
        ]
      }
    ]
  }
]

export interface AntdRibbonFileItem {
  id: string
  command: string
}

export const ribbonFileItems: AntdRibbonFileItem[] = [
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

/** Icons shared by chrome outside the ribbon model itself. */
export const ribbonUiIcons = {
  plus: PlusOutlined
} as const
