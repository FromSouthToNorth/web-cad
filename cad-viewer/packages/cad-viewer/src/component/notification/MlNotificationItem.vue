<template>
  <div
    class="ml-notification-item"
    :class="`ml-notification-item--${notification.type}`"
  >
    <!-- Notification Icon -->
    <div class="ml-notification-item-icon">
      <component :is="typeIcon" />
    </div>

    <!-- Notification Content -->
    <div class="ml-notification-item-content">
      <div class="ml-notification-item-header">
        <h4 class="ml-notification-item-title">{{ notification.title }}</h4>
        <div class="ml-notification-item-actions">
          <template
            v-if="notification.actions && notification.actions.length > 0"
          >
            <a-button
              v-for="action in notification.actions"
              :key="action.label"
              :type="action.primary ? 'primary' : 'default'"
              size="small"
              @click="handleAction(action)"
            >
              {{ action.label }}
            </a-button>
          </template>
          <a-button type="text" size="small" @click="$emit('close')">
            <CloseOutlined />
          </a-button>
        </div>
      </div>

      <p v-if="notification.message" class="ml-notification-item-message">
        {{ notification.message }}
      </p>

      <div class="ml-notification-item-footer">
        <span class="ml-notification-item-time">
          {{ formatTime(notification.timestamp) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  InfoCircleFilled,
  WarningFilled
} from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  Notification,
  NotificationAction
} from '../../composable/useNotificationCenter'

interface Props {
  notification: Notification
}

const props = defineProps<Props>()

defineEmits<{
  close: []
  action: [action: NotificationAction]
}>()

const { t } = useI18n()

const typeIcon = computed(() => {
  switch (props.notification.type) {
    case 'info':
      return InfoCircleFilled
    case 'warning':
      return WarningFilled
    case 'error':
      return CloseCircleFilled
    case 'success':
      return CheckCircleFilled
    default:
      return InfoCircleFilled
  }
})

const handleAction = (action: NotificationAction) => {
  action.action()
  // Emit action event for parent component to handle
  // This allows the notification center to close after action if needed
}

const formatTime = (timestamp: Date) => {
  const now = new Date()
  const diff = now.getTime() - timestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (days > 0) {
    return t('main.notification.time.daysAgo', { count: days })
  } else if (hours > 0) {
    return t('main.notification.time.hoursAgo', { count: hours })
  } else if (minutes > 0) {
    return t('main.notification.time.minutesAgo', { count: minutes })
  } else {
    return t('main.notification.time.justNow')
  }
}
</script>

<style scoped>
.ml-notification-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ml-theme-border);
  transition: background-color 0.2s ease;
}

.ml-notification-item:hover {
  background-color: var(--ml-theme-bg-hover);
}

.ml-notification-item:last-child {
  border-bottom: none;
}

.ml-notification-item-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.ml-notification-item--info .ml-notification-item-icon {
  color: #06b6d4;
}

.ml-notification-item--warning .ml-notification-item-icon {
  color: #f59e0b;
}

.ml-notification-item--error .ml-notification-item-icon {
  color: #ef4444;
}

.ml-notification-item--success .ml-notification-item-icon {
  color: var(--ml-theme-primary);
}

.ml-notification-item-content {
  flex: 1;
  min-width: 0;
}

.ml-notification-item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.ml-notification-item-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ml-theme-text-heading);
  line-height: 1.4;
  flex: 1;
}

.ml-notification-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ml-notification-item-message {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--ml-theme-text-primary);
  line-height: 1.4;
  word-wrap: break-word;
}

.ml-notification-item-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.ml-notification-item-time {
  font-size: 12px;
  color: var(--ml-theme-text-secondary);
}

/* Dark theme adjustments */
.dark .ml-notification-item:hover {
  background-color: var(--ml-theme-bg-surface);
}
</style>
