<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppHeader from '~/components/app/AppHeader.vue'
import {
  categoryMeta,
  emotionMeta,
  perspectiveMeta,
  type DiaryCategory,
  type DiaryEmotion,
  type DiaryListResponse,
  type DiaryPerspective,
} from '~/types/diary'

const route = useRoute()
const searchInput = ref<HTMLInputElement | null>(null)
const searchText = ref(typeof route.query.q === 'string' ? route.query.q : '')
const submittedSearch = ref(searchText.value)
const filterablePerspectives: DiaryPerspective[] = ['teen', 'parent', 'family']
const filterableCategories: DiaryCategory[] = [
  'daily-life',
  'growth-conflict',
  'pressure',
  'communication',
  'expectation-responsibility',
  'understanding-gratitude',
]
const selectedPerspective = ref<DiaryPerspective | ''>(
  typeof route.query.perspective === 'string' && filterablePerspectives.includes(route.query.perspective as DiaryPerspective)
    ? route.query.perspective as DiaryPerspective
    : '',
)
const selectedCategory = ref<DiaryCategory | ''>(
  typeof route.query.category === 'string' && filterableCategories.includes(route.query.category as DiaryCategory)
    ? route.query.category as DiaryCategory
    : '',
)
const selectedEmotion = ref<DiaryEmotion | ''>(
  typeof route.query.emotion === 'string' && route.query.emotion in emotionMeta
    ? route.query.emotion as DiaryEmotion
    : '',
)
const page = ref(1)

const filters: Array<{ value: DiaryEmotion | ''; label: string }> = [
  { value: '', label: '今夜推荐' },
  { value: 'calm', label: '平静' },
  { value: 'gentle', label: '温柔' },
  { value: 'longing', label: '想念' },
  { value: 'courage', label: '勇气' },
]

const perspectiveFilters: Array<{ value: DiaryPerspective | ''; label: string }> = [
  { value: '', label: '全部声音' },
  ...filterablePerspectives.map((value) => ({ value, label: perspectiveMeta[value].label })),
]

const categoryFilters: Array<{ value: DiaryCategory | ''; label: string }> = [
  { value: '', label: '全部主题' },
  ...filterableCategories.map((value) => ({ value, label: categoryMeta[value].label })),
]

const queryParameters = computed(() => ({
  scope: 'public',
  page: page.value,
  limit: 8,
  perspective: selectedPerspective.value || undefined,
  category: selectedCategory.value || undefined,
  emotion: selectedEmotion.value || undefined,
  q: submittedSearch.value || undefined,
}))

const { data, status, error, refresh } = await useFetch<DiaryListResponse>('/api/diaries', {
  query: queryParameters,
})

watch([selectedPerspective, selectedCategory, selectedEmotion], () => {
  page.value = 1
})

const activeFilterLabels = computed(() => {
  const labels: string[] = []
  if (selectedPerspective.value) labels.push(perspectiveMeta[selectedPerspective.value].label)
  if (selectedCategory.value) labels.push(categoryMeta[selectedCategory.value].label)
  if (selectedEmotion.value) labels.push(emotionMeta[selectedEmotion.value].label)
  if (submittedSearch.value) labels.push(`“${submittedSearch.value}”`)
  return labels
})

const emptyStateMessage = computed(() => {
  if (!activeFilterLabels.value.length) return '今夜暂时没有公开文字抵达，可以稍后再来看看。'
  return `暂时没有同时回应「${activeFilterLabels.value.join(' · ')}」的文字。换一个条件，也许会遇见另一种理解。`
})

function submitSearch() {
  page.value = 1
  submittedSearch.value = searchText.value.trim()
}

function clearSearch() {
  searchText.value = ''
  submittedSearch.value = ''
  searchInput.value?.focus()
}

function resetAllFilters() {
  selectedPerspective.value = ''
  selectedCategory.value = ''
  selectedEmotion.value = ''
  searchText.value = ''
  submittedSearch.value = ''
  page.value = 1
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })
    .format(new Date(`${date}T12:00:00`))
}

onMounted(() => {
  if (route.query.search === 'open') window.setTimeout(() => searchInput.value?.focus(), 180)
})

useSeoMeta({
  title: '共鸣广场 · 星笺',
  description: '在不被热度排序打扰的夜间漂流中，遇见一篇同频的公开日记。',
})
</script>

<template>
  <div class="app-shell explore-page">
    <a class="skip-link" href="#explore-content">跳到公开日记</a>
    <AppHeader />

    <main id="explore-content" class="explore-shell">
      <header class="explore-intro">
        <div>
          <p class="explore-time">夜间漂流 · 不按热度排序</p>
          <h1>有些心事，会在陌生人的文字里得到回声。</h1>
        </div>
        <p>这里没有排行和点赞。每次打开，星笺只从允许公开的文字中，安静地带来几段不同的夜晚。</p>
      </header>

      <section class="family-listening-filters" aria-label="按家庭视角和内容主题筛选公开日记">
        <div class="listening-filter-row">
          <div class="listening-filter-heading">
            <strong>想听谁说</strong>
            <span>由作者主动选择的视角</span>
          </div>
          <div class="context-filter" role="group" aria-label="按作者视角筛选">
            <button
              v-for="filter in perspectiveFilters"
              :key="filter.value || 'all-perspectives'"
              type="button"
              :class="{ selected: selectedPerspective === filter.value }"
              :aria-pressed="selectedPerspective === filter.value"
              @click="selectedPerspective = filter.value"
            >
              <span v-if="selectedPerspective === filter.value" class="filter-check" aria-hidden="true">✓</span>
              {{ filter.label }}
            </button>
          </div>
        </div>

        <div class="listening-filter-row">
          <div class="listening-filter-heading">
            <strong>他们在经历什么</strong>
            <span>每篇文字只选择一个主要主题</span>
          </div>
          <div class="context-filter category-context-filter" role="group" aria-label="按内容主题筛选">
            <button
              v-for="filter in categoryFilters"
              :key="filter.value || 'all-categories'"
              type="button"
              :class="{ selected: selectedCategory === filter.value }"
              :aria-pressed="selectedCategory === filter.value"
              @click="selectedCategory = filter.value"
            >
              <span v-if="selectedCategory === filter.value" class="filter-check" aria-hidden="true">✓</span>
              {{ filter.label }}
            </button>
          </div>
        </div>
      </section>

      <div class="explore-controls">
        <div class="emotion-filter" role="group" aria-label="按情绪筛选公开日记">
          <button
            v-for="filter in filters"
            :key="filter.value || 'all'"
            type="button"
            :class="{ selected: selectedEmotion === filter.value }"
            :aria-pressed="selectedEmotion === filter.value"
            @click="selectedEmotion = filter.value"
          >
            <span v-if="filter.value" aria-hidden="true">{{ emotionMeta[filter.value].symbol }}</span>
            {{ filter.label }}
          </button>
        </div>

        <form class="explore-search" role="search" @submit.prevent="submitSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            id="explore-search-input"
            ref="searchInput"
            v-model="searchText"
            type="search"
            maxlength="80"
            aria-label="搜索公开日记"
            placeholder="搜索标题、片段或作者"
          />
          <button v-if="submittedSearch" type="button" aria-label="清除搜索" @click="clearSearch">清除</button>
          <button v-else type="submit">搜索</button>
        </form>
      </div>

      <section class="drift-stream" aria-labelledby="drift-title">
        <header class="drift-heading">
          <div>
            <h2 id="drift-title">{{ submittedSearch ? `“${submittedSearch}”的回声` : '正在靠近的星笺' }}</h2>
            <p v-if="data">{{ data.total ? `${data.total} 篇文字允许被遇见` : '今夜暂时没有匹配的文字' }}</p>
          </div>
          <span>正文将在进入后完整展开</span>
        </header>

        <div v-if="status === 'pending'" class="drift-loading" aria-label="正在接收公开日记">
          <div v-for="index in 4" :key="index" class="drift-skeleton">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div v-else-if="error" class="explore-state" role="alert">
          <span class="state-orbit" aria-hidden="true"></span>
          <h2>今晚的信号有些微弱</h2>
          <p>公开日记暂时没有抵达，已经写下的内容不会受到影响。</p>
          <button type="button" class="primary-button" @click="refresh()">重新接收</button>
        </div>

        <div v-else-if="!data?.items.length" class="explore-state">
          <span class="state-orbit empty" aria-hidden="true"></span>
          <h2>没有找到同频的文字</h2>
          <p>{{ emptyStateMessage }}</p>
          <button type="button" class="explore-reset" @click="resetAllFilters">重置全部筛选</button>
        </div>

        <ol v-else class="drift-list">
          <li v-for="(diary, index) in data.items" :key="diary.id">
            <a class="drift-entry" :href="`/diary/${diary.id}?from=explore`">
              <span class="drift-index">{{ String((data.page - 1) * data.limit + index + 1).padStart(2, '0') }}</span>
              <span :class="['drift-core', `emotion-${diary.emotion}`]" aria-hidden="true"><span></span></span>
              <span class="drift-copy">
                <span class="drift-meta">
                  {{ formatDate(diary.date) }} · {{ emotionMeta[diary.emotion].label }} · {{ diary.authorName }}
                  <span v-if="diary.location">{{ diary.location.split(' · ')[0] }}</span>
                </span>
                <span class="drift-context" aria-label="作者视角和内容主题">
                  <span>视角 · {{ perspectiveMeta[diary.perspective].label }}</span>
                  <span>主题 · {{ categoryMeta[diary.category].label }}</span>
                </span>
                <strong>{{ diary.title }}</strong>
                <span class="drift-summary">{{ diary.summary }}</span>
              </span>
              <span class="drift-open">
                阅读
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </span>
            </a>
          </li>
        </ol>

        <nav v-if="data && data.totalPages > 1" class="explore-pagination" aria-label="公开日记分页">
          <button type="button" :disabled="data.page <= 1" @click="page -= 1">上一页</button>
          <span>第 {{ data.page }} / {{ data.totalPages }} 页</span>
          <button type="button" :disabled="!data.hasMore" @click="page += 1">下一页</button>
        </nav>
      </section>
    </main>
  </div>
</template>
