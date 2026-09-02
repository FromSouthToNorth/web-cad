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
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  type LayerInfo,
  useLayers
} from '@mlightcad/cad-viewer'
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

const currentLayer = ref<string>(currentLayerName.value ?? '')

watch(currentLayerName, name => {
  if (name) currentLayer.value = name
})

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
  setCurrentLayer(value)
}
</script>
