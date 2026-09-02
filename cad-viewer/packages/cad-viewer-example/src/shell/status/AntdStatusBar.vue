<template>
  <div class="antd-status-bar">
    <div class="antd-status-bar-layouts" role="tablist">
      <button
        v-for="layout in layouts"
        :key="layout.blockTableRecordId"
        type="button"
        role="tab"
        :disabled="props.disabled" class="antd-status-layout-tab"
        :class="{ 'is-active': layout.isActive }"
        :aria-selected="layout.isActive"
        @click="selectLayout(layout)"
      >
        {{ layout.name }}
      </button>
    </div>

    <div class="antd-status-bar-right">
      <span class="antd-status-coords">{{ posText }}</span>

      <a-tooltip :title="t('shell.status.ortho')" placement="top">
        <a-button
          type="text"
          size="small"
          :disabled="props.disabled" class="antd-status-toggle"
          :class="{ 'is-active': orthoOn }"
          @click="toggleSysVar(ORTHO_MODE_SYSVAR_NAME, 'orthomode')"
        >
          <template #icon><AimOutlined /></template>
        </a-button>
      </a-tooltip>

      <a-tooltip :title="t('shell.status.lineweight')" placement="top">
        <a-button
          type="text"
          size="small"
          :disabled="props.disabled" class="antd-status-toggle"
          :class="{ 'is-active': lwdisplayOn }"
          @click="toggleSysVar(LINEWIDTH_DISPLAY_SYSVAR_NAME, 'lwdisplay')"
        >
          <template #icon><ColumnHeightOutlined /></template>
        </a-button>
      </a-tooltip>

      <a-tooltip :title="t('shell.status.dynamicInput')" placement="top">
        <a-button
          type="text"
          size="small"
          :disabled="props.disabled" class="antd-status-toggle"
          :class="{ 'is-active': dynmodeOn }"
          @click="toggleDynmode"
        >
          <template #icon><FontSizeOutlined /></template>
        </a-button>
      </a-tooltip>

      <a-tooltip :title="t('shell.status.theme')" placement="top">
        <a-button
          type="text"
          size="small"
          :disabled="props.disabled" class="antd-status-toggle"
          @click="emit('toggle-theme')"
        >
          <template #icon><BgColorsOutlined /></template>
        </a-button>
      </a-tooltip>

      <a-tooltip :title="t('shell.status.fullscreen')" placement="top">
        <a-button
          type="text"
          size="small"
          :disabled="props.disabled" class="antd-status-toggle"
          @click="toggleFullscreen"
        >
          <template #icon>
            <FullscreenExitOutlined v-if="isFullscreen" />
            <FullscreenOutlined v-else />
          </template>
        </a-button>
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AimOutlined,
  BgColorsOutlined,
  ColumnHeightOutlined,
  FontSizeOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined
} from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  acdbHostApplicationServices,
  AcDbSysVarManager
} from '@mlightcad/data-model'
import {
  DYNAMIC_MODE_SYSVAR_NAME,
  LINEWIDTH_DISPLAY_SYSVAR_NAME,
  ORTHO_MODE_SYSVAR_NAME,
  type LayoutInfo,
  useCurrentPos,
  useLayouts,
  useSystemVars
} from '@mlightcad/cad-viewer'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  /** Disable interactions while a document is opening. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  'toggle-theme': []
}>()

const editor = AcApDocManager.instance
const layouts = useLayouts(editor)
const systemVars = useSystemVars(editor)
const { text: posText } = useCurrentPos(editor.curView)

const isFullscreen = ref(false)

const onFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement != null
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})

const toggleFullscreen = () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void document.documentElement.requestFullscreen()
  }
}

const selectLayout = (layout: LayoutInfo) => {
  acdbHostApplicationServices().layoutManager.setCurrentLayoutBtrId(
    layout.blockTableRecordId
  )
}

const orthoOn = computed(() => Number(systemVars.orthomode ?? 0) !== 0)
const lwdisplayOn = computed(() => Number(systemVars.lwdisplay ?? 0) !== 0)
const dynmodeOn = computed(() => Number(systemVars.dynmode ?? 0) !== 0)

const toggleSysVar = (name: string, key: 'orthomode' | 'lwdisplay') => {
  const database = editor.curDocument?.database
  if (!database) return
  const current = Number(systemVars[key] ?? 0)
  AcDbSysVarManager.instance().setVar(name, current === 0 ? 1 : 0, database)
}

const toggleDynmode = () => {
  const database = editor.curDocument?.database
  if (!database) return
  const current = Number(systemVars.dynmode ?? 0)
  AcDbSysVarManager.instance().setVar(
    DYNAMIC_MODE_SYSVAR_NAME,
    current === 0 ? 3 : 0,
    database
  )
}
</script>
