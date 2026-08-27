<template>
  <div class="cad-search-panel-root">
    <div class="cad-search-toolbar">
      <input
        ref="inputRef"
        v-model="query"
        class="cad-search-input"
        type="text"
        :placeholder="labels.searchPlaceholder"
        :title="labels.locateNextTooltip"
        @keydown.enter.prevent="locateNext"
      />
      <button
        v-if="query"
        class="cad-search-clear"
        type="button"
        :title="labels.clear"
        @click="clearQuery"
      >
        ×
      </button>
    </div>

    <div v-if="query" class="cad-search-status">
      {{ statusText }}
    </div>

    <div v-if="!query" class="cad-search-hint">
      {{ labels.emptyHint }}
    </div>
    <div v-else-if="results.length === 0" class="cad-search-hint">
      {{ labels.noResults }}
    </div>

    <ul v-else class="cad-search-results">
      <li
        v-for="result in results"
        :key="result.item.zoomId"
        class="cad-search-result"
        :class="{ 'cad-search-result-active': result === activeResult }"
        :title="labels.locateTooltip"
        @click="locate(result)"
      >
        <div class="cad-search-result-text">
          <template
            v-for="(segment, index) in toSegments(result)"
            :key="index"
          >
            <mark v-if="segment.matched">{{ segment.text }}</mark>
            <template v-else>{{ segment.text }}</template>
          </template>
        </div>
        <div class="cad-search-result-meta">
          <span class="cad-search-result-type">{{ result.item.typeName }}</span>
          <span class="cad-search-result-layer">{{ result.item.layer }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useSearchI18n } from '../i18n/useSearchI18n'
import { locateEntity } from '../logic/locate'
import {
  SEARCH_RESULT_LIMIT,
  type TextSearchResult,
  searchTextItems
} from '../logic/textSearch'

const SEARCH_DEBOUNCE_MS = 200

const { labels, t } = useSearchI18n()

const query = ref('')
const results = ref<TextSearchResult[]>([])
const activeResult = ref<TextSearchResult | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(query, value => {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    results.value = searchTextItems(value)
    activeResult.value = null
  }, SEARCH_DEBOUNCE_MS)
})

const statusText = computed(() => {
  const count = results.value.length
  const suffix = count >= SEARCH_RESULT_LIMIT ? '+' : ''
  return t('resultCount', { count: `${count}${suffix}` })
})

const clearQuery = () => {
  query.value = ''
  inputRef.value?.focus()
}

const locate = (result: TextSearchResult) => {
  activeResult.value = result
  locateEntity(result.item.selectId, result.item.zoomId)
}

/** Locates the next match after the currently active one (Enter key). */
const locateNext = () => {
  const list = results.value
  if (list.length === 0) {
    return
  }
  const index = activeResult.value ? list.indexOf(activeResult.value) : -1
  locate(list[(index + 1) % list.length])
}

interface TextSegment {
  text: string
  matched: boolean
}

/** Splits result text into plain / matched segments for keyword highlight. */
const toSegments = (result: TextSearchResult): TextSegment[] => {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const range of result.ranges) {
    if (range.start > cursor) {
      segments.push({ text: result.item.text.slice(cursor, range.start), matched: false })
    }
    segments.push({ text: result.item.text.slice(range.start, range.end), matched: true })
    cursor = range.end
  }
  if (cursor < result.item.text.length) {
    segments.push({ text: result.item.text.slice(cursor), matched: false })
  }
  return segments
}

onMounted(() => {
  inputRef.value?.focus()
})
</script>
