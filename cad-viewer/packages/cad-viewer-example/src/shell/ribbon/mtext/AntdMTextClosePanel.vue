<template>
  <div
    class="antd-mtext-close"
    role="group"
    :aria-label="t('main.ribbon.mtext.group.close')"
  >
    <button
      type="button"
      class="antd-mtext-dropdown-trigger antd-mtext-dropdown-trigger--large"
      :aria-label="t('main.ribbon.mtext.tooltip.close')"
      :title="t('main.ribbon.mtext.tooltip.close')"
      @click="closeEditor()"
    >
      <CloseCircleOutlined />
      <span class="antd-mtext-dropdown-label">
        {{ t('main.ribbon.mtext.command.close') }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { CloseCircleOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

import { useMTextRibbon } from './useMTextRibbon'

const { t } = useI18n()

const { closeEditor } = useMTextRibbon()
</script>
