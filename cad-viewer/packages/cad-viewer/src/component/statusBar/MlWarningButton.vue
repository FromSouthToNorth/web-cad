<template>
  <a-button
    v-if="hasMissing"
    class="ml-warning-button"
    danger
    @click="click()"
  >
    <template #icon><WarningOutlined /></template>
  </a-button>
</template>

<script lang="ts" setup>
import { WarningOutlined } from '@ant-design/icons-vue'
import { computed } from 'vue'

import { openMissingResourcesPalette, useMissedData } from '../../composable'

const { fonts, images, xrefs } = useMissedData()

const hasMissing = computed(() => {
  return images.size > 0 || fonts.size > 0 || xrefs.length > 0
})

const click = () => {
  openMissingResourcesPalette()
}
</script>

<style scoped>
.ml-warning-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: 30px;
}
</style>
