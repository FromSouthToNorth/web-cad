<template>
  <div class="ml-polar-tracking-button">
    <a-tooltip :title="tooltip" :mouse-leave-delay="0">
      <a-button
        class="ml-polar-tracking-button__toggle"
        :style="{ color: iconColor }"
        @click="togglePolarTracking"
      >
        <template #icon><component :is="polarTracking" /></template>
      </a-button>
    </a-tooltip>
    <a-dropdown
      :trigger="['click']"
      :overlay-class-name="'ml-polar-tracking-popper'"
    >
      <a-button class="ml-polar-tracking-button__arrow">
        <DownOutlined />
      </a-button>
      <template #overlay>
        <a-menu @click="handleMenuClick">
          <a-menu-item
            v-for="increment in polarIncrements"
            :key="String(increment)"
          >
            <CheckOutlined v-if="isSamePolarIncrement(currentPolarang, increment)" style="margin-right: 8px;" />
            {{ formatPolarIncrementMenuLabel(increment) }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<script lang="ts" setup>
import { CheckOutlined, DownOutlined } from '@ant-design/icons-vue'
import {
  AcApDocManager,
  POLARMODE_POLAR_TRACKING,
  togglePolarTracking as togglePolarTrackingSysVar
} from '@mlightcad/cad-simple-viewer'
import { AcDbSysVarManager } from '@mlightcad/data-model'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  POLAR_ANGLE_SYSVAR_NAME,
  useSystemVars
} from '../../composable/useSystemVars'
import { polarTracking } from '../../svg'
import {
  formatPolarIncrementMenuLabel,
  isSamePolarIncrement,
  POLAR_TRACKING_INCREMENTS
} from './polarTrackingMenu'

const { t } = useI18n()
const systemVars = useSystemVars(AcApDocManager.instance)

const polarIncrements = POLAR_TRACKING_INCREMENTS

const currentPolarang = computed(() => Number(systemVars.polarang ?? 90))

const isEnabled = computed(
  () => (Number(systemVars.polarmode ?? 0) & POLARMODE_POLAR_TRACKING) !== 0
)

const iconColor = computed(() =>
  isEnabled.value ? 'var(--ml-theme-primary)' : 'var(--ml-theme-text-primary)'
)

const tooltip = computed(() =>
  isEnabled.value
    ? t('main.statusBar.polarTracking.on')
    : t('main.statusBar.polarTracking.off')
)

const togglePolarTracking = () => {
  togglePolarTrackingSysVar(AcApDocManager.instance.curDocument.database)
}

const setPolarang = (increment: number) => {
  const database = AcApDocManager.instance.curDocument.database
  AcDbSysVarManager.instance().setVar(
    POLAR_ANGLE_SYSVAR_NAME,
    increment,
    database
  )
}

const handleMenuClick = ({ key }: { key: string }) => {
  setPolarang(Number(key))
}
</script>

<style scoped>
.ml-polar-tracking-button {
  display: inline-flex;
  vertical-align: middle;
}

.ml-polar-tracking-button__toggle {
  border: none;
  padding: 0;
  cursor: pointer;
  width: 26px;
  height: var(--ml-status-bar-height, 30px);
}

.ml-polar-tracking-button__arrow {
  border: none;
  padding: 0;
  cursor: pointer;
  width: 10px;
  height: var(--ml-status-bar-height, 30px);
  min-width: 10px;
}

.ml-polar-tracking-button__arrow :deep(.anticon) {
  font-size: 10px;
}
</style>
