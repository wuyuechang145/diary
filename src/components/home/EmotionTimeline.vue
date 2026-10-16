<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { emotionMeta, type DiaryEmotion, type DiarySummary } from '@/types/diary'

const props = withDefaults(defineProps<{
  standalone?: boolean
  diaries?: DiarySummary[]
}>(), {
  standalone: false,
  diaries: () => [],
})

const emit = defineEmits<{
  openMemory: [id: string]
  composePast: [date: string]
}>()

const emotionTone: Record<DiaryEmotion, string> = {
  calm: '--color-patina',
  gentle: '--color-coral',
  longing: '--color-violet',
  courage: '--color-cyan',
  tension: '--color-muted',
  sadness: '--color-indigo',
  unspecified: '--color-faint',
}
const emotionHeight: Record<DiaryEmotion, number> = {
  calm: 58,
  gentle: 40,
  longing: 32,
  courage: 22,
  tension: 70,
  sadness: 78,
  unspecified: 64,
}
const privacyLabels = {
  private: '仅自己可见',
  friends: '旧设置 · 仅自己可见',
  anonymous: '匿名公开',
  public: '公开',
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const timelineEntries = computed(() => {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - 6 + index)
    const key = dateKey(date)
    const diary = props.diaries.find((item) => item.date === key)
    return {
      date: key,
      dateLabel: new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date),
      weekday: index === 6 ? '今天' : new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
      emotion: diary ? emotionMeta[diary.emotion].label : '未记录',
      tone: diary ? emotionTone[diary.emotion] : '--color-faint',
      x: 5 + index * (91 / 6),
      y: diary ? emotionHeight[diary.emotion] : 72,
      diary,
    }
  })
})

const selectedIndex = ref(6)
watch(timelineEntries, (entries) => {
  const latestDiaryIndex = entries.findLastIndex((entry) => Boolean(entry.diary))
  selectedIndex.value = latestDiaryIndex >= 0 ? latestDiaryIndex : 6
}, { immediate: true })

const selectedEntry = computed(() => timelineEntries.value[selectedIndex.value]!)
const realEntries = computed(() => timelineEntries.value.filter((entry) => entry.diary))
const timelinePath = computed(() => {
  if (realEntries.value.length < 2) return ''
  return realEntries.value
    .map((entry, index) => `${index ? 'L' : 'M'} ${entry.x * 10} ${entry.y * 3.2}`)
    .join(' ')
})
const periodLabel = computed(() => {
  const entries = timelineEntries.value
  return `${entries[0]?.dateLabel ?? ''}—${entries.at(-1)?.dateLabel ?? ''}`
})
const privateCount = computed(() => realEntries.value.filter((entry) => entry.diary?.visibility === 'private').length)

function openSelected() {
  if (selectedEntry.value.diary) emit('openMemory', selectedEntry.value.diary.id)
}
</script>

<template>
  <section id="emotion-timeline" :class="['emotion-timeline', { standalone }]" aria-labelledby="timeline-title">
    <div v-if="!standalone" class="timeline-transition" aria-hidden="true">
      <span class="timeline-transition-line"></span>
      <span class="timeline-anchor-core"></span>
      <span class="timeline-transition-line"></span>
    </div>

    <header class="timeline-header">
      <div>
        <p class="timeline-period">{{ periodLabel }}</p>
        <h2 id="timeline-title">这一周，情绪如何经过你</h2>
      </div>
      <p class="timeline-intro">这里只读取当前账户最近七天真实保存的日记。没有书写的日子会保持空白。</p>
    </header>

    <div class="timeline-observatory">
      <div class="timeline-plot" aria-label="最近七天真实日记情绪时间线">
        <svg v-if="timelinePath" class="timeline-path" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true">
          <path :d="timelinePath" />
        </svg>

        <ol class="timeline-node-list">
          <li
            v-for="(entry, index) in timelineEntries"
            :key="entry.date"
            class="timeline-node-item"
            :style="{
              '--node-x': `${entry.x}%`,
              '--node-y': `${entry.y}%`,
              '--node-tone': `var(${entry.tone})`,
            }"
          >
            <button
              type="button"
              :class="['timeline-node-button', { selected: selectedIndex === index, empty: !entry.diary }]"
              :aria-pressed="selectedIndex === index"
              :aria-label="`${entry.dateLabel}，${entry.emotion}${entry.diary ? `，${entry.diary.title}` : '，没有日记'}`"
              @click="selectedIndex = index"
            >
              <span class="timeline-node-orbit" aria-hidden="true"></span>
              <span class="timeline-node-core" aria-hidden="true"></span>
              <span class="timeline-node-date">{{ entry.weekday }}</span>
              <span class="timeline-node-emotion">{{ entry.emotion }}</span>
            </button>
          </li>
        </ol>
      </div>

      <aside class="timeline-reading" aria-live="polite">
        <div class="reading-meta">
          <span>{{ selectedEntry.dateLabel }}</span>
          <span class="reading-emotion">
            <span :style="{ background: `var(${selectedEntry.tone})` }"></span>
            {{ selectedEntry.emotion }}
          </span>
        </div>

        <template v-if="selectedEntry.diary">
          <h3>{{ selectedEntry.diary.title }}</h3>
          <p class="reading-excerpt">{{ selectedEntry.diary.summary || '这篇日记还没有正文摘要。' }}</p>
          <div class="reading-footer">
            <span class="reading-privacy">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="10" width="12" height="9" rx="2" />
                <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
              </svg>
              {{ privacyLabels[selectedEntry.diary.visibility] }}
            </span>
            <button type="button" class="timeline-action" @click="openSelected">
              重新读一遍
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="timeline-empty-mark" aria-hidden="true"><span></span></div>
          <h3>这一天没有写下文字</h3>
          <p class="reading-excerpt">这里没有自动补齐的故事。若你还记得什么，可以从现在补上一句。</p>
          <button type="button" class="timeline-action empty-action" @click="emit('composePast', selectedEntry.date)">
            补记这一天
            <span aria-hidden="true">＋</span>
          </button>
        </template>
      </aside>
    </div>

    <footer class="timeline-footer">
      <p><span>{{ realEntries.length }}</span> 个有真实日记的日期进入本周轨迹</p>
      <p v-if="privateCount"><span>{{ privateCount }}</span> 篇仍保持仅自己可见</p>
      <p v-else>星图不会为没有记录的日子虚构情绪。</p>
    </footer>
  </section>
</template>
