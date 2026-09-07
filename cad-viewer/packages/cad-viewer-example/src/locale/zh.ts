export default {
  command: {
    ACAD: {
      quit: {
        description: '退出应用程序并关闭所有打开的图纸'
      },
      exit: {
        description: '退出应用程序并关闭所有打开的图纸'
      }
    }
  },
  fileUpload: {
    title: '选择要查看的 CAD 文件',
    subtitle: '将 DXF 图纸导入查看器',
    newDrawing: '新建图纸',
    or: '或',
    switchToLight: '切换到浅色主题',
    switchToDark: '切换到深色主题',
    dropFile: '拖拽文件到此处，或',
    browse: '点击选择',
    openOptions: '打开选项',
    initialView: '初始视图',
    accessMode: '访问模式',
    textRendering: '文字渲染',
    progressive: '渐进渲染',
    nonPlottable: '不可打印图层',
    viewModes: {
      auto: '自动',
      autoDesc: '根据访问模式决定',
      extents: '范围',
      extentsDesc: '缩放至图纸范围',
      saved: '已保存视图',
      savedDesc: 'AutoCAD 保存的视图'
    },
    accessModes: {
      read: '只读',
      readDesc: '仅查看',
      review: '审阅',
      reviewDesc: '查看与审阅',
      write: '编辑',
      writeDesc: '完全访问'
    },
    textRenderingModes: {
      worker: 'Worker 线程',
      workerDesc: '更快，占用更多内存',
      mainThread: '主线程',
      mainThreadDesc: '较慢，占用更少内存'
    },
    progressiveModes: {
      on: '开',
      onDesc: '加载过程中显示图形',
      off: '关',
      offDesc: '等待完全转换后显示'
    },
    nonPlottableModes: {
      hide: '隐藏',
      hideDesc: 'Web 查看器默认行为',
      show: '显示',
      showDesc: 'AutoCAD 编辑器行为'
    }
  },
  shell: {
    ribbon: {
      fileMenu: '文件',
      tablist: '功能区选项卡',
      locale: '语言',
      command: '命令：{command}',
      collapse: '折叠功能区',
      expand: '展开功能区',
      undo: '撤销',
      redo: '重做',
      tab: {
        home: '常用',
        insert: '插入',
        review: '审阅',
        measure: '测量',
        view: '视图'
      },
      group: {
        draw: '绘图',
        modify: '修改',
        annotation: '注释',
        layer: '图层',
        properties: '特性',
        utilities: '实用',
        insert: '插入',
        markup: '批注',
        measure: '测量',
        view: '视图'
      },
      button: {
        line: '直线',
        polyline: '多段线',
        circle: '圆',
        arc: '圆弧',
        ellipse: '椭圆',
        rect: '矩形',
        rectangle: '矩形',
        polygon: '多边形',
        spline: '样条曲线',
        point: '点',
        ray: '射线',
        xline: '构造线',
        mline: '多线',
        erase: '删除',
        copy: '复制',
        move: '移动',
        rotate: '旋转',
        offset: '偏移',
        select: '选择',
        hideObjects: '隐藏',
        unisolateObjects: '取消隔离',
        mtext: '文字',
        hatch: '填充',
        dimLinear: '标注',
        textStyle: '文字样式',
        attDef: '定义属性',
        attEdit: '编辑属性',
        layerPalette: '图层',
        layIso: '隔离',
        layUniso: '取消隔离',
        layOff: '关闭',
        layOn: '全部打开',
        layFrz: '冻结',
        layThw: '解冻',
        layLck: '锁定',
        layUlk: '解锁',
        layCur: '置为当前',
        layerP: '上一个',
        properties: '特性',
        quickSelect: '快速选择',
        undo: '撤销',
        redo: '重做',
        regen: '重生成',
        invertSelect: '反选',
        search: '对象搜索',
        agent: 'CAD 助手',
        switchBg: '切换背景',
        insertBlock: '插入块',
        attachImage: '附着图像',
        attachDwg: '附着 DWG',
        markupText: '文字批注',
        markupLine: '线条批注',
        markupRect: '矩形批注',
        markupCircle: '圆形批注',
        markupArrow: '箭头批注',
        markupHighlight: '高亮批注',
        clearMarkups: '清除',
        markupExport: '导出',
        markupImport: '导入',
        measureDistance: '距离',
        measureAngle: '角度',
        measureArea: '面积',
        measureArc: '弧长',
        measurePoint: '点',
        clearMeasurements: '清除',
        measurementImport: '导入',
        measurementExport: '导出',
        zoomAll: '全部缩放',
        zoomWindow: '窗口缩放',
        zoomOut: '缩放',
        pan: '平移'
      },
      option: {
        circleCR: '圆心, 半径',
        circleCD: '圆心, 直径',
        circle2P: '两点',
        circle3P: '三点',
        circleTTR: '切点, 切点, 半径',
        circleTTT: '切点, 切点, 切点',
        arc3P: '三点',
        arcCSE: '圆心, 起点, 端点',
        arcCSA: '圆心, 起点, 角度'
      },
      file: {
        qnew: '新建图纸',
        open: '打开…',
        exportDxf: '导出 DXF',
        exportPng: '导出 PNG',
        exportPdf: '导出 PDF',
        exportSvg: '导出 SVG',
        exportHtml: '导出 HTML',
        units: '图形单位…',
        about: '关于',
        quit: '退出'
      },
      qat: {
        qnew: '新建',
        open: '打开',
        qsave: '保存',
        undo: '撤销',
        redo: '重做'
      }
    },
    propertyBar: {
      layer: '图层',
      color: '颜色',
      linetype: '线型',
      lineweight: '线宽'
    },
    panels: {
      layers: '图层',
      blocks: '块',
      properties: '属性',
      agent: 'AI 助手',
      search: '搜索'
    },
    status: {
      ortho: '正交模式',
      lineweight: '显示线宽',
      dynamicInput: '动态输入',
      theme: '切换主题',
      fullscreen: '全屏',
      zoomExtents: '缩放至范围'
    },
    layerPanel: {
      searchPlaceholder: '搜索图层',
      noLayers: '当前图纸没有图层',
      newLayer: '新建图层',
      deleteLayer: '删除图层',
      setCurrent: '置为当前',
      allOn: '全部打开',
      isolate: '隔离图层',
      currentLayer: '当前：{name}',
      hideLayer: '隐藏图层 {name}',
      showLayer: '显示图层 {name}',
      freezeLayer: '冻结图层 {name}',
      thawLayer: '解冻图层 {name}',
      lockLayer: '锁定图层 {name}',
      unlockLayer: '解锁图层 {name}',
      colOn: '开',
      colFrozen: '冻结',
      colLocked: '锁定',
      colName: '名称',
      colColor: '颜色',
      colLinetype: '线型',
      zoomToLayer: '已缩放到图层 {name}',
      confirm: '确定',
      cancel: '取消',
      newLayerPlaceholder: '图层名称',
      createFailed: '创建图层失败',
      layerExists: '图层 {name} 已存在',
      layerCreated: '图层 {name} 已创建',
      deleteConfirm: '删除图层 {name}？',
      deleteFailed: '删除图层 {name} 失败',
      cannotDeleteLayer0: '无法删除 0 图层',
      cannotDeleteCurrent: '无法删除当前图层',
      layerDeleted: '图层 {name} 已删除',
      selectLayerFirst: '请先选择一个图层',
      setCurrentSuccess: '当前图层已设为 {name}',
      setCurrentFailed: '设置当前图层 {name} 失败'
    },
    blocksPanel: {
      empty: '当前图纸没有可插入的块'
    },
    propertiesPanel: {
      noSelection: '选择一个实体以查看其属性',
      multipleEntities: '已选择 {count} 个实体',
      arrayCount: '数组({count})'
    },
    errors: {
      openFailed: '打开文件失败：{fileName}',
      failedToGetAvaiableFonts: '无法从 {url} 获取可用字体'
    },
    notifications: {
      openFailedTitle: '打开文件失败',
      fontNotFound: '找不到字体',
      fontsNotLoaded: '以下字体加载失败：{fonts}',
      fontsNotFound: '未找到以下字体：{fonts}',
      fontMissedInDrawing:
        '图纸中有 {count} 个实体需要字体“{font}”，已改用“{replacementFont}”'
    }
  }
}
