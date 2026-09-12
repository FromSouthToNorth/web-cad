<template>
  <div
    class="antd-mtext-paragraph"
    :class="{ 'is-disabled': !state.active }"
    role="group"
    :aria-label="t('main.ribbon.mtext.group.paragraph')"
  >
    <div class="antd-mtext-field">
      <span class="antd-mtext-field-label">
        {{ t('main.ribbon.mtext.command.attachment') }}
      </span>
      <a-dropdown
        :trigger="['click']"
        :disabled="!state.active"
        placement="bottomLeft"
      >
        <button
          type="button"
          class="antd-mtext-dropdown-trigger"
          :disabled="!state.active"
          :aria-label="t('main.ribbon.mtext.tooltip.attachment')"
          :title="t('main.ribbon.mtext.tooltip.attachment')"
        >
          <component :is="mtextIcons.align" />
          <span class="antd-mtext-dropdown-label">
            {{ activeAttachmentLabel }}
          </span>
          <span class="antd-mtext-dropdown-arrow" aria-hidden="true">
            <DownOutlined />
          </span>
        </button>
        <template #overlay>
          <div class="antd-mtext-menu">
            <button
              v-for="option in attachmentOptions"
              :key="option.value"
              type="button"
              class="antd-mtext-menu-item"
              :class="{
                'is-active': option.value === state.format.attachmentPoint
              }"
              @click="setAttachment(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
      </a-dropdown>
    </div>

    <div class="antd-mtext-field">
      <span class="antd-mtext-field-label">
        {{ t('main.ribbon.mtext.command.list') }}
      </span>
      <a-dropdown
        :trigger="['click']"
        :disabled="!state.active"
        placement="bottomLeft"
      >
        <button
          type="button"
          class="antd-mtext-dropdown-trigger antd-mtext-dropdown-trigger--icon"
          :disabled="!state.active"
          :aria-label="t('main.ribbon.mtext.tooltip.list')"
          :title="t('main.ribbon.mtext.tooltip.list')"
        >
          <component :is="mtextIcons.bullets" />
          <span class="antd-mtext-dropdown-arrow" aria-hidden="true">
            <DownOutlined />
          </span>
        </button>
        <template #overlay>
          <div class="antd-mtext-menu">
            <button
              v-for="option in listOptions"
              :key="option.id"
              type="button"
              class="antd-mtext-menu-item"
              @click="insertText(option.text)"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
      </a-dropdown>
    </div>

    <div class="antd-mtext-field">
      <span class="antd-mtext-field-label">
        {{ t('main.ribbon.mtext.command.lineSpacing') }}
      </span>
      <a-dropdown
        :trigger="['click']"
        :disabled="!state.active"
        placement="bottomLeft"
      >
        <button
          type="button"
          class="antd-mtext-dropdown-trigger antd-mtext-dropdown-trigger--icon"
          :disabled="!state.active"
          :aria-label="t('main.ribbon.mtext.tooltip.lineSpacing')"
          :title="t('main.ribbon.mtext.tooltip.lineSpacing')"
        >
          <component :is="mtextIcons.lineSpacing" />
          <span class="antd-mtext-dropdown-arrow" aria-hidden="true">
            <DownOutlined />
          </span>
        </button>
        <template #overlay>
          <div class="antd-mtext-menu">
            <button
              v-for="option in lineSpacingOptions"
              :key="option.id"
              type="button"
              class="antd-mtext-menu-item"
              :class="{ 'is-active': option.isActive }"
              @click="option.run()"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
      </a-dropdown>
    </div>

    <div class="antd-mtext-field">
      <span class="antd-mtext-field-label">
        {{ t('main.ribbon.mtext.command.paragraphAlignment') }}
      </span>
      <div
        class="antd-mtext-align-group"
        role="group"
        :aria-label="t('main.ribbon.mtext.command.paragraphAlignment')"
      >
        <button
          v-for="option in paragraphAlignOptions"
          :key="option.id"
          type="button"
          class="antd-mtext-toggle"
          :class="{ 'is-active': option.id === activeParagraphAlign }"
          :disabled="!state.active"
          :aria-pressed="option.id === activeParagraphAlign"
          :title="option.label"
          :aria-label="option.label"
          @click="setParagraphAlignment(option.id)"
        >
          <component :is="option.icon" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { mtextIcons } from './mtextRibbonIcons'
import {
  MTEXT_ATTACHMENT_CODES,
  type MTextParagraphAlignmentId,
  mtextParagraphAlignToSlug
} from './mtextRibbonTypes'
import { useMTextRibbon } from './useMTextRibbon'

const { t } = useI18n()

const {
  state,
  setAttachment,
  setParagraphAlignment,
  setLineSpacing,
  clearLineSpacing,
  insertText
} = useMTextRibbon()

/**
 * Attachment choices.
 *
 * The labels are spelled out one by one on purpose: vue-i18n's
 * `no-dynamic-keys` rule forbids building message keys from a variable.
 */
const attachmentOptions = computed(() =>
  MTEXT_ATTACHMENT_CODES.map(code => ({
    value: code as string,
    label: attachmentLabel(code)
  }))
)

/**
 * Localised attachment label for one code.
 *
 * @param code - Attachment code from {@link MTEXT_ATTACHMENT_CODES}.
 * @returns Localised nine-point attachment label.
 */
function attachmentLabel(code: string): string {
  switch (code) {
    case 'TL':
      return t('main.ribbon.mtext.attachment.TL')
    case 'TC':
      return t('main.ribbon.mtext.attachment.TC')
    case 'TR':
      return t('main.ribbon.mtext.attachment.TR')
    case 'ML':
      return t('main.ribbon.mtext.attachment.ML')
    case 'MC':
      return t('main.ribbon.mtext.attachment.MC')
    case 'MR':
      return t('main.ribbon.mtext.attachment.MR')
    case 'BL':
      return t('main.ribbon.mtext.attachment.BL')
    case 'BC':
      return t('main.ribbon.mtext.attachment.BC')
    default:
      return t('main.ribbon.mtext.attachment.BR')
  }
}

const activeAttachmentLabel = computed(() =>
  attachmentLabel(state.format.attachmentPoint)
)

/**
 * Bullet / numbering starters.
 *
 * Only the three markers the inline editor can actually produce are offered:
 * AutoCAD's automatic list modes need numbering state the editor does not
 * track, and shipping menu entries that do nothing would be worse than
 * omitting them.
 */
const listOptions = computed(() => [
  { id: 'number', label: t('main.ribbon.mtext.list.number'), text: '1. ' },
  { id: 'letter', label: t('main.ribbon.mtext.list.letter'), text: 'a. ' },
  { id: 'bullet', label: t('main.ribbon.mtext.list.bullet'), text: '\u2022 ' }
])

/** Line spacing multiples plus the "clear" reset. */
const lineSpacingOptions = computed(() => [
  {
    id: '1',
    label: '1.0x',
    isActive: state.lineSpacing === 1,
    run: () => setLineSpacing(1)
  },
  {
    id: '1.5',
    label: '1.5x',
    isActive: state.lineSpacing === 1.5,
    run: () => setLineSpacing(1.5)
  },
  {
    id: '2',
    label: '2.0x',
    isActive: state.lineSpacing === 2,
    run: () => setLineSpacing(2)
  },
  {
    id: '2.5',
    label: '2.5x',
    isActive: state.lineSpacing === 2.5,
    run: () => setLineSpacing(2.5)
  },
  {
    id: 'clear',
    label: t('main.ribbon.mtext.lineSpacing.clear'),
    isActive: false,
    run: () => clearLineSpacing()
  }
])

/** Paragraph alignment id currently reported by the editor. */
const activeParagraphAlign = computed<MTextParagraphAlignmentId>(() =>
  mtextParagraphAlignToSlug(state.format.paragraphAlignment)
)

/** Paragraph horizontal alignment choices. */
const paragraphAlignOptions = computed<
  Array<{ id: MTextParagraphAlignmentId; label: string; icon: unknown }>
>(() => [
  {
    id: 'default',
    label: t('main.ribbon.mtext.paragraphAlign.default'),
    icon: mtextIcons.paragraphDefault
  },
  {
    id: 'left',
    label: t('main.ribbon.mtext.paragraphAlign.left'),
    icon: mtextIcons.left
  },
  {
    id: 'center',
    label: t('main.ribbon.mtext.paragraphAlign.center'),
    icon: mtextIcons.center
  },
  {
    id: 'right',
    label: t('main.ribbon.mtext.paragraphAlign.right'),
    icon: mtextIcons.right
  },
  {
    id: 'justified',
    label: t('main.ribbon.mtext.paragraphAlign.justified'),
    icon: mtextIcons.justify
  },
  {
    id: 'distributed',
    label: t('main.ribbon.mtext.paragraphAlign.distributed'),
    icon: mtextIcons.distributed
  }
])
</script>
