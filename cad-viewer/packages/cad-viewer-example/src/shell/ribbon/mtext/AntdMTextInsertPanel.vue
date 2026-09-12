<template>
  <div
    class="antd-mtext-insert"
    :class="{ 'is-disabled': !state.active }"
    role="group"
    :aria-label="t('main.ribbon.mtext.group.insert')"
  >
    <a-dropdown
      :trigger="['click']"
      :disabled="!state.active"
      placement="bottomLeft"
    >
      <button
        type="button"
        class="antd-mtext-dropdown-trigger antd-mtext-dropdown-trigger--large"
        :disabled="!state.active"
        :aria-label="t('main.ribbon.mtext.tooltip.symbol')"
        :title="t('main.ribbon.mtext.tooltip.symbol')"
      >
        <component :is="mtextIcons.symbol" />
        <span class="antd-mtext-dropdown-label">
          {{ t('main.ribbon.mtext.command.symbol') }}
        </span>
        <span class="antd-mtext-dropdown-arrow" aria-hidden="true">
          <DownOutlined />
        </span>
      </button>
      <template #overlay>
        <div class="antd-mtext-menu antd-mtext-menu--symbols">
          <button
            v-for="option in symbolOptions"
            :key="option.id"
            type="button"
            class="antd-mtext-menu-item"
            @click="insertText(option.payload)"
          >
            {{ option.label }}
          </button>
        </div>
      </template>
    </a-dropdown>
  </div>
</template>

<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { mtextIcons } from './mtextRibbonIcons'
import { useMTextRibbon } from './useMTextRibbon'

const { t } = useI18n()

const { state, insertText } = useMTextRibbon()

/**
 * Engineering symbols inserted at the caret.
 *
 * `%%d` / `%%p` / `%%c` are AutoCAD control codes the editor expands itself;
 * `\U+hhhh` escapes are decoded by {@link insertText} before insertion. Each
 * label is a static message key because vue-i18n's `no-dynamic-keys` rule
 * forbids composing keys at runtime.
 */
const symbolOptions = computed(() => [
  { id: 'degree', label: t('main.ribbon.mtext.symbol.degree'), payload: '%%d' },
  {
    id: 'plusMinus',
    label: t('main.ribbon.mtext.symbol.plusMinus'),
    payload: '%%p'
  },
  {
    id: 'diameter',
    label: t('main.ribbon.mtext.symbol.diameter'),
    payload: '%%c'
  },
  {
    id: 'almostEqual',
    label: t('main.ribbon.mtext.symbol.almostEqual'),
    payload: '\\U+2248'
  },
  {
    id: 'angle',
    label: t('main.ribbon.mtext.symbol.angle'),
    payload: '\\U+2220'
  },
  {
    id: 'boundary',
    label: t('main.ribbon.mtext.symbol.boundary'),
    payload: '\\U+E100'
  },
  {
    id: 'centerLine',
    label: t('main.ribbon.mtext.symbol.centerLine'),
    payload: '\\U+2104'
  },
  {
    id: 'delta',
    label: t('main.ribbon.mtext.symbol.delta'),
    payload: '\\U+0394'
  },
  {
    id: 'electricalPhase',
    label: t('main.ribbon.mtext.symbol.electricalPhase'),
    payload: '\\U+0278'
  },
  {
    id: 'flowLine',
    label: t('main.ribbon.mtext.symbol.flowLine'),
    payload: '\\U+E101'
  },
  {
    id: 'identical',
    label: t('main.ribbon.mtext.symbol.identical'),
    payload: '\\U+2261'
  },
  {
    id: 'notEqual',
    label: t('main.ribbon.mtext.symbol.notEqual'),
    payload: '\\U+2260'
  },
  { id: 'ohm', label: t('main.ribbon.mtext.symbol.ohm'), payload: '\\U+2126' },
  {
    id: 'omega',
    label: t('main.ribbon.mtext.symbol.omega'),
    payload: '\\U+03A9'
  },
  {
    id: 'propertyLine',
    label: t('main.ribbon.mtext.symbol.propertyLine'),
    payload: '\\U+214A'
  },
  {
    id: 'subscriptTwo',
    label: t('main.ribbon.mtext.symbol.subscriptTwo'),
    payload: '\\U+2082'
  },
  {
    id: 'squared',
    label: t('main.ribbon.mtext.symbol.squared'),
    payload: '\\U+00B2'
  },
  {
    id: 'cubed',
    label: t('main.ribbon.mtext.symbol.cubed'),
    payload: '\\U+00B3'
  },
  { id: 'nbsp', label: t('main.ribbon.mtext.symbol.nbsp'), payload: '\\~' }
])
</script>
