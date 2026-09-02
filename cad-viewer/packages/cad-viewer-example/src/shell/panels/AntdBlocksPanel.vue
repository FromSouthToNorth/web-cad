<template>
  <div class="antd-blocks-panel">
    <a-empty
      v-if="!blocks.length"
      :description="t('shell.blocksPanel.empty')"
      :image-style="{ height: '48px' }"
    />
    <div v-else class="antd-blocks-grid">
      <button
        v-for="block in blocks"
        :key="block.name"
        type="button"
        class="antd-block-item"
        :title="block.name"
        @click="insertBlock(block.name)"
      >
        <img
          v-if="block.previewUrl"
          :src="block.previewUrl"
          :alt="block.name"
          class="antd-block-preview"
        />
        <span v-else class="antd-block-preview antd-block-preview-fallback">
          <BlockOutlined />
        </span>
        <span class="antd-block-name">{{ block.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BlockOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { useInsertableBlocks } from '@mlightcad/cad-viewer'
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { blocks, refreshBlocks } = useInsertableBlocks()

const reload = () => {
  void refreshBlocks(null)
}

const onDocumentActivated = () => {
  reload()
}

onMounted(() => {
  reload()
  AcApDocManager.instance.events.documentActivated.addEventListener(
    onDocumentActivated
  )
})

onUnmounted(() => {
  AcApDocManager.instance.events.documentActivated.removeEventListener(
    onDocumentActivated
  )
})

const insertBlock = (blockName: string) => {
  AcApDocManager.instance.sendStringToExecute(`-insert\n${blockName}`)
}
</script>
