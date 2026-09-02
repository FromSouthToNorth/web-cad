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
          <span class="antd-properties-value" :title="prop.value">
            {{ prop.value }}
          </span>
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
import { computed } from 'vue'
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

const propertyRows = computed(() => {
  const list = entityPropsList.value
  if (!list.length) return []
  // Read-only panel: show the first selected entity's full property tree.
  const entity = list[0]
  return entity.groups.map(group => ({
    name: entityPropName(group.groupName),
    properties: group.properties.map(prop => ({
      name: prop.skipTranslation ? prop.name : entityPropName(prop.name),
      value: formatDisplayValue(prop)
    }))
  }))
})
</script>
