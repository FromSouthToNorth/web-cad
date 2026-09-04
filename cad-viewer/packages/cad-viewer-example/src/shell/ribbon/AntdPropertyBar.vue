<template>
  <div class="antd-property-bar">
    <!-- Color selector -->
    <a-dropdown
      :trigger="['click']"
      :disabled="props.disabled"
      placement="bottomLeft"
    >
      <button
        type="button"
        class="antd-property-bar-swatch"
        :style="{ '--swatch-color': currentColorDisplay }"
        :aria-label="t('shell.propertyBar.color')"
      >
        <span class="antd-property-bar-swatch-fill" />
        <span class="antd-property-bar-swatch-label">
          {{ t('shell.propertyBar.color') }}
        </span>
        <span class="antd-property-bar-swatch-arrow">▾</span>
      </button>
      <template #overlay>
        <div class="antd-property-bar-color-menu">
          <button
            v-for="c in colorOptions"
            :key="c.value"
            type="button"
            class="antd-property-bar-color-item"
            :class="{ 'is-active': c.value === currentColorKey }"
            @click="onColorChange(c.value)"
          >
            <span
              class="antd-property-bar-color-dot"
              :style="{ background: c.swatch }"
            />
            <span>{{ c.label }}</span>
          </button>
        </div>
      </template>
    </a-dropdown>

    <!-- Linetype selector -->
    <a-select
      v-model:value="currentLinetype"
      class="antd-ribbon-select antd-property-bar-linetype"
      :options="linetypeOptions"
      :placeholder="t('shell.propertyBar.linetype')"
      :aria-label="t('shell.propertyBar.linetype')"
      :disabled="props.disabled"
      @change="onLinetypeChange"
    >
      <template #optionLabel="option">
        <span v-if="option" class="antd-property-bar-linetype-option">
          <span class="antd-property-bar-linetype-preview" :class="`lt-${option.value}`" />
          <span>{{ option.label ?? option.value }}</span>
        </span>
      </template>
      <template #option="option">
        <span class="antd-property-bar-linetype-option">
          <span class="antd-property-bar-linetype-preview" :class="`lt-${option.value}`" />
          <span>{{ option.label ?? option.value }}</span>
        </span>
      </template>
    </a-select>

    <!-- Lineweight selector -->
    <a-select
      v-model:value="currentLineweight"
      class="antd-ribbon-select antd-property-bar-lineweight"
      :options="lineweightOptions"
      :placeholder="t('shell.propertyBar.lineweight')"
      :aria-label="t('shell.propertyBar.lineweight')"
      :disabled="props.disabled"
      @change="onLineweightChange"
    />
  </div>
</template>

<script setup lang="ts">
import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@mlightcad/cad-simple-viewer'
import {
  AcCmColor,
  type AcDbDatabase,
  type AcDbEntity,
  type AcDbObjectId,
  AcGiLineWeight
} from '@mlightcad/data-model'
import { computed, onUnmounted, ref, watch } from 'vue'
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

function db(): AcDbDatabase | undefined {
  try {
    return editor().curDocument?.database
  } catch {
    return undefined
  }
}

// ── Selection sync ───────────────────────────────────────────────────
// The toolbar mirrors the most recently selected entity's color / linetype /
// lineweight. With no selection it falls back to the database's current
// style (CECOLOR / CELTYPE / CELWEIGHT) used for newly created entities.

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

// The ribbon mounts before the engine bootstraps, so bind once the
// AcApDocManager singleton appears (same retry pattern as AntdLayerSelect).
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

// ── Document sync ───────────────────────────────────────────────────
// Loading a drawing replaces the database (CECOLOR / CELTYPE / CELWEIGHT
// come from the drawing header) and invalidates the previous selection:
// the engine keeps old object ids in the selection set, which would resolve
// to unrelated entities in the new database. The toolbar therefore drops
// its selection copy and re-reads the current style on document activation.

const documentVersion = ref(0)

let documentBound = false
let documentBindTimer: ReturnType<typeof setInterval> | undefined

function onDocumentActivated() {
  selectedIds.value = []
  lastSelectedId.value = null
  documentVersion.value++
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

/** Entity the toolbar mirrors — the last selected one wins. */
function displayEntity(): AcDbEntity | undefined {
  const ids = selectedIds.value
  if (ids.length === 0) return undefined
  const preferred =
    lastSelectedId.value != null && ids.includes(lastSelectedId.value)
      ? lastSelectedId.value
      : ids[ids.length - 1]
  const d = db()
  if (!d) return undefined
  return d.tables.blockTable.modelSpace.getIdAt(preferred)
}

/**
 * Applies one style edit to the selected entities inside a database
 * transaction. Direct assignment outside a transaction mutates the model
 * silently: no `entityModified` event fires, so the view never rebuilds the
 * scene geometry and the edit is not undoable. Returns false when there is
 * no selection, so the caller falls back to the database current style.
 */
function editSelectedEntities(
  label: string,
  apply: (entity: AcDbEntity) => void
): boolean {
  const d = db()
  const entities = selectedEntities(selectedIds.value)
  if (!d || entities.length === 0) return false
  acapRunDatabaseEdit(d, label, () => {
    entities.forEach(entity => {
      const opened = d.openEntityForWrite(entity.objectId)
      if (opened) apply(opened)
    })
  })
  return true
}

// ── Colors ─────────────────────────────────────────────────────────

const currentColorKey = ref<string>('ByLayer')
const currentColorDisplay = ref('#888888')

const colorOptions = [
  { value: 'ByLayer', label: 'ByLayer', swatch: '#888888' },
  { value: 'ByBlock', label: 'ByBlock', swatch: '#a0a8b8' },
  { value: 'red', label: 'Red', swatch: '#ff0000' },
  { value: 'yellow', label: 'Yellow', swatch: '#ffff00' },
  { value: 'green', label: 'Green', swatch: '#00ff00' },
  { value: 'cyan', label: 'Cyan', swatch: '#00ffff' },
  { value: 'blue', label: 'Blue', swatch: '#0000ff' },
  { value: 'magenta', label: 'Magenta', swatch: '#ff00ff' },
  { value: 'white', label: 'White / Black', swatch: '#ffffff' }
]

function resolveColorDisplay(key: string): string {
  const opt = colorOptions.find(c => c.value === key)
  return opt?.swatch ?? '#888888'
}

function onColorChange(key: string) {
  if (props.disabled) return
  const color = AcCmColor.fromString(key) ?? new AcCmColor()
  if (key === 'ByLayer') color.setByLayer()
  else if (key === 'ByBlock') color.setByBlock()
  if (
    !editSelectedEntities('Change Color', entity => {
      entity.color = color
    })
  ) {
    const d = db()
    if (!d) return
    d.cecolor = color
  }
  currentColorKey.value = key
  currentColorDisplay.value = resolveColorDisplay(key)
}

// ── Linetypes ─────────────────────────────────────────────────────

const currentLinetype = ref<string>('ByLayer')

const baseLinetypeOptions = computed(() => [
  { value: 'ByLayer', label: 'ByLayer' },
  { value: 'ByBlock', label: 'ByBlock' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'ACAD_ISO02W100', label: 'Dashed' },
  { value: 'ACAD_ISO03W100', label: 'Dotted' },
  { value: 'ACAD_ISO04W100', label: 'Dash Dot' },
  { value: 'ACAD_ISO05W100', label: 'Dash Dot Dot' }
])

/**
 * Maps a stored linetype name to a toolbar option key. DXF files carry
 * linetype names uppercase ('CONTINUOUS', 'DASHED', ...) while the toolbar
 * options use title case; names outside the fixed list are kept as-is.
 */
function linetypeKeyFor(name: string): string {
  if (!name) return 'ByLayer'
  const option = baseLinetypeOptions.value.find(
    o => o.value.toLowerCase() === name.toLowerCase()
  )
  return option?.value ?? name
}

/** Fixed options plus the linetypes of the loaded drawing. */
const linetypeOptions = computed(() => {
  const options = [...baseLinetypeOptions.value]
  const seen = new Set(options.map(o => o.value.toLowerCase()))
  try {
    const table = db()?.tables.linetypeTable
    if (table) {
      for (const record of table.newIterator()) {
        const name = record?.name
        if (!name || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())
        options.push({ value: name, label: name })
      }
    }
  } catch {
    // Table not available yet (engine still bootstrapping).
  }
  const current = currentLinetype.value
  if (current && !seen.has(current.toLowerCase())) {
    options.push({ value: current, label: current })
  }
  return options
})

function onLinetypeChange(value: string) {
  if (props.disabled) return
  if (
    !editSelectedEntities('Change Linetype', entity => {
      entity.lineType = value
    })
  ) {
    const d = db()
    if (!d) return
    d.celtype = value
  }
  currentLinetype.value = value
}

// ── Lineweights ───────────────────────────────────────────────────

const currentLineweight = ref<number>(AcGiLineWeight.ByLayer)

const specialLw = computed(() => [
  { value: AcGiLineWeight.ByLayer, label: 'ByLayer' },
  { value: AcGiLineWeight.ByBlock, label: 'ByBlock' }
])

const numericLw = (Object.values(AcGiLineWeight) as number[])
  .filter(v => typeof v === 'number' && v > 0 && v !== 0xFFFF)
  .sort((a, b) => a - b)

const lineweightOptions = computed(() => [
  ...specialLw.value,
  ...numericLw.map(v => ({
    value: v,
    label: `${(v / 100).toFixed(2)} mm`
  }))
])

function onLineweightChange(value: number) {
  if (props.disabled) return
  if (
    !editSelectedEntities('Change Lineweight', entity => {
      entity.lineWeight = value as AcGiLineWeight
    })
  ) {
    const d = db()
    if (!d) return
    d.celweight = value as AcGiLineWeight
  }
  currentLineweight.value = value
}

// ── Display sync ─────────────────────────────────────────────────────

/** Normalizes an rgb()/hex CSS color to lowercase hex for swatch matching. */
function cssToHex(css: string): string {
  const match = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!match) return css.toLowerCase()
  return (
    '#' +
    [match[1], match[2], match[3]]
      .map(channel => Number(channel).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Maps an AcCmColor back to a toolbar option key where one exists. */
function colorKeyFor(color: AcCmColor | undefined): string {
  if (!color) return 'ByLayer'
  const key = color.toString()
  if (key === 'ByLayer' || key === 'ByBlock') return key
  if (color.cssColor) {
    const hex = cssToHex(color.cssColor)
    const option = colorOptions.find(c => c.swatch.toLowerCase() === hex)
    if (option) return option.value
  }
  return key
}

/**
 * Current display state. A selection wins over the database current style;
 * undefined while the engine has not bootstrapped yet.
 */
function readDisplayState(): {
  colorKey: string
  colorDisplay: string
  linetype: string
  lineweight: number
} | undefined {
  try {
    // Always read the selection ref first so the watcher below tracks
    // selection changes even when the database is not ready yet. The
    // documentVersion read makes it re-run after a drawing is loaded.
    void selectedIds.value
    void documentVersion.value
    const entity = displayEntity()
    if (entity) {
      const color = entity.color
      const key = colorKeyFor(color)
      return {
        colorKey: key,
        colorDisplay: color.cssColor ?? resolveColorDisplay(key),
        linetype: linetypeKeyFor(entity.lineType),
        lineweight: Number(entity.lineWeight)
      }
    }
    const d = db()
    if (!d) return undefined
    const color = d.cecolor
    const key = colorKeyFor(color)
    return {
      colorKey: key,
      colorDisplay: color?.cssColor ?? resolveColorDisplay(key),
      linetype: linetypeKeyFor(d.celtype),
      lineweight: Number(d.celweight)
    }
  } catch {
    return undefined
  }
}

watch(
  readDisplayState,
  state => {
    if (!state) return
    currentColorKey.value = state.colorKey
    currentColorDisplay.value = state.colorDisplay
    currentLinetype.value = state.linetype
    currentLineweight.value = state.lineweight
  },
  { immediate: true }
)
</script>
