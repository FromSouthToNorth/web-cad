<template>
  <a-tooltip :title="t('main.statusBar.setting.tooltip')" :mouse-leave-delay="0">
    <a-dropdown :trigger="['click']">
      <a-button class="ml-setting-button">
        <template #icon><SettingOutlined /></template>
      </a-button>
      <template #overlay>
        <a-menu @click="handleMenuClick">
          <a-menu-item key="isShowStats">
            <CheckOutlined v-if="features.isShowStats" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.stats') }}
          </a-menu-item>
          <a-menu-item key="isShowCommandLine">
            <CheckOutlined v-if="features.isShowCommandLine" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.commandLine') }}
          </a-menu-item>
          <a-menu-item key="isShowFileName">
            <CheckOutlined v-if="features.isShowFileName" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.fileName') }}
          </a-menu-item>
          <a-menu-item key="isShowEntityInfo">
            <CheckOutlined v-if="features.isShowEntityInfo" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.entityInfo') }}
          </a-menu-item>
          <a-menu-item key="isShowRibbon">
            <CheckOutlined v-if="features.isShowRibbon" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.ribbon') }}
          </a-menu-item>
          <a-menu-item key="isShowLanguageSelector">
            <CheckOutlined v-if="features.isShowLanguageSelector" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.languageSelector') }}
          </a-menu-item>
          <a-menu-item key="isShowCoordinate">
            <CheckOutlined v-if="features.isShowCoordinate" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.coordinate') }}
          </a-menu-item>
          <a-menu-item key="isShowToolbar">
            <CheckOutlined v-if="features.isShowToolbar" style="margin-right: 8px;" />
            {{ t('main.statusBar.setting.toolbar') }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { CheckOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { AcApSettingManager, AcApSettings } from '@mlightcad/cad-simple-viewer'
import { useI18n } from 'vue-i18n'

import { useSettings } from '../../composable'

const { t } = useI18n()
const features = useSettings()

const handleMenuClick = ({ key }: { key: string }) => {
  const command = key as keyof AcApSettings
  if (command == 'isShowCoordinate') {
    features.isShowCoordinate = !features.isShowCoordinate
    AcApSettingManager.instance.isShowCoordinate = features.isShowCoordinate
  } else if (command == 'isShowCommandLine') {
    features.isShowCommandLine = !features.isShowCommandLine
    AcApSettingManager.instance.isShowCommandLine = features.isShowCommandLine
  } else if (command == 'isShowEntityInfo') {
    features.isShowEntityInfo = !features.isShowEntityInfo
    AcApSettingManager.instance.isShowEntityInfo = features.isShowEntityInfo
  } else if (command == 'isShowFileName') {
    features.isShowFileName = !features.isShowFileName
    AcApSettingManager.instance.isShowFileName = features.isShowFileName
  } else if (command == 'isShowRibbon') {
    features.isShowRibbon = !features.isShowRibbon
    AcApSettingManager.instance.isShowRibbon = features.isShowRibbon
  } else if (command == 'isShowLanguageSelector') {
    features.isShowLanguageSelector = !features.isShowLanguageSelector
    AcApSettingManager.instance.isShowLanguageSelector =
      features.isShowLanguageSelector
  } else if (command == 'isShowToolbar') {
    features.isShowToolbar = !features.isShowToolbar
    AcApSettingManager.instance.isShowToolbar = features.isShowToolbar
  } else if (command == 'isShowStats') {
    features.isShowStats = !features.isShowStats
    AcApSettingManager.instance.isShowStats = features.isShowStats
  }
}
</script>

<style scoped>
.ml-setting-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: 30px;
}
</style>
