<template>
  <div class="ml-external-references">
    <div class="ml-external-references__toolbar">
      <a-dropdown trigger="click">
        <a-button
          size="small"
          class="ml-external-references__attach-btn"
          :title="t('main.toolPalette.missingResources.attach')"
          :aria-label="t('main.toolPalette.missingResources.attach')"
        >
          <PaperClipOutlined :style="{ fontSize: '16px' }" />
          <DownOutlined :style="{ fontSize: '12px' }" class="ml-external-references__attach-caret" />
        </a-button>
        <template #overlay>
          <a-menu @click="handleAttachMenuClick">
            <a-menu-item key="dwg">
              {{ t('main.toolPalette.missingResources.attachDwg') }}
            </a-menu-item>
            <a-menu-item key="image">
              {{ t('main.toolPalette.missingResources.attachImage') }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>

    <div class="ml-external-references__upper">
      <div class="ml-external-references__section-header">
        {{ t('main.toolPalette.missingResources.fileReferences') }}
      </div>
      <a-table
        :columns="tableColumns"
        :data-source="rows"
        class="ml-external-references__table"
        :pagination="false"
        :row-key="(record: ExternalRefRow) => record.key"
        :locale="{ emptyText: t('main.toolPalette.missingResources.empty') }"
        :custom-row="customRowHandler"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'statusLabel'">
            <span
              class="ml-external-references__status"
              :class="
                record.status === 'loaded'
                  ? 'ml-external-references__status--loaded'
                  : 'ml-external-references__status--missing'
              "
            >
              {{ record.statusLabel }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'typeLabel'">
            <a-tooltip :title="record.typeLabel" placement="topLeft">
              <span class="ml-external-references-ellipsis">{{ record.typeLabel }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.dataIndex === 'name'">
            <a-tooltip :title="record.name" placement="topLeft">
              <span class="ml-external-references-ellipsis">{{ record.name }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.dataIndex === 'actions'">
            <div class="ml-external-references__cell-actions">
              <template v-if="record.kind === 'xref' && record.overlayId">
                <a-checkbox
                  :checked="record.visible"
                  :aria-label="t('main.toolPalette.missingResources.visible')"
                  @change="(e: any) => handleXrefVisibility(record, e.target.checked)"
                />
                <a-button
                  type="link"
                  danger
                  size="small"
                  @click="handleUnloadXref(record)"
                >
                  {{ t('main.toolPalette.missingResources.unload') }}
                </a-button>
              </template>
              <template v-else-if="record.kind === 'xref'">
                <a-button
                  type="link"
                  size="small"
                  :title="t('main.toolPalette.missingResources.browse')"
                  @click="handleBrowseXref(record)"
                >
                  ...
                </a-button>
                <a-button
                  type="link"
                  size="small"
                  @click="handleUrlXref(record)"
                >
                  {{ t('main.toolPalette.missingResources.fromUrl') }}
                </a-button>
              </template>
              <template v-else-if="record.kind === 'image'">
                <a-tooltip
                  v-if="record.replacementName"
                  :title="record.foundAt"
                  placement="top"
                >
                  <span
                    class="ml-external-references__replace-name"
                    @click.stop="handleBrowseImage(record)"
                  >
                    {{ record.replacementName }}
                  </span>
                </a-tooltip>
                <a-button
                  v-else
                  type="link"
                  size="small"
                  :title="t('main.toolPalette.missingResources.replace')"
                  @click.stop="handleBrowseImage(record)"
                >
                  ...
                </a-button>
              </template>
            </div>
          </template>
        </template>
      </a-table>
    </div>

    <button
      type="button"
      class="ml-external-references__splitter"
      :aria-expanded="detailsExpanded"
      :title="
        detailsExpanded
          ? t('main.toolPalette.missingResources.collapseDetails')
          : t('main.toolPalette.missingResources.expandDetails')
      "
      @click="detailsExpanded = !detailsExpanded"
    >
      <span class="ml-external-references__splitter-dots" aria-hidden="true" />
    </button>

    <div
      v-show="detailsExpanded"
      class="ml-external-references__lower"
    >
      <div class="ml-external-references__section-header">
        {{ t('main.toolPalette.missingResources.details') }}
      </div>
      <div v-if="selectedRow" class="ml-external-references__details">
        <div class="ml-external-references__detail-row">
          <span class="ml-external-references__detail-label">
            {{ t('main.toolPalette.missingResources.name') }}
          </span>
          <span class="ml-external-references__detail-value">
            {{ selectedRow.name }}
          </span>
        </div>
        <div class="ml-external-references__detail-row">
          <span class="ml-external-references__detail-label">
            {{ t('main.toolPalette.missingResources.status') }}
          </span>
          <span class="ml-external-references__detail-value">
            {{ selectedRow.statusLabel }}
          </span>
        </div>
        <div class="ml-external-references__detail-row">
          <span class="ml-external-references__detail-label">
            {{ t('main.toolPalette.missingResources.type') }}
          </span>
          <span class="ml-external-references__detail-value">
            {{ selectedRow.typeLabel }}
          </span>
        </div>
        <div class="ml-external-references__detail-row">
          <span class="ml-external-references__detail-label">
            {{ t('main.toolPalette.missingResources.foundAt') }}
          </span>
          <span
            class="ml-external-references__detail-value"
            :title="selectedRow.foundAt"
          >
            {{ selectedRow.foundAt || '—' }}
          </span>
        </div>
      </div>
      <div v-else class="ml-external-references__details-empty">
        {{ t('main.toolPalette.missingResources.selectReference') }}
      </div>
    </div>

    <input
      ref="xrefFileInput"
      type="file"
      accept=".dwg,.dxf"
      style="display: none"
      @change="handleXrefFileChange"
    />
    <input
      ref="imageFileInput"
      type="file"
      accept=".png,.jpg,.jpeg,.bmp,.gif,.tif,.tiff"
      style="display: none"
      @change="handleImageFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { DownOutlined, PaperClipOutlined } from '@ant-design/icons-vue'
import {
  AcApDocManager,
  acapRunDatabaseEdit,
  AcApXrefManager,
  eventBus
} from '@mlightcad/cad-simple-viewer'
import { AcDbRasterImage } from '@mlightcad/data-model'
import { Input, Modal } from 'ant-design-vue'
import { computed, h, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  type ImageMappingData,
  useMissedData,
  type XrefOverlayState
} from '../../composable'
const { t } = useI18n()
const { images: imageTableData, xrefs, xrefOverlays } = useMissedData()

const xrefFileInput = ref<HTMLInputElement | null>(null)
const imageFileInput = ref<HTMLInputElement | null>(null)
const pendingXrefName = ref<string | null>(null)
const pendingImageRow = ref<ImageMappingData | null>(null)
const detailsExpanded = ref(true)
const selectedKey = ref<string | null>(null)

type RefKind = 'xref' | 'image'

interface ExternalRefRow {
  key: string
  kind: RefKind
  name: string
  status: 'missing' | 'loaded'
  statusLabel: string
  typeLabel: string
  foundAt: string
  /** Xref fields */
  pathName?: string
  isOverlay?: boolean
  overlayId?: string
  visible?: boolean
  /** Image fields */
  imageData?: ImageMappingData
  replacementName?: string
}

const fileNameFromPath = (path: string) => {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

const tableColumns = [
  {
    title: () => t('main.toolPalette.missingResources.name'),
    dataIndex: 'name',
    key: 'name',
    ellipsis: { showTitle: false }
  },
  {
    title: () => t('main.toolPalette.missingResources.status'),
    dataIndex: 'statusLabel',
    key: 'statusLabel',
    width: 88
  },
  {
    title: () => t('main.toolPalette.missingResources.type'),
    dataIndex: 'typeLabel',
    key: 'typeLabel',
    width: 88,
    ellipsis: { showTitle: false }
  },
  {
    title: () => t('main.toolPalette.missingResources.actions'),
    dataIndex: 'actions',
    key: 'actions',
    width: 120,
    align: 'center' as const
  }
]

const customRowHandler = (record: ExternalRefRow) => ({
  onClick: () => {
    selectedKey.value = record.key
  },
  onDblclick: () => {
    handleRowDblClick(record)
  }
})

const rows = computed<ExternalRefRow[]>(() => {
  const result: ExternalRefRow[] = []
  const xrefNames = new Set(xrefs.map(x => x.name))

  for (const image of imageTableData.values()) {
    const replaced = !!image.file
    // Found At = replacement file name only (not the original missing name).
    const foundAt = replaced
      ? image.filePath?.trim() || image.file!.name
      : ''
    result.push({
      key: `image:${image.fileName}`,
      kind: 'image',
      name: image.fileName,
      status: replaced ? 'loaded' : 'missing',
      statusLabel: replaced
        ? t('main.toolPalette.missingResources.statusLoaded')
        : t('main.toolPalette.missingResources.statusMissing'),
      typeLabel: t('main.toolPalette.missingResources.typeImage'),
      foundAt,
      imageData: image,
      replacementName: image.file?.name
    })
  }

  for (const xref of xrefs) {
    const state = xrefOverlays.get(xref.name)
    const loaded = !!state?.overlayId
    // Found At = loaded/replacement source path only.
    const foundAt = loaded ? state?.sourceName?.trim() || '' : ''
    result.push({
      key: `xref:${xref.name}`,
      kind: 'xref',
      name: xref.name,
      status: loaded ? 'loaded' : 'missing',
      statusLabel: loaded
        ? t('main.toolPalette.missingResources.statusLoaded')
        : t('main.toolPalette.missingResources.statusMissing'),
      typeLabel: xref.isOverlay
        ? t('main.toolPalette.missingResources.typeOverlay')
        : t('main.toolPalette.missingResources.typeAttach'),
      foundAt,
      pathName: xref.pathName,
      isOverlay: xref.isOverlay,
      overlayId: state?.overlayId,
      visible: state?.visible ?? true
    })
  }

  // Overlays attached via the toolbar that are not unresolved xrefs.
  for (const [name, state] of xrefOverlays) {
    if (xrefNames.has(name) || !state.overlayId) continue
    result.push({
      key: `xref:${name}`,
      kind: 'xref',
      name,
      status: 'loaded',
      statusLabel: t('main.toolPalette.missingResources.statusLoaded'),
      typeLabel: t('main.toolPalette.missingResources.typeAttach'),
      foundAt: state.sourceName?.trim() || '',
      pathName: state.sourceName,
      isOverlay: false,
      overlayId: state.overlayId,
      visible: state.visible
    })
  }

  return result
})

const selectedRow = computed(() => {
  if (!selectedKey.value) return null
  return rows.value.find(row => row.key === selectedKey.value) ?? null
})

watch(
  rows,
  list => {
    if (list.length === 0) {
      selectedKey.value = null
      return
    }
    if (!selectedKey.value || !list.some(row => row.key === selectedKey.value)) {
      selectedKey.value = list[0].key
    }
  },
  { immediate: true }
)

const handleRowDblClick = (row: ExternalRefRow) => {
  if (row.kind === 'image') {
    handleBrowseImage(row)
  } else if (row.kind === 'xref' && !row.overlayId) {
    handleBrowseXref(row)
  }
}

const setOverlayState = (name: string, state: XrefOverlayState | undefined) => {
  if (state) {
    xrefOverlays.set(name, state)
  } else {
    xrefOverlays.delete(name)
  }
}

const loadBufferAsOverlay = async (
  xrefName: string,
  fileName: string,
  buffer: ArrayBuffer,
  sourcePath?: string
) => {
  try {
    const session = await AcApXrefManager.instance.attachOverlay({
      blockName: xrefName,
      fileName,
      content: buffer,
      sourcePath: sourcePath?.trim() || fileName
    })
    setOverlayState(xrefName, {
      overlayId: session.overlayId,
      visible: session.visible,
      sourceName: session.sourcePath
    })
    selectedKey.value = `xref:${xrefName}`
    eventBus.emit('missed-data-changed', {})
  } catch (error) {
    eventBus.emit('message', {
      message: t('main.toolPalette.missingResources.loadFailed', {
        name: xrefName
      }),
      type: 'error'
    })
    throw error
  }
}

const handleAttachMenuClick = ({ key }: { key: string }) => {
  handleAttachCommand(key)
}

const handleAttachCommand = (command: string) => {
  if (command === 'dwg') {
    // XATTACH (XA): file picker -> insertion point -> scale -> rotation
    AcApDocManager.instance.sendStringToExecute('xattach')
  } else if (command === 'image') {
    pendingImageRow.value = null
    // IMAGEATTACH (IAT): file picker -> insertion point -> scale -> rotation
    AcApDocManager.instance.sendStringToExecute('imageattach')
  }
}

const handleBrowseXref = (row: ExternalRefRow) => {
  pendingXrefName.value = row.name
  xrefFileInput.value?.click()
}

const handleBrowseImage = (row: ExternalRefRow) => {
  if (!row.imageData) return
  pendingImageRow.value = row.imageData
  imageFileInput.value?.click()
}

const handleXrefFileChange = async () => {
  const file = xrefFileInput.value?.files?.[0]
  const xrefName = pendingXrefName.value
  pendingXrefName.value = null
  if (xrefFileInput.value) {
    xrefFileInput.value.value = ''
  }
  if (!file) return

  const name = xrefName || file.name.replace(/\.(dwg|dxf)$/i, '') || file.name
  try {
    const buffer = await file.arrayBuffer()
    await loadBufferAsOverlay(name, file.name, buffer, file.name)
  } catch {
    // Error already reported
  }
}

const applyImageReplacement = (item: ImageMappingData, file: File) => {
  const db = AcApDocManager.instance.curDocument.database
  const fileName = file.name
  let replaced = false
  acapRunDatabaseEdit(db, 'Replace Image', () => {
    item.ids.forEach(id => {
      const image = db.openEntityForWrite(id) as AcDbRasterImage | undefined
      if (!image) return
      image.image = file
      // Persist replacement file name on the image definition when present.
      if (image.imageDefId) {
        const imageDef = db.objects.imageDefinition.getIdAt(image.imageDefId)
        if (imageDef) {
          imageDef.sourceFileName = fileName
        }
      }
      replaced = true
    })
  })
  if (!replaced) return
  item.file = file
  item.filePath = fileName
  eventBus.emit('missed-data-changed', {})
  eventBus.emit('message', {
    message: t('main.toolPalette.missingResources.applyDone'),
    type: 'success'
  })
  void nextTick(() => {
    const match = rows.value.find(
      row =>
        row.kind === 'image' &&
        (row.foundAt === fileName || row.imageData?.file === file)
    )
    if (match) selectedKey.value = match.key
  })
}

const handleImageFileChange = async () => {
  const file = imageFileInput.value?.files?.[0]
  const row = pendingImageRow.value
  pendingImageRow.value = null
  if (imageFileInput.value) {
    imageFileInput.value.value = ''
  }
  if (!file || !row) return

  applyImageReplacement(row, file)
}

const handleUrlXref = (row: ExternalRefRow) => {
  const urlInputValue = ref(row.pathName?.startsWith('http') ? row.pathName : '')

  Modal.confirm({
    title: t('main.toolPalette.missingResources.fromUrl'),
    content: () =>
      h(Input, {
        value: urlInputValue.value,
        'onUpdate:value': (v: string) => {
          urlInputValue.value = v
        },
        placeholder: 'https://...'
      }),
    okText: t('main.toolPalette.missingResources.load'),
    cancelText: t('dialog.baseDialog.cancel'),
    onOk: async () => {
      const value = urlInputValue.value?.trim()
      if (!value) {
        throw new Error(t('main.toolPalette.missingResources.urlRequired'))
      }
      const response = await fetch(value)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const buffer = await response.arrayBuffer()
      const fileName =
        fileNameFromPath(new URL(value).pathname) ||
        fileNameFromPath(row.pathName || '') ||
        `${row.name}.dwg`
      await loadBufferAsOverlay(row.name, fileName, buffer, value)
    },
    onCancel: () => {
      // user cancelled
    }
  })
}

const handleXrefVisibility = (row: ExternalRefRow, value: boolean) => {
  if (!row.overlayId) return
  const visible = value === true
  AcApXrefManager.instance.setVisibleByBlockName(row.name, visible)
  const state = xrefOverlays.get(row.name)
  if (state) {
    state.visible = visible
  }
}

const handleUnloadXref = (row: ExternalRefRow) => {
  if (!row.overlayId) return
  AcApXrefManager.instance.unloadByBlockName(row.name)
  setOverlayState(row.name, undefined)
  eventBus.emit('missed-data-changed', {})
}
</script>

<style scoped>
.ml-external-references {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--ml-theme-text-primary);
}

.ml-external-references__toolbar {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--ml-theme-border);
}

.ml-external-references__attach-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
}

.ml-external-references__attach-caret {
  margin-left: 0;
  opacity: 0.75;
}

.ml-external-references__upper {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 120px;
  overflow: hidden;
}

.ml-external-references__section-header {
  flex: 0 0 auto;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-theme-text-heading);
  background: var(--ml-theme-bg-hover);
  border-bottom: 1px solid var(--ml-theme-border);
}

.ml-external-references__table {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.ml-external-references__table :deep(.ant-table-placeholder) {
  font-size: 12px;
  line-height: 1.4;
  color: var(--ml-theme-text-secondary);
  white-space: normal;
  padding: 0 8px;
}

.ml-external-references-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-external-references__cell-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
}

.ml-external-references__replace-name {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ml-theme-primary);
  cursor: pointer;
  vertical-align: middle;
}

.ml-external-references__status {
  font-size: 12px;
  color: var(--ml-theme-text-primary);
}

.ml-external-references__status--missing {
  color: #f59e0b;
}

.ml-external-references__status--loaded {
  color: var(--ml-theme-primary);
}

.ml-external-references__splitter {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 10px;
  margin: 0;
  padding: 0;
  border: none;
  border-top: 1px solid var(--ml-theme-border);
  border-bottom: 1px solid var(--ml-theme-border);
  background: var(--ml-theme-bg-hover);
  cursor: pointer;
}

.ml-external-references__splitter:hover {
  background: var(--ml-theme-bg-subtle);
}

.ml-external-references__splitter-dots {
  width: 28px;
  height: 4px;
  border-radius: 2px;
  background: radial-gradient(
    circle,
    var(--ml-theme-text-secondary) 1.25px,
    transparent 1.35px
  );
  background-size: 6px 4px;
  background-repeat: repeat-x;
  background-position: center;
}

.ml-external-references__lower {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  overflow: hidden;
}

.ml-external-references__details {
  flex: 0 0 auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ml-external-references__details-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  color: var(--ml-theme-text-secondary);
  text-align: center;
}

.ml-external-references__detail-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px;
  align-items: start;
  line-height: 1.4;
}

.ml-external-references__detail-label {
  color: var(--ml-theme-text-secondary);
}

.ml-external-references__detail-value {
  min-width: 0;
  word-break: break-all;
  color: var(--ml-theme-text-heading);
}
</style>
