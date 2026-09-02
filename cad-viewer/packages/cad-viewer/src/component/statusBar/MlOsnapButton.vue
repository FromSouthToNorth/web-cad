<template>
  <a-tooltip :title="t('main.statusBar.osnap.tooltip')" :mouse-leave-delay="0">
    <a-dropdown :trigger="['click']">
      <a-button class="ml-osnap-setting-button">
        <template #icon><component :is="osnap" /></template>
      </a-button>
      <template #overlay>
        <a-menu @click="handleMenuClick">
          <a-menu-item
            v-for="mode in osnapModes"
            :key="mode.value"
          >
            <CheckOutlined v-if="acdbHasOsnapMode(features.osnapModes, mode.value)" style="margin-right: 8px;" />
            {{ mode.label }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { CheckOutlined } from '@ant-design/icons-vue'
import { AcApSettingManager } from '@mlightcad/cad-simple-viewer'
import {
  acdbHasOsnapMode,
  AcDbOsnapMode,
  acdbToggleOsnapMode
} from '@mlightcad/data-model'
import { useI18n } from 'vue-i18n'

import { useSettings } from '../../composable'
import { osnap } from '../../svg'

const { t } = useI18n()
const features = useSettings()

/**
 * All object snap modes generated from AcDbOsnapMode enum.
 *
 * Label key format:
 *   main.statusBar.osnap.<LowerCaseEnumName>
 *
 * Example:
 *   AcDbOsnapMode.EndPoint → main.statusBar.osnap.endpoint
 */
const osnapModes = [
  { value: AcDbOsnapMode.EndPoint, label: t('main.statusBar.osnap.endpoint') },
  { value: AcDbOsnapMode.MidPoint, label: t('main.statusBar.osnap.midpoint') },
  { value: AcDbOsnapMode.Center, label: t('main.statusBar.osnap.center') },
  { value: AcDbOsnapMode.Node, label: t('main.statusBar.osnap.node') },
  { value: AcDbOsnapMode.Quadrant, label: t('main.statusBar.osnap.quadrant') },
  {
    value: AcDbOsnapMode.Insertion,
    label: t('main.statusBar.osnap.insertion')
  },
  { value: AcDbOsnapMode.Nearest, label: t('main.statusBar.osnap.nearest') }
  // { value: AcDbOsnapMode.Perpendicular, label: t('main.statusBar.osnap.perpendicular') },
  // { value: AcDbOsnapMode.Tangent, label: t('main.statusBar.osnap.tangent') },
  // { value: AcDbOsnapMode.Centroid, label: t('main.statusBar.osnap.centroid') }
]

/**
 * Toggle osnap mode and update the bitmask.
 */
const handleMenuClick = ({ key }: { key: string }) => {
  const mode = Number(key) as AcDbOsnapMode
  features.osnapModes = acdbToggleOsnapMode(features.osnapModes, mode)
  AcApSettingManager.instance.osnapModes = features.osnapModes
}
</script>

<style scoped>
.ml-osnap-setting-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: 30px;
}
</style>
