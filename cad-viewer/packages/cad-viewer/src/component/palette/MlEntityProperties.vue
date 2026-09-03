<template>
  <div class="ml-entity-properties">
    <!-- Dropdown for multiple entities -->
    <div
      v-if="entityPropsList && entityPropsList.length > 1"
      class="ml-entity-selector"
    >
      <a-select
        v-model:value="selectedIndex"
        placeholder="Select Entity"
        style="width: 100%; margin-bottom: 0.5rem"
      >
        <a-select-option
          :label="
            t(
              'main.toolPalette.entityProperties.propertyPanel.multipleEntitySelected',
              { count: entityPropsList.length }
            )
          "
          :value="-1"
        />
        <a-select-option
          v-for="(item, idx) in entityPropsList"
          :key="idx"
          :label="item.type"
          :value="idx"
        >
          {{ item.type }}
        </a-select-option>
      </a-select>
    </div>

    <!-- Properties Table -->
    <a-table
      v-if="tableRows.length"
      :columns="tableColumns"
      :data-source="tableRows"
      :row-key="(record: MlDisplayRow) => record.id"
      bordered
      default-expand-all
      :show-header="false"
      :pagination="false"
      :custom-row="customRowHandler"
      class="ml-entity-properties-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'name'">
          <div class="ml-cell-container">
            <div :class="['ml-cell-label', { 'ml-group-row': record.isGroup }]">
              <strong v-if="record.isGroup">{{ entityPropName(record.name) }}</strong>
              <span v-else>{{ getPropertyName(record as MlDisplayPropertyRow) }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'value'">
          <div class="ml-cell-value" v-if="!record.isGroup">
            <!-- ===== Readonly ===== -->
            <template
              v-if="!(record as MlDisplayPropertyRow).__isArrayIndex && (!editable || !(record as MlDisplayPropertyRow).editable)"
            >
              <ml-color-dropdown
                v-if="record.type === 'color'"
                :model-value="record.accessor.get()"
                disabled
              />
              <span
                v-else
                :title="formatDisplayValue(record as MlDisplayPropertyRow)"
                class="ml-readonly-value"
                @dblclick="copyReadonlyValue(record as MlDisplayPropertyRow)"
              >
                {{ formatDisplayValue(record as MlDisplayPropertyRow) }}
              </span>
            </template>

            <!-- ===== Editable ===== -->
            <template v-else>
              <ml-hatch-pattern-dropdown
                v-if="isHatchPatternField(record as MlDisplayPropertyRow)"
                :model-value="String((record as MlDisplayPropertyRow).accessor.get() ?? '')"
                @update:modelValue="
                  (v: string) => {
                    onPropertyChange(record as MlDisplayPropertyRow, v)
                  }
                "
              />

              <a-select
                v-else-if="record.type === 'enum'"
                :value="(record as MlDisplayPropertyRow).accessor.get()"
                @change="(v: string | number) => onPropertyChange(record as MlDisplayPropertyRow, v)"
              >
                <a-select-option
                  v-for="opt in (record as MlDisplayPropertyRow).options || []"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ entityPropEnum(opt.label) }}
                </a-select-option>
              </a-select>

              <ml-color-dropdown
                v-else-if="record.type === 'color'"
                :model-value="(record as MlDisplayPropertyRow).accessor.get() as AcCmColor | undefined"
                @color-change="(v: AcCmColor) => onPropertyChange(record as MlDisplayPropertyRow, v)"
              />

              <a-switch
                v-else-if="record.type === 'boolean'"
                :checked="(record as MlDisplayPropertyRow).accessor.get()"
                @change="(v: boolean) => onPropertyChange(record as MlDisplayPropertyRow, v)"
              />

              <a-input-number
                v-else-if="record.type === 'int'"
                :value="(record as MlDisplayPropertyRow).accessor.get()"
                :min="(record as MlDisplayPropertyRow).__min"
                :max="(record as MlDisplayPropertyRow).__max"
                :step="1"
                :precision="0"
                @change="
                  (v: number) => {
                    if ((record as MlDisplayPropertyRow).__isArrayIndex) {
                      (record as MlDisplayPropertyRow).accessor.set?.(v)
                    } else {
                      onPropertyChange(record as MlDisplayPropertyRow, v)
                    }
                  }
                "
              />

              <a-input-number
                v-else-if="record.type === 'float'"
                :value="(record as MlDisplayPropertyRow).accessor.get()"
                :step="0.1"
                :precision="3"
                @change="(v: number) => onPropertyChange(record as MlDisplayPropertyRow, v)"
              />

              <a-input
                v-else
                :value="(record as MlDisplayPropertyRow).accessor.get()"
                @update:value="(v: string) => onPropertyChange(record as MlDisplayPropertyRow, v)"
              />
            </template>
          </div>
        </template>
      </template>
    </a-table>

    <div v-else class="ml-no-entity-selected">
      {{
        t('main.toolPalette.entityProperties.propertyPanel.noEntitySelected')
      }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AcCmColor,
  AcCmTransparency,
  AcDbEntityProperties,
  AcDbEntityPropertyGroup,
  AcDbEntityRuntimeProperty,
  AcGiLineWeight,
  log
} from '@mlightcad/data-model'
import { message } from 'ant-design-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { entityPropEnum, entityPropName } from '../../locale'
import MlColorDropdown from '../common/MlColorDropdown.vue'
import MlHatchPatternDropdown from '../common/MlHatchPatternDropdown.vue'

const { t } = useI18n()

/* ================= props / emits ================= */

const props = defineProps<{
  entityPropsList?: AcDbEntityProperties[] | null
  editable?: boolean
}>()

const emit = defineEmits<{
  (
    e: 'update-property',
    payload: {
      groupName: string
      propertyName: string
      newValue: unknown
    }
  ): void
}>()

/* ================= state ================= */

const selectedIndex = ref(-1)
const arrayIndexMap = ref<Record<string, number>>({})

/**
 * Forces rebuild of array property rows
 */
const arrayRebuildVersion = ref(0)

const activeEntityProperties = computed<AcDbEntityProperties | null>(() => {
  const list = props.entityPropsList
  if (!list?.length) return null

  return list.length === 1
    ? list[0]
    : selectedIndex.value >= 0
      ? list[selectedIndex.value]
      : findCommonProperties(list)
})

/* ================= row types ================= */

interface MlDisplayRowBase {
  id: string
  name: string
  isGroup: boolean
}

type MlDisplayPropertyRow = MlDisplayRowBase &
  AcDbEntityRuntimeProperty & {
    __groupName?: string
    __min?: number
    __max?: number
    __isArrayIndex?: boolean
  }

type MlDisplayGroupRow = MlDisplayRowBase & {
  isGroup: true
  children: MlDisplayPropertyRow[]
}

type MlDisplayRow = MlDisplayGroupRow | MlDisplayPropertyRow

/* ================= helpers ================= */

function isArrayProperty(p: AcDbEntityRuntimeProperty): boolean {
  return p.type === 'array' && !!p.itemSchema
}

function arrayKey(group: string, prop: string) {
  return `${group}.${prop}`
}

/* ================= table columns ================= */

const tableColumns = [
  {
    dataIndex: 'name',
    key: 'name'
  },
  {
    dataIndex: 'value',
    key: 'value'
  }
]

/* ================= formatting ================= */

function getPropertyName(row: MlDisplayPropertyRow): string {
  return row.skipTranslation ? row.name : entityPropName(row.name)
}

function formatDisplayValue(row: MlDisplayPropertyRow): string {
  const v = row.accessor.get()
  switch (row.type) {
    case 'boolean':
      return v ? 'True' : 'False'
    case 'enum':
      return entityPropEnum(row.options?.find(o => o.value === v)?.label ?? '')
    case 'color':
      return (v as AcCmColor).toString()
    case 'lineweight':
      return AcGiLineWeight[v as number]
    case 'transparency':
      return (v as AcCmTransparency).toString()
    default:
      return v != null ? String(v) : ''
  }
}

async function copyReadonlyValue(row: MlDisplayPropertyRow) {
  const value = formatDisplayValue(row)

  try {
    await navigator.clipboard.writeText(value)
    message.success(
      t(
        'main.toolPalette.entityProperties.propertyPanel.propValCopied'
      )
    )
  } catch (e) {
    log.error(e)
    message.error(
      t(
        'main.toolPalette.entityProperties.propertyPanel.failedToCopyPropVal'
      )
    )
  }
}

/* ================= rows ================= */

const tableRows = computed<MlDisplayRow[]>(() => {
  // dependency to force rebuild when array index changes
  arrayRebuildVersion.value

  const entity = activeEntityProperties.value
  if (!entity) return []
  return expandEntity(entity)
})

function isHatchPatternField(row: MlDisplayPropertyRow) {
  if (row.__isArrayIndex) return false
  if (activeEntityProperties.value?.type.toLowerCase() !== 'hatch') return false
  const propertyName = row.name.toLowerCase()
  return propertyName === 'patternname' || propertyName === 'pattern'
}

function expandEntity(entity: AcDbEntityProperties): MlDisplayRow[] {
  return entity.groups.map((group, gi) => {
    const children: MlDisplayPropertyRow[] = []

    group.properties.forEach((prop, pi) => {
      if (!isArrayProperty(prop)) {
        children.push({
          ...prop,
          id: `g-${gi}-p-${pi}`,
          isGroup: false,
          __groupName: group.groupName
        })
        return
      }

      const arr = prop.accessor.get() as unknown[]
      const key = arrayKey(group.groupName, prop.name)

      if (!arrayIndexMap.value[key]) arrayIndexMap.value[key] = 1

      arrayIndexMap.value[key] = Math.min(
        Math.max(1, arrayIndexMap.value[key]),
        arr.length
      )

      /* ===== index row (always editable) ===== */
      children.push({
        id: `g-${gi}-p-${pi}-index`,
        name: prop.name,
        type: 'int',
        editable: true,
        isGroup: false,
        __groupName: group.groupName,
        __isArrayIndex: true,
        __min: 1,
        __max: arr.length,
        accessor: {
          get: () => arrayIndexMap.value[key],
          set: (v: number) => {
            const newIndex = Math.min(Math.max(1, v), arr.length)
            if (arrayIndexMap.value[key] !== newIndex) {
              arrayIndexMap.value[key] = newIndex
              arrayRebuildVersion.value++ // force rebuild
            }
          }
        }
      } as MlDisplayPropertyRow)

      const element = arr[arrayIndexMap.value[key] - 1] as Record<
        string,
        unknown
      >
      if (!element) return

      /* ===== element property rows ===== */
      if (prop.itemSchema) {
        for (const itemProp of prop.itemSchema.properties) {
          children.push({
            id: `g-${gi}-p-${pi}-${itemProp.name}`,
            name: itemProp.name,
            type: itemProp.type,
            editable: itemProp.editable,
            isGroup: false,
            __groupName: group.groupName,
            accessor: {
              get: () => element[itemProp.name],
              set: (v: unknown) => {
                element[itemProp.name] = v
              }
            }
          })
        }
      }
    })

    return {
      id: `group-${gi}`,
      name: group.groupName,
      isGroup: true,
      children
    }
  })
}

/* ================= common props ================= */

function findCommonProperties(
  list: AcDbEntityProperties[]
): AcDbEntityProperties {
  const first = list[0]
  const groups: AcDbEntityPropertyGroup[] = []

  for (const g of first.groups) {
    const props: AcDbEntityRuntimeProperty[] = []

    for (const p of g.properties) {
      if (
        list.every(ent => {
          const gp = ent.groups
            .find(x => x.groupName === g.groupName)
            ?.properties.find(x => x.name === p.name)
          return gp && gp.accessor.get() === p.accessor.get()
        })
      ) {
        props.push(p)
      }
    }

    if (props.length) groups.push({ groupName: g.groupName, properties: props })
  }

  return { type: first.type, groups }
}

/**
 * customRow handler for span method (group rows span both columns)
 */
const customRowHandler = (record: MlDisplayRow) => {
  if (record.isGroup) {
    return {
      style: { textAlign: 'left' as const }
    }
  }
  return {}
}

/**
 * Handle property change (direct call to accessor.set)
 */
function onPropertyChange(row: MlDisplayPropertyRow, newValue: unknown) {
  if (row.__isArrayIndex) return

  emit('update-property', {
    groupName: row.__groupName ?? '',
    propertyName: row.name,
    newValue
  })
}
</script>

<style scoped>
:deep(.ant-table-cell) {
  display: flex;
}

:deep(.ml-cell-value > *) {
  width: 100%;
}

.ml-entity-properties {
  padding: 5px;
}

.ml-entity-properties-table {
  width: 100%;
}

.ml-cell-container {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  line-height: 1;
}

.ml-cell-label {
  font-weight: normal;
  width: 100%;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ml-group-row {
  font-weight: 600;
}

.ml-cell-value {
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ml-readonly-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ml-no-entity-selected {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-style: italic;
  font-size: 0.875rem;
  padding: 0.5rem;
}
</style>
