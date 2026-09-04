<template>
  <a-select
    v-model:value="currentLayer"
    class="antd-ribbon-select antd-layer-select"
    :options="layerOptions"
    :placeholder="t('shell.propertyBar.layer')"
    :disabled="props.disabled"
    show-search
    option-filter-prop="value"
    :filter-option="filterLayer"
    @change="onLayerChange"
  >
    <template #optionLabel="option">
      <span v-if="option" class="antd-layer-select-option">
        <span
          class="antd-property-bar-color-dot"
          :style="{ background: layerColorFor(option.value) }"
        />
        <span class="antd-layer-select-option-label">{{ option.value }}</span>
      </span>
    </template>
  </a-select>
</template>

<script setup lang="ts">
import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@mlightcad/cad-simple-viewer'
import {
  type LayerInfo,
  useLayers
} from '@mlightcad/cad-viewer'
import {
  type AcDbEntity,
  type AcDbObjectId
} from '@mlightcad/data-model'
import { computed, effectScope, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  disabled?: boolean
}>()

const { t } = useI18n()

// Access editor lazily — singleton is not available until engine bootstraps.
let _editor: AcApDocManager | undefined
function editor(): AcApDocManager {
  if (!_editor) _editor = AcApDocManager.instance
  return _editor
}

function db() {
  try {
    return editor().curDocument?.database
  } catch {
    return undefined
  }
}

// This select mounts before the engine bootstraps so the disabled shell chrome
// is visible during startup, which means the AcApDocManager singleton does
// not exist yet at setup time. Bind useLayers once it appears (same retry
// pattern as useDocument), running it inside this component's effect scope
// so its onScopeDispose cleanup stays tied to the component.
const layerBindings = shallowRef<ReturnType<typeof useLayers>>()

const layers = computed(
  () => (layerBindings.value?.layers ?? []) as unknown as LayerInfo[]
)
const currentLayerName = computed(
  () => layerBindings.value?.currentLayerName.value ?? ''
)

function setCurrentLayer(name: string) {
  layerBindings.value?.setCurrentLayer(name)
}

// An attached (non-detached) scope is disposed automatically when this
// component unmounts, which runs useLayers' onScopeDispose cleanup.
const bindScope = effectScope()
let bindTimer: ReturnType<typeof setInterval> | undefined

function stopBindTimer() {
  if (bindTimer != null) {
    clearInterval(bindTimer)
    bindTimer = undefined
  }
}

function tryBindLayers(): boolean {
  let manager: AcApDocManager
  try {
    manager = editor()
  } catch {
    return false
  }
  layerBindings.value = bindScope.run(() => useLayers(manager)) ?? undefined
  return true
}

function ensureLayersBound() {
  if (tryBindLayers() || bindTimer != null) return
  bindTimer = setInterval(() => {
    if (tryBindLayers()) stopBindTimer()
  }, 50)
}

onUnmounted(stopBindTimer)
ensureLayersBound()

// ── Selection sync ────────────────────────────────────────────────
// The select mirrors the most recently selected entity's layer. With no
// selection it falls back to the database's current layer (CLAYER).

const selectedIds = ref<AcDbObjectId[]>([])

/** Most recently selected id, taken from the last selectionAdded payload. */
const lastSelectedId = ref<AcDbObjectId | null>(null)

let selectionBound = false
let selectionBindTimer: ReturnType<typeof setInterval> | undefined

function refreshSelectedIds() {
  try {
    selectedIds.value = editor().curView.selectionSet.ids
  } catch {
    selectedIds.value = []
    lastSelectedId.value = null
  }
}

function onSelectionAdded(args: { ids: AcDbObjectId[] }) {
  refreshSelectedIds()
  const added = args.ids ?? []
  if (added.length > 0) lastSelectedId.value = added[added.length - 1]
}

function onSelectionRemoved(args: { ids: AcDbObjectId[] }) {
  refreshSelectedIds()
  const removed = new Set(args.ids ?? [])
  if (lastSelectedId.value != null && removed.has(lastSelectedId.value)) {
    const remaining = selectedIds.value
    lastSelectedId.value =
      remaining.length > 0 ? remaining[remaining.length - 1] : null
  }
}

function stopSelectionBindTimer() {
  if (selectionBindTimer != null) {
    clearInterval(selectionBindTimer)
    selectionBindTimer = undefined
  }
}

function tryBindSelection(): boolean {
  try {
    const events = editor().curView.selectionSet.events
    events.selectionAdded.addEventListener(onSelectionAdded)
    events.selectionRemoved.addEventListener(onSelectionRemoved)
    refreshSelectedIds()
    return true
  } catch {
    return false
  }
}

function ensureSelectionBound() {
  if (selectionBound || selectionBindTimer != null) return
  if (tryBindSelection()) {
    selectionBound = true
    return
  }
  selectionBindTimer = setInterval(() => {
    if (tryBindSelection()) {
      selectionBound = true
      stopSelectionBindTimer()
    }
  }, 50)
}

onUnmounted(stopSelectionBindTimer)
ensureSelectionBound()

// Loading a drawing keeps old object ids in the engine's selection set;
// they resolve to unrelated entities in the new database, so drop them.
let documentBound = false
let documentBindTimer: ReturnType<typeof setInterval> | undefined

function onDocumentActivated() {
  selectedIds.value = []
  lastSelectedId.value = null
}

function stopDocumentBindTimer() {
  if (documentBindTimer != null) {
    clearInterval(documentBindTimer)
    documentBindTimer = undefined
  }
}

function tryBindDocument(): boolean {
  try {
    editor().events.documentActivated.addEventListener(onDocumentActivated)
    return true
  } catch {
    return false
  }
}

function ensureDocumentBound() {
  if (documentBound || documentBindTimer != null) return
  if (tryBindDocument()) {
    documentBound = true
    return
  }
  documentBindTimer = setInterval(() => {
    if (tryBindDocument()) {
      documentBound = true
      stopDocumentBindTimer()
    }
  }, 50)
}

onUnmounted(stopDocumentBindTimer)
ensureDocumentBound()

/** Currently selected entities (model space only). */
function selectedEntities(ids: AcDbObjectId[]): AcDbEntity[] {
  const d = db()
  if (!d || ids.length === 0) return []
  const modelSpace = d.tables.blockTable.modelSpace
  return ids
    .map(id => modelSpace.getIdAt(id))
    .filter((entity): entity is AcDbEntity => entity != null)
}

/** Resolves the entity whose layer the select mirrors (last selected wins). */
function displayEntity(): AcDbEntity | undefined {
  const d = db()
  const ids = selectedIds.value
  if (!d || ids.length === 0) return undefined
  const preferred =
    lastSelectedId.value != null && ids.includes(lastSelectedId.value)
      ? lastSelectedId.value
      : ids[ids.length - 1]
  return d.tables.blockTable.modelSpace.getIdAt(preferred)
}

// ── Display sync ──────────────────────────────────────────────────
// Selection wins over the database current layer.

const currentLayer = ref<string>(currentLayerName.value ?? '')

function readLayerDisplay(): string | undefined {
  try {
    // Always read the selection ref first so the watcher below tracks
    // selection changes even when the database is not ready yet.
    void selectedIds.value
    const entity = displayEntity()
    if (entity) return entity.layer
    return currentLayerName.value
  } catch {
    return undefined
  }
}

watch(
  readLayerDisplay,
  name => {
    if (name) currentLayer.value = name
  },
  { immediate: true }
)

const layerOptions = computed(() =>
  layers.value.map((l: LayerInfo) => ({ value: l.name, label: l.name }))
)

function layerColorFor(name: string): string {
  const layer = layers.value.find((l: LayerInfo) => l.name === name)
  if (!layer) return '#888'
  try {
    return (layer.color as unknown as { cssColor?: string }).cssColor ?? '#888'
  } catch {
    return '#888'
  }
}

function filterLayer(input: string, option?: { value: string }) {
  return (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
}

function onLayerChange(value: string) {
  if (props.disabled) return
  const d = db()
  const entities = selectedEntities(selectedIds.value)
  if (d && entities.length) {
    // Edit inside a transaction so the commit dispatches `entityModified`
    // (the view rebuilds the moved entities) and the change is undoable.
    acapRunDatabaseEdit(d, 'Change Layer', () => {
      entities.forEach(entity => {
        const opened = d.openEntityForWrite(entity.objectId)
        if (opened) opened.layer = value
      })
    })
  } else {
    setCurrentLayer(value)
  }
  currentLayer.value = value
}
</script>
