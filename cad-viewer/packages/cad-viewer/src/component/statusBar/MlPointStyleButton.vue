<template>
  <a-tooltip :title="t('main.statusBar.pointStyle.tooltip')" :mouse-leave-delay="0">
    <a-button
      class="ml-point-style-button"
      @click="click()"
    >
      <template #icon><ToolOutlined /></template>
    </a-button>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { ToolOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const click = () => {
  AcApDocManager.instance.sendStringToExecute('pttype')
}
</script>

<style scoped>
.ml-point-style-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: 30px;
}
</style>
