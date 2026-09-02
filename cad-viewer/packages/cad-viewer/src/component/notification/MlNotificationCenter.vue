<template>
  <div class="ml-notification-center">
    <!-- Notification Center Header -->
    <div class="ml-notification-center-header">
      <div class="ml-notification-center-title">
        <BellOutlined class="ml-notification-center-icon" />
        <span>{{ titleText }}</span>
      </div>
      <div class="ml-notification-center-actions">
        <a-tooltip
          v-if="notifications.length > 0"
          :title="t('main.notification.center.clearAll')"
          :mouseLeaveDelay="0"
        >
          <a-button
            type="text"
            shape="circle"
            size="small"
            class="ml-notification-center-clear"
            @click="clearAll"
          >
            <DeleteOutlined />
          </a-button>
        </a-tooltip>
        <a-button
          type="text"
          size="small"
          class="ml-notification-center-close"
          @click="$emit('close')"
        >
          <CloseOutlined />
        </a-button>
      </div>
    </div>

    <!-- Notification List -->
    <div class="ml-notification-center-content">
      <div
        v-if="notifications.length === 0"
        class="ml-notification-center-empty"
      >
        <BellOutlined class="ml-notification-center-empty-icon" />
        <p>{{ t('main.notification.center.noNotifications') }}</p>
      </div>
      <div v-else class="ml-notification-list">
        <ml-notification-item
          v-for="notification in notifications"
          :key="notification.id"
          :notification="notification"
          @close="remove(notification.id)"
          @action="handleAction"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BellOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  type NotificationAction,
  useNotificationCenter
} from '../../composable/useNotificationCenter'
import MlNotificationItem from './MlNotificationItem.vue'

interface Props {
  /** Optional custom title for the notification center header */
  title?: string
}

const { t } = useI18n()
const props = defineProps<Props>()
const titleText = computed(
  () => props.title ?? t('main.notification.center.title')
)
const { notifications, remove, clearAll } = useNotificationCenter()

defineEmits<{
  close: []
}>()

const handleAction = (action: NotificationAction) => {
  action.action()
}
</script>

<style scoped>
.ml-notification-center {
  position: fixed;
  bottom: calc(var(--ml-status-bar-height) + 20px);
  right: 0; /* align with right border of the window */
  width: 400px; /* default width on larger screens */
  max-width: 100vw; /* never exceed the viewport width */
  box-sizing: border-box; /* include borders in width to avoid overflow */
  max-height: 500px;
  background: var(--ml-theme-bg-surface);
  border: 1px solid var(--ml-theme-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ml-notification-center-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 5px;
  height: 30px; /* fixed header height for consistency */
  border-bottom: 1px solid var(--ml-theme-border);
  background: var(--ml-theme-bg-hover);
  position: relative;
}

.ml-notification-center-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--ml-theme-text-primary);
}

.ml-notification-center-icon {
  color: var(--ml-theme-primary);
}

.ml-notification-center-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 36px; /* reserve space for absolute close button */
}

.ml-notification-center-close {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  padding: 4px;
  min-width: auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ml-notification-center-clear {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ml-notification-center-clear svg {
  font-size: 16px;
}

.ml-notification-center-content {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.ml-notification-center-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--ml-theme-text-secondary);
}

.ml-notification-center-empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.ml-notification-center-empty p {
  margin: 0;
  font-size: 14px;
}

.ml-notification-list {
  padding: 8px 0;
}

/* Dark theme adjustments */
.dark .ml-notification-center {
  background: var(--ml-theme-bg-base);
  border-color: var(--ml-theme-border);
}

.dark .ml-notification-center-header {
  background: var(--ml-theme-bg-surface);
}
</style>
