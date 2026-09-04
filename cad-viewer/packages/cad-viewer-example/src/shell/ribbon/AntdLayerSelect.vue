<template>
  <a-dropdown
    v-model:open="dropdownOpen"
    :trigger="['click']"
    placement="bottomLeft"
    :disabled="props.disabled"
    :destroy-popup-on-hide="true"
    @open-change="onOpenChange"
  >
    <!-- Compact trigger: color dot + current layer + state steppers + arrow.
         The three state icons toggle the shown layer's state and step to
         the next layer; the name/arrow area opens the dropdown. -->
    <div
      class="antd-layer-select-trigger"
      :class="{ 'is-disabled': props.disabled }"
      role="button"
      tabindex="0"
      :aria-label="t('shell.propertyBar.layer')"
      :aria-disabled="props.disabled"
      aria-haspopup="menu"
      @keydown="onTriggerKeydown"
    >
      <span
        class="antd-property-bar-color-dot"
        :style="{ background: currentLayerColor }"
        aria-hidden="true"
      />
      <span class="antd-layer-select-trigger-name">
        {{ currentLayer || t('shell.propertyBar.layer') }}
      </span>
      <span class="antd-layer-select-trigger-states">
        <!-- Hide/show the current layer, then step to the next layer -->
        <a-tooltip
          :title="
            currentLayerOn
              ? t('shell.layerPanel.hideLayer', { name: currentLayer || '' })
              : t('shell.layerPanel.showLayer', { name: currentLayer || '' })
          "
          placement="bottom"
        >
          <button
            type="button"
            class="antd-layer-select-state"
            :class="{ 'is-active': !currentLayerOn }"
            :aria-label="
              currentLayerOn
                ? t('shell.layerPanel.hideLayer', { name: currentLayer || '' })
                : t('shell.layerPanel.showLayer', { name: currentLayer || '' })
            "
            @click.stop="stepToggleLayer('on')"
          >
            <EyeInvisibleOutlined v-if="!currentLayerOn" />
            <EyeOutlined v-else />
          </button>
        </a-tooltip>
        <!-- Freeze/thaw the current layer, then step to the next layer -->
        <a-tooltip
          :title="
            currentLayerFrozen
              ? t('shell.layerPanel.thawLayer', { name: currentLayer || '' })
              : t('shell.layerPanel.freezeLayer', { name: currentLayer || '' })
          "
          placement="bottom"
        >
          <button
            type="button"
            class="antd-layer-select-state"
            :class="{ 'is-active': currentLayerFrozen }"
            :aria-label="
              currentLayerFrozen
                ? t('shell.layerPanel.thawLayer', { name: currentLayer || '' })
                : t('shell.layerPanel.freezeLayer', { name: currentLayer || '' })
            "
            @click.stop="stepToggleLayer('frozen')"
          >
            <component :is="currentLayerFrozen ? iconLayerFreeze : iconLayerThawed" />
          </button>
        </a-tooltip>
        <!-- Lock/unlock the current layer, then step to the next layer -->
        <a-tooltip
          :title="
            currentLayerLocked
              ? t('shell.layerPanel.unlockLayer', { name: currentLayer || '' })
              : t('shell.layerPanel.lockLayer', { name: currentLayer || '' })
          "
          placement="bottom"
        >
          <button
            type="button"
            class="antd-layer-select-state"
            :class="{ 'is-active': currentLayerLocked }"
            :aria-label="
              currentLayerLocked
                ? t('shell.layerPanel.unlockLayer', { name: currentLayer || '' })
                : t('shell.layerPanel.lockLayer', { name: currentLayer || '' })
            "
            @click.stop="stepToggleLayer('locked')"
          >
            <LockOutlined v-if="currentLayerLocked" />
            <UnlockOutlined v-else />
          </button>
        </a-tooltip>
      </span>
      <DownOutlined class="antd-layer-select-trigger-arrow" />
    </div>

    <template #overlay>
      <div class="antd-layer-select-menu">
        <!-- Real-time case-insensitive filter -->
        <div class="antd-layer-select-search">
          <a-input
            ref="searchInput"
            v-model:value="query"
            size="small"
            allow-clear
            :placeholder="t('shell.layerPanel.searchPlaceholder')"
            @click.stop
          />
        </div>

        <div class="antd-layer-select-list">
          <div
            v-for="layer in filteredLayers"
            :key="layer.name"
            v-memo="[
              layer.name,
              layer.isOn,
              layer.isFrozen,
              layer.isLocked,
              layer.cssColor,
              layer.name === currentLayer
            ]"
            class="antd-layer-select-row"
            :class="{ 'is-current': layer.name === currentLayer }"
          >
            <button
              type="button"
              class="antd-layer-select-row-main"
              :title="layer.name"
              @click="onLayerChange(layer.name)"
            >
              <span
                class="antd-property-bar-color-dot"
                :style="{ background: layer.cssColor || '#888' }"
                aria-hidden="true"
              />
              <span class="antd-layer-select-row-name">{{ layer.name }}</span>
            </button>

            <!-- On/off (visibility) -->
            <a-tooltip
              :title="
                layer.isOn
                  ? t('shell.layerPanel.hideLayer', { name: layer.name })
                  : t('shell.layerPanel.showLayer', { name: layer.name })
              "
              placement="bottom"
            >
              <button
                type="button"
                class="antd-layer-select-state"
                :class="{ 'is-active': !layer.isOn }"
                :aria-label="
                  layer.isOn
                    ? t('shell.layerPanel.hideLayer', { name: layer.name })
                    : t('shell.layerPanel.showLayer', { name: layer.name })
                "
                @click="toggleLayerState(layer, 'on')"
              >
                <EyeOutlined v-if="layer.isOn" />
                <EyeInvisibleOutlined v-else />
              </button>
            </a-tooltip>

            <!-- Freeze/thaw -->
            <a-tooltip
              :title="
                layer.isFrozen
                  ? t('shell.layerPanel.thawLayer', { name: layer.name })
                  : t('shell.layerPanel.freezeLayer', { name: layer.name })
              "
              placement="bottom"
            >
              <button
                type="button"
                class="antd-layer-select-state"
                :class="{ 'is-active': layer.isFrozen }"
                :aria-label="
                  layer.isFrozen
                    ? t('shell.layerPanel.thawLayer', { name: layer.name })
                    : t('shell.layerPanel.freezeLayer', { name: layer.name })
                "
                @click="toggleLayerState(layer, 'frozen')"
              >
                <component :is="layer.isFrozen ? iconLayerFreeze : iconLayerThawed" />
              </button>
            </a-tooltip>

            <!-- Lock/unlock -->
            <a-tooltip
              :title="
                layer.isLocked
                  ? t('shell.layerPanel.unlockLayer', { name: layer.name })
                  : t('shell.layerPanel.lockLayer', { name: layer.name })
              "
              placement="bottom"
            >
              <button
                type="button"
                class="antd-layer-select-state"
                :class="{ 'is-active': layer.isLocked }"
                :aria-label="
                  layer.isLocked
                    ? t('shell.layerPanel.unlockLayer', { name: layer.name })
                    : t('shell.layerPanel.lockLayer', { name: layer.name })
                "
                @click="toggleLayerState(layer, 'locked')"
              >
                <LockOutlined v-if="layer.isLocked" />
                <UnlockOutlined v-else />
              </button>
            </a-tooltip>
          </div>

          <a-empty
            v-if="!filteredLayers.length"
            :description="t('shell.layerPanel.noLayers')"
            :image-style="{ height: '36px' }"
          />
        </div>
      </div>
    </template>
  </a-dropdown>
</template>

<script setup lang="ts">
import {
  DownOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  UnlockOutlined
} from '@ant-design/icons-vue'
import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@mlightcad/cad-simple-viewer'
import {
  type LayerInfo,
  type LayerStateToggleKey,
  useLayers
} from '@mlightcad/cad-viewer'
import {
  type AcDbEntity,
  type AcDbObjectId
} from '@mlightcad/data-model'
import { computed, effectScope, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { iconLayerFreeze, iconLayerThawed } from '../icons'

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

/** Color dot of the layer shown in the trigger. */
const currentLayerColor = computed(() => {
  const layer = layers.value.find((l: LayerInfo) => l.name === currentLayer.value)
  return layer?.cssColor || '#888'
})

/** State of the layer currently shown in the trigger (drives the steppers). */
const currentLayerRow = computed(() =>
  layers.value.find((l: LayerInfo) => l.name === currentLayer.value)
)
const currentLayerOn = computed(() => currentLayerRow.value?.isOn ?? true)
const currentLayerFrozen = computed(
  () => currentLayerRow.value?.isFrozen ?? false
)
const currentLayerLocked = computed(
  () => currentLayerRow.value?.isLocked ?? false
)

// ── Search filter ─────────────────────────────────────────────────

const query = ref('')

/** Real-time, case-insensitive layer filter (cached via computed). */
const filteredLayers = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return layers.value
  return layers.value.filter(layer => layer.name.toLowerCase().includes(q))
})

// ── Dropdown ──────────────────────────────────────────────────────

const dropdownOpen = ref(false)
const searchInput = ref<{ focus?: () => void }>()

function onOpenChange(open: boolean) {
  if (!open) return
  // Start every open with a clean filter, then focus the search input
  // for immediate typing. The popup mounts lazily (and async under the
  // open motion), so retry until the input appears.
  query.value = ''
  let attempts = 0
  const focusSearch = () => {
    const input = searchInput.value
    if (input?.focus) {
      input.focus()
      return
    }
    if (attempts++ < 20) setTimeout(focusSearch, 25)
  }
  focusSearch()
}

/** Enter/Space toggle the dropdown when the trigger itself is focused. */
function onTriggerKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    dropdownOpen.value = !dropdownOpen.value
  }
}

// ── Layer actions ─────────────────────────────────────────────────

/** Flips one of the on/frozen/locked flags on a layer row. */
function toggleLayerState(layer: LayerInfo, state: LayerStateToggleKey) {
  if (props.disabled) return
  layerBindings.value?.toggleLayerState(layer.name, state)
}

/**
 * Trigger steppers: flip the shown layer's state, then step to the next
 * layer in the list — walking through layers one click at a time.
 */
function stepToggleLayer(state: LayerStateToggleKey) {
  if (props.disabled) return
  const names = layers.value.map(layer => layer.name)
  if (!names.length) return
  const current = currentLayer.value || names[0]
  layerBindings.value?.toggleLayerState(current, state)
  const index = names.indexOf(current)
  const next = names[(index + 1) % names.length]
  if (next && next !== current) {
    onLayerChange(next)
  }
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
