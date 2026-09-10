<template>
  <Transition name="antd-entity-hover">
    <div
      v-if="hovered && entity"
      class="antd-entity-hover-tip"
      :style="positionStyle"
      role="tooltip"
      aria-live="polite"
    >
      <div class="antd-entity-hover-title">
        <span
          class="antd-entity-hover-swatch"
          :style="swatchStyle"
          aria-hidden="true"
        ></span>
        <span>{{ entityTypeLabel }}</span>
      </div>
      <div class="antd-entity-hover-row">
        <span>{{ t('shell.hover.layer') }}</span>
        <span :title="entity.layer">{{ entity.layer }}</span>
      </div>
      <div class="antd-entity-hover-row">
        <span>{{ t('shell.hover.color') }}</span>
        <span :title="colorLabel">{{ colorLabel }}</span>
      </div>
      <div class="antd-entity-hover-row">
        <span>{{ t('shell.hover.linetype') }}</span>
        <span :title="entity.lineType">{{ entity.lineType }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@hy/cad-simple-viewer'
import { colorName, entityName, useHover } from '@hy/cad-viewer'
import { AcCmColorMethod } from '@hy/data-model'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { hovered, entity, mouse } = useHover()

/** Latest pointer position in viewport/client coordinates. */
const pointer = ref({ x: 0, y: 0 })

const onPointerMove = (event: PointerEvent) => {
  pointer.value = { x: event.clientX, y: event.clientY }
}

onMounted(() => {
  AcApDocManager.instance.curView?.canvas.addEventListener(
    'pointermove',
    onPointerMove
  )
})

onUnmounted(() => {
  AcApDocManager.instance.curView?.canvas.removeEventListener(
    'pointermove',
    onPointerMove
  )
})

// The view confirms a hover after a short pause. Use the event position as
// the initial anchor in case the pointer became stationary before this
// component was mounted; subsequent pointermove events keep it glued to the
// cursor while the user moves across the same entity.
watch(
  () => hovered.value,
  hovering => {
    if (hovering) {
      pointer.value = { x: mouse.value.x, y: mouse.value.y }
    }
  }
)

const entityTypeLabel = computed(() =>
  entity.value ? entityName(entity.value) : ''
)

const resolvedColor = computed(() => entity.value?.resolvedColor)

const colorLabel = computed(() =>
  resolvedColor.value ? colorName(resolvedColor.value.toString()) : ''
)

const swatchStyle = computed(() => {
  const color = resolvedColor.value
  const method = color?.colorMethod
  const rgb = color?.RGB
  if (method !== AcCmColorMethod.ByColor && method !== AcCmColorMethod.ByACI) {
    return { backgroundColor: 'transparent' }
  }
  if (rgb == null) return { backgroundColor: 'transparent' }
  return {
    backgroundColor: `#${rgb.toString(16).padStart(6, '0')}`
  }
})

const TIP_WIDTH = 300
const TIP_HEIGHT = 132
const CURSOR_GAP = 14
const EDGE_GAP = 8

/** Keeps the tooltip near the cursor and clamped inside the canvas area. */
const positionStyle = computed(() => {
  const view = AcApDocManager.instance.curView
  if (!view) return { left: '0px', top: '0px' }

  const pos = view.viewportToContainer(pointer.value)
  const width = view.container.clientWidth
  const height = view.container.clientHeight

  let left = pos.x + CURSOR_GAP
  if (left + TIP_WIDTH > width - EDGE_GAP) {
    left = pos.x - TIP_WIDTH - CURSOR_GAP
  }
  left = Math.max(
    EDGE_GAP,
    Math.min(left, Math.max(EDGE_GAP, width - TIP_WIDTH - EDGE_GAP))
  )

  let top = pos.y + CURSOR_GAP
  if (top + TIP_HEIGHT > height - EDGE_GAP) {
    top = pos.y - TIP_HEIGHT - CURSOR_GAP
  }
  top = Math.max(
    EDGE_GAP,
    Math.min(top, Math.max(EDGE_GAP, height - TIP_HEIGHT - EDGE_GAP))
  )

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`
  }
})
</script>
