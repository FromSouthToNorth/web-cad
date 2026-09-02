<template>
  <a-card v-if="visible" ref="cardRef" class="ml-entity-info">
    <a-row class="ml-entity-info-text">
      <a-col :span="24">
        <span class="ml-entity-info-title">
          {{ info.type }}
        </span>
      </a-col>
    </a-row>
    <a-row class="ml-entity-info-text">
      <a-col :span="10">
        <span>{{ t('main.entityInfo.color') }}</span>
      </a-col>
      <a-col :span="14">
        <span>{{ info.color }}</span>
      </a-col>
    </a-row>
    <a-row class="ml-entity-info-text">
      <a-col :span="10">
        <span>{{ t('main.entityInfo.layer') }}</span>
      </a-col>
      <a-col :span="14">
        <span>{{ info.layer }}</span>
      </a-col>
    </a-row>
    <a-row class="ml-entity-info-text">
      <a-col :span="10">
        <span>{{ t('main.entityInfo.lineType') }}</span>
      </a-col>
      <a-col :span="14">
        <span>{{ info.lineType }}</span>
      </a-col>
    </a-row>
  </a-card>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbEntity } from '@mlightcad/data-model'
import { ComponentPublicInstance, computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHover, useSettings } from '../../composable'
import { colorName, entityName } from '../../locale'

const { t } = useI18n()
const cardRef = ref<ComponentPublicInstance<{}, HTMLElement> | null>(null)
const { hovered, entity, mouse } = useHover()
const features = useSettings()

const cardWidth = ref(180)
const cardHeight = ref(120)
const margin = 8

const left = computed(
  () =>
    `${Math.min(Math.max(mouse.value.x, margin), window.innerWidth - cardWidth.value - margin)}px`
)
const top = computed(
  () =>
    `${Math.min(Math.max(mouse.value.y, margin), window.innerHeight - cardHeight.value - margin)}px`
)

const info = computed(() => {
  const ent = entity.value as unknown as AcDbEntity | null
  if (!ent) return { type: '', color: '', layer: '', lineType: '' }

  return {
    type: entityName(ent),
    color: colorName(ent.color.toString()),
    layer: ent.layer,
    lineType: ent.lineType
  }
})

const visible = computed(
  () =>
    hovered.value &&
    info.value.type !== '' &&
    features.isShowEntityInfo &&
    !AcApDocManager.instance.editor.isActive
)

watch(visible, async val => {
  if (val) {
    await nextTick()
    const el = cardRef.value?.$el as HTMLElement | undefined
    if (el) {
      cardWidth.value = el.offsetWidth
      cardHeight.value = el.offsetHeight
    }
  }
})
</script>

<style scoped>
.ml-entity-info {
  position: fixed;
  left: v-bind(left);
  top: v-bind(top);
  z-index: 99999;
  width: 180px;
  margin: 0;
  transition: none !important;
}
.ml-entity-info-title {
  font-weight: bold;
}
.ml-entity-info-text {
  margin-bottom: 6px;
  margin-top: 6px;
}
</style>
