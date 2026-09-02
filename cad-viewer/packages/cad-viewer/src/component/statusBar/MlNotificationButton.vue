<template>
  <a-tooltip
    :title="t('main.statusBar.notification.tooltip')"
    :mouse-leave-delay="0"
  >
    <a-button
      class="ml-notification-button"
      @click="toggleNotificationCenter"
    >
      <template #icon><BellOutlined /></template>
      <a-badge
        v-if="unreadCount > 0"
        :count="unreadCount"
        :overflow-count="99"
        class="ml-notification-badge"
      />
    </a-button>
  </a-tooltip>
</template>

<script setup lang="ts">
import { BellOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

import { useNotificationCenter } from '../../composable/useNotificationCenter'

const { t } = useI18n()
const { unreadCount } = useNotificationCenter()

const emit = defineEmits<{
  click: []
}>()

const toggleNotificationCenter = () => {
  emit('click')
}
</script>

<style scoped>
.ml-notification-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: 30px;
  position: relative;
}

.ml-notification-badge {
  position: absolute;
  top: -2px;
  right: -2px;
}

.ml-notification-badge :deep(.ant-badge-count) {
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
}
</style>
