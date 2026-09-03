<template>
  <div class="antd-properties-panel">
    <div v-if="!propertyRows.length" class="antd-properties-empty">
      <a-empty
        :description="t('shell.propertiesPanel.noSelection')"
        :image-style="{ height: '48px' }"
      />
    </div>
    <template v-else>
      <div class="antd-properties-header">
        <span class="antd-properties-type">{{ entityTypeLabel }}</span>
        <span v-if="selectionCount > 1" class="antd-properties-count">
          {{ t('shell.propertiesPanel.multipleEntities', { count: selectionCount }) }}
        </span>
      </div>
      <div
        v-for="group in propertyRows"
        :key="group.name"
        class="antd-properties-group"
      >
        <div class="antd-properties-group-title">{{ group.name }}</div>
        <div
          v-for="prop in group.properties"
          :key="`${group.name}.${prop.name}`"
          class="antd-properties-row"
        >
          <span class="antd-properties-label" :title="prop.name">
            {{ prop.name }}
          </span>
          <div class="antd-properties-control">
            <a-switch
              v-if="isEditable(prop) && prop.type === 'boolean'"
              size="small"
              :checked="Boolean(prop.valueRaw)"
              @change="(value: unknown) => write(prop, value)"
            />
            <a-select
              v-else-if="isEditable(prop) && prop.type === 'enum'"
              size="small"
              :value="prop.valueRaw"
              :options="enumOptions(prop)"
              @change="(value: unknown) => write(prop, value)"
            />
            <a-select
              v-else-if="isEditable(prop) && prop.type === 'lineweight'"
              size="small"
              :value="prop.valueRaw"
              :options="lineweightOptions"
              @change="(value: unknown) => write(prop, value)"
            />
            <a-input-number
              v-else-if="isEditable(prop) && (prop.type === 'int' || prop.type === 'float')"
              size="small"
              :value="numericValue(prop)"
              :precision="prop.type === 'int' ? 0 : 4"
              @change="(value: unknown) => write(prop, value)"
            />
            <a-input
              v-else-if="isEditable(prop) && prop.type === 'string'"
              size="small"
              :value="String(prop.valueRaw)"
              @change="(event: Event) => write(prop, (event.target as HTMLInputElement).value)"
            />
            <span v-else class="antd-properties-value" :title="prop.value">
              {{ prop.value }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  AcCmColor,
  AcCmTransparency,
  AcDbEntityProperties,
  AcDbEntityRuntimeProperty,
  AcGiLineWeight
} from '@mlightcad/data-model'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { entityPropEnum, entityPropName, useSelectionSet } from '@mlightcad/cad-viewer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { selectionSet } = useSelectionSet()

const selectionCount = computed(() => selectionSet.value.length)

/** Entity property trees of the current selection (model space only). */
const entityPropsList = computed<AcDbEntityProperties[]>(() => {
  const list: AcDbEntityProperties[] = []
  const db = AcApDocManager.instance.curDocument?.database
  if (!db) return list
  selectionSet.value.forEach(id => {
    const entity = db.tables.blockTable.modelSpace.getIdAt(id)
    if (entity) list.push(entity.properties)
  })
  return list
})

const entityTypeLabel = computed(() => {
  // Same lookup as the viewer's `entityName()` helper (`entity.entityName.*`).
  const type = entityPropsList.value[0]?.type
  if (!type) return ''
  return t('entity.entityName.' + type, type, { missingWarn: false })
})

const formatDisplayValue = (prop: AcDbEntityRuntimeProperty): string => {
  const value = prop.accessor.get()
  switch (prop.type) {
    case 'boolean':
      return value ? 'True' : 'False'
    case 'enum':
      return entityPropEnum(prop.options?.find(option => option.value === value)?.label ?? '')
    case 'color':
      return (value as AcCmColor).toString()
    case 'lineweight':
      return AcGiLineWeight[value as number] ?? String(value)
    case 'transparency':
      return (value as AcCmTransparency).toString()
    case 'array':
      return `${t('shell.propertiesPanel.arrayCount', { count: (value as unknown[]).length })}`
    default:
      return value != null ? String(value) : ''
  }
}

// ── inline editing ──────────────────────────────────────────────────

interface PropertyRowModel {
  name: string
  value: string
  valueRaw: unknown
  type: AcDbEntityRuntimeProperty['type']
  editable: boolean
  options?: { label: string; value: unknown }[]
  set?: (value: unknown) => void
}

/** Types the panel edits in place; the rest stay read-only for now. */
const EDITABLE_TYPES: ReadonlySet<AcDbEntityRuntimeProperty['type']> = new Set([
  'boolean',
  'enum',
  'int',
  'float',
  'string',
  'lineweight'
])

/** Incremented after a successful write so rows re-read live values. */
const refreshTick = ref(0)

const lineweightOptions = [
  { value: AcGiLineWeight.ByLayer, label: 'ByLayer' },
  { value: AcGiLineWeight.ByBlock, label: 'ByBlock' },
  ...(Object.values(AcGiLineWeight) as number[])
    .filter(value => typeof value === 'number' && value > 0 && value !== 0xffff)
    .sort((a, b) => a - b)
    .map(value => ({ value, label: `${(value / 100).toFixed(2)} mm` }))
]

function isEditable(prop: PropertyRowModel): boolean {
  return prop.editable && prop.set != null && EDITABLE_TYPES.has(prop.type)
}

function enumOptions(prop: PropertyRowModel) {
  return (prop.options ?? []).map(option => ({
    value: option.value,
    label: entityPropEnum(option.label)
  }))
}

function numericValue(prop: PropertyRowModel): number | undefined {
  return typeof prop.valueRaw === 'number' && Number.isFinite(prop.valueRaw)
    ? prop.valueRaw
    : undefined
}

function write(prop: PropertyRowModel, value: unknown) {
  if (!prop.set || value == null) return
  try {
    if (prop.type === 'int' || prop.type === 'float') {
      const numeric = typeof value === 'string' ? Number(value) : value
      if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return
      prop.set(numeric)
    } else {
      prop.set(value)
    }
    refreshTick.value++
  } catch (error) {
    console.warn(`[properties] failed to set "${prop.name}":`, error)
  }
}

const propertyRows = computed(() => {
  // Re-evaluate after every write so accessor.get() reads fresh values.
  void refreshTick.value
  const list = entityPropsList.value
  if (!list.length) return []
  // Show the first selected entity's full property tree.
  const entity = list[0]
  return entity.groups.map(group => ({
    name: entityPropName(group.groupName),
    properties: group.properties.map(
      prop =>
        ({
          name: prop.skipTranslation ? prop.name : entityPropName(prop.name),
          value: formatDisplayValue(prop),
          valueRaw: prop.accessor.get(),
          type: prop.type,
          editable: prop.editable !== false && prop.accessor.set != null,
          options: prop.options,
          set: prop.accessor.set?.bind(prop.accessor)
        }) satisfies PropertyRowModel
    )
  }))
})
</script>
