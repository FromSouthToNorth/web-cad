<template>
  <div class="ml-missing-resources">
    <div class="ml-missing-resources__tab-list" role="tablist">
      <button
        v-for="tab in subTabs"
        :key="tab.name"
        type="button"
        role="tab"
        class="ml-missing-resources__tab"
        :class="{
          'is-active': store.dialogs.activeMissingResourceTab === tab.name
        }"
        :aria-selected="store.dialogs.activeMissingResourceTab === tab.name"
        @click="selectSubTab(tab.name)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="ml-missing-resources__body">
      <div
        v-if="store.dialogs.activeMissingResourceTab === 'font'"
        class="ml-missing-resources__panel"
      >
        <a-checkbox
          v-if="fontRows.length > 0"
          v-model:checked="matchFontType"
          class="ml-missing-resources__option"
        >
          {{ t('main.toolPalette.missingResources.matchFontType') }}
        </a-checkbox>
        <a-table
          :data-source="fontRows"
          :columns="fontTableColumns"
          :pagination="false"
          class="ml-missing-resources__table"
          :locale="{ emptyText: t('main.toolPalette.missingResources.emptyFonts') }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'mappedFont'">
              <div class="ml-missing-resources__cell-actions">
                <a-select
                  :value="record.mappedFont"
                  :placeholder="
                    t('main.toolPalette.missingResources.selectFont')
                  "
                  @change="
                    (value: string) => updateMappedFont(record.missedFont, value)
                  "
                >
                  <a-select-option
                    v-for="replacement in getReplacementFontsFor(
                      record.missedFont
                    )"
                    :key="replacement"
                    :value="replacement"
                  >
                    {{ replacement }}
                  </a-select-option>
                </a-select>
                <a-button
                  type="link"
                  size="small"
                  :title="
                    t('main.toolPalette.missingResources.selectLocalFont')
                  "
                  @click="handleSelectLocalFont(record.missedFont)"
                >
                  ...
                </a-button>
              </div>
            </template>
          </template>
        </a-table>
      </div>

      <div
        v-else-if="store.dialogs.activeMissingResourceTab === 'xref'"
        class="ml-missing-resources__panel"
      >
        <ml-external-references />
      </div>
    </div>

    <div v-if="showApplyBar" class="ml-missing-resources__footer">
      <a-button
        type="primary"
        size="small"
        :disabled="!canApply"
        :loading="applying"
        @click="handleApply"
      >
        {{ t('main.toolPalette.missingResources.apply') }}
      </a-button>
    </div>

    <input
      ref="fontFileInput"
      type="file"
      accept=".shx,.ttf,.otf,.woff"
      style="display: none"
      @change="handleFontFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import {
  AcApCacheFontCmd,
  AcApDocManager,
  type AcApFontInfo,
  AcApFontUtil,
  AcApSettingManager,
  eventBus} from '@mlightcad/cad-simple-viewer'
import type { MlOverflowTab } from '@mlightcad/ui-components'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { store } from '../../app'
import {
  type MissingResourceTab,
  useMissedData
} from '../../composable'
import MlExternalReferences from './MlExternalReferences.vue'

const { t } = useI18n()
const { fonts: fontMapping, images: imageTableData, xrefs } = useMissedData()

const fontFileInput = ref<HTMLInputElement | null>(null)
const availableFontInfos = ref<AcApFontInfo[]>([])
const matchFontType = ref(true)
const applying = ref(false)
const pendingFontMissed = ref<string | null>(null)

interface LocalCachedFont {
  name: string
  type: 'shx' | 'mesh'
}

const localCachedFonts = ref<LocalCachedFont[]>([])

const fontRows = computed(() => {
  return Array.from(fontMapping.entries()).map(([missedFont, mappedFont]) => ({
    missedFont,
    mappedFont
  }))
})

const fontTableColumns = [
  { title: t('main.toolPalette.missingResources.missedFont'), dataIndex: 'missedFont', width: 100, ellipsis: true },
  { title: t('main.toolPalette.missingResources.replacedFont'), dataIndex: 'mappedFont', width: 140 }
]

const subTabs = computed<MlOverflowTab[]>(() => {
  return [
    {
      name: 'font',
      label: t('main.toolPalette.missingResources.fontTab')
    },
    {
      name: 'xref',
      label: t('main.toolPalette.missingResources.xrefTab')
    }
  ]
})

const selectSubTab = (name: string) => {
  store.dialogs.activeMissingResourceTab = name as MissingResourceTab
}
const showApplyBar = computed(() => {
  return store.dialogs.activeMissingResourceTab === 'font'
})

const canApply = computed(() => {
  for (const [missed, mapped] of fontMapping) {
    if (missed.trim() && mapped.trim()) return true
  }
  return false
})

const refreshAvailableFonts = () => {
  availableFontInfos.value = AcApDocManager.instance.avaiableFonts
}

onMounted(() => {
  refreshAvailableFonts()
})

watch(
  () => store.dialogs.activeMissingResourceTab,
  tab => {
    if (tab === 'font') refreshAvailableFonts()
  }
)

watch(
  [() => fontMapping.size, () => imageTableData.size, () => xrefs.length],
  () => {
    const tab = store.dialogs.activeMissingResourceTab as MissingResourceTab
    const hasXrefs = imageTableData.size > 0 || xrefs.length > 0
    const valid =
      (tab === 'font' && fontMapping.size > 0) ||
      (tab === 'xref' && hasXrefs) ||
      (fontMapping.size === 0 && !hasXrefs)
    if (valid) return
    if (fontMapping.size > 0) {
      store.dialogs.activeMissingResourceTab = 'font'
    } else if (hasXrefs) {
      store.dialogs.activeMissingResourceTab = 'xref'
    }
  }
)

watch(matchFontType, enabled => {
  if (!enabled) return
  fontMapping.forEach((mappedFont, missedFont) => {
    if (!mappedFont) return
    const options = getReplacementFontsFor(missedFont)
    if (!options.includes(mappedFont)) {
      fontMapping.set(missedFont, '')
    }
  })
})

const getMissedFontType = (missedFont: string): 'shx' | 'mesh' | undefined => {
  return (
    AcApFontUtil.getCatalogFontType(missedFont) ??
    AcApFontUtil.getFontType(missedFont)
  )
}

const addLocalCachedFont = (fontName: string) => {
  const type = AcApFontUtil.getFontType(fontName)
  if (!type) return
  if (localCachedFonts.value.some(font => font.name === fontName)) return
  localCachedFonts.value.push({ name: fontName, type })
}

const getReplacementFontsFor = (missedFont: string): string[] => {
  const remoteFonts = availableFontInfos.value
  let remoteNames: string[]
  if (!matchFontType.value) {
    remoteNames = remoteFonts.map(font => font.name[0])
  } else {
    const targetType = getMissedFontType(missedFont)
    remoteNames = targetType
      ? remoteFonts
          .filter(font => font.type === targetType)
          .map(font => font.name[0])
      : remoteFonts.map(font => font.name[0])
  }

  const localNames = localCachedFonts.value
    .filter(font => {
      if (!matchFontType.value) return true
      const targetType = getMissedFontType(missedFont)
      return !targetType || font.type === targetType
    })
    .map(font => font.name)

  return [...new Set([...localNames, ...remoteNames])]
}

const updateMappedFont = (missedFont: string, mappedFont: string) => {
  fontMapping.set(missedFont, mappedFont)
}

const handleSelectLocalFont = (missedFont: string) => {
  pendingFontMissed.value = missedFont
  fontFileInput.value?.click()
}

const handleFontFileChange = async () => {
  const file = fontFileInput.value?.files?.[0]
  const missedFont = pendingFontMissed.value
  pendingFontMissed.value = null

  if (!file || !missedFont) {
    if (fontFileInput.value) {
      fontFileInput.value.value = ''
    }
    return
  }

  try {
    const status = await AcApCacheFontCmd.cacheFontFile(file, {
      aliases: [missedFont],
      notify: false
    })
    if (status.status === 'Success') {
      addLocalCachedFont(status.fontName)
      fontMapping.set(missedFont, status.fontName)
    } else {
      eventBus.emit('message', {
        message: t('main.message.fontCacheFailed', { fileName: file.name }),
        type: 'error'
      })
    }
  } catch {
    eventBus.emit('message', {
      message: t('main.message.fontCacheFailed', { fileName: file.name }),
      type: 'error'
    })
  }

  if (fontFileInput.value) {
    fontFileInput.value.value = ''
  }
}

const handleApply = async () => {
  applying.value = true
  try {
    const docManager = AcApDocManager.instance
    const settingManager = AcApSettingManager.instance
    const nextFontMapping = { ...settingManager.fontMapping }
    const fontsToLoad = new Set<string>()
    let replacedFont = false

    fontMapping.forEach((mappedFont, missedFont) => {
      const originalFont = missedFont.trim()
      const replacementFont = mappedFont.trim()
      if (originalFont && replacementFont) {
        nextFontMapping[originalFont] = replacementFont
        fontsToLoad.add(replacementFont)
        replacedFont = true
      }
    })

    if (!replacedFont) return

    settingManager.fontMapping = nextFontMapping
    docManager.curView.renderer.setFontMapping(nextFontMapping)
    try {
      await docManager.loadFonts([...fontsToLoad])
    } catch {
      // Font loader emits detailed failure notifications; still regenerate.
    }
    docManager.regen()
    await nextTick()

    eventBus.emit('missed-data-changed', {})
    eventBus.emit('message', {
      message: t('main.toolPalette.missingResources.applyDone'),
      type: 'success'
    })
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.ml-missing-resources {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 8px;
  font-size: 12px;
  color: var(--ml-theme-text-primary);
}

.ml-missing-resources__tab-list {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  min-width: 0;
  border-bottom: 1px solid var(--ml-theme-border);
}

.ml-missing-resources__tab {
  flex: 0 0 auto;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ml-theme-text-secondary);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.ml-missing-resources__tab:hover {
  color: var(--ml-theme-text-heading);
  background: var(--ml-theme-bg-hover);
}

.ml-missing-resources__tab.is-active {
  color: var(--ml-theme-text-heading);
  border-bottom-color: var(--ml-theme-primary);
}

.ml-missing-resources__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ml-missing-resources__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ml-missing-resources__option {
  margin: 0;
  flex: 0 0 auto;
  padding: 0 8px;
  align-items: flex-start;
  height: auto;
  white-space: normal;
}

.ml-missing-resources__option :deep(.ant-checkbox__label) {
  white-space: normal;
  line-height: 1.4;
  word-break: break-word;
}

.ml-missing-resources__table {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.ml-missing-resources__table :deep(.ant-table__empty-text) {
  font-size: 12px;
  line-height: 1.4;
  color: var(--ml-theme-text-secondary);
  white-space: normal;
  padding: 0 8px;
}

.ml-missing-resources__cell-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ml-missing-resources__cell-actions :deep(.ant-select) {
  flex: 1;
  min-width: 0;
}

.ml-missing-resources__footer {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding: 0 8px 8px;
  border-top: 1px solid var(--ml-theme-border);
}
</style>
