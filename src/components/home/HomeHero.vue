<script setup lang="ts">
import { computed } from 'vue'
import EmotionScene from '@/components/three/EmotionScene.client.vue'
import { emotionMeta, type DiarySummary } from '@/types/diary'

const props = withDefaults(defineProps<{
  recentDiaries?: DiarySummary[]
  greetingName?: string
  isAuthenticated?: boolean
}>(), {
  recentDiaries: () => [],
  greetingName: '星友',
  isAuthenticated: false,
})

defineEmits<{
  encounter: []
  openCore: []
}>()

const today = computed(() => {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  return formatter.format(new Date())
})

const privacyLabels = {
  private: '仅自己',
  friends: '旧设置 · 仅自己可见',
  anonymous: '匿名公开',
  public: '公开',
}

const writeHref = computed(() => props.isAuthenticated ? '/diary/new?from=home' : '/login?redirect=%2Fdiary%2Fnew%3Ffrom%3Dhome')
const latestDiary = computed(() => props.recentDiaries[0])
const visibleRecentDiaries = computed(() => props.recentDiaries.slice(0, 3))
const sevenDaysAgo = computed(() => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - 6)
  return date
})
const weeklyDiaries = computed(() => props.recentDiaries
  .filter((diary) => new Date(`${diary.date}T12:00:00`) >= sevenDaysAgo.value)
  .slice()
  .reverse())
const emotionColors: Record<DiarySummary['emotion'], string> = {
  calm: 'var(--color-patina)',
  gentle: 'var(--color-coral)',
  longing: 'var(--color-violet)',
  courage: 'var(--color-cyan)',
  tension: 'var(--color-muted)',
  sadness: 'var(--color-indigo)',
  unspecified: 'var(--color-faint)',
}

function diaryMeta(diary: DiarySummary) {
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${diary.date}T12:00:00`))
  return `${date} · ${emotionMeta[diary.emotion].label}`
}
</script>

<template>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <p class="date-line">{{ today }}</p>
      <p class="greeting">晚上好，{{ greetingName }}。</p>
      <h1 id="home-title">把未说出口的心事，<br />写成一颗会呼吸的星。</h1>
      <p class="hero-intro">今夜的星域很安静。你可以从一句话开始，其余的，让心象慢慢替你说完。</p>

      <div class="hero-actions">
        <a class="primary-button" :href="writeHref">
          {{ isAuthenticated ? '开始写日记' : '登录后开始书写' }}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </a>
        <button class="text-button" type="button" @click="$emit('encounter')">
          <span class="encounter-mark" aria-hidden="true"></span>
          遇见一篇日记
        </button>
      </div>

      <div class="privacy-assurance">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <span>新日记默认仅自己可见</span>
      </div>
    </div>

    <div class="hero-core hero-core--planetary">
      <ClientOnly>
        <EmotionScene
          :emotion="latestDiary?.emotion ?? 'calm'"
          :perspective="latestDiary?.perspective"
          :category="latestDiary?.category"
          variant="planetary"
          presentation="hero"
          @enter="$emit('openCore')"
        />
        <template #fallback>
          <div class="emotion-scene emotion-scene--planetary" aria-hidden="true">
            <div class="static-core loading"><span></span></div>
          </div>
        </template>
      </ClientOnly>
      <div class="core-caption" aria-hidden="true">
        <span>今日心象</span>
        <span class="core-caption-line"></span>
        <span>{{ latestDiary ? emotionMeta[latestDiary.emotion].label : '等待第一篇记录' }}</span>
      </div>
      <p class="core-prompt">拖动星核，看看情绪的另一面</p>
    </div>

    <aside class="recent-memories" aria-labelledby="recent-title">
      <div class="recent-heading">
        <div>
          <p>最近记忆</p>
          <h2 id="recent-title">仍在轨道上的片段</h2>
        </div>
        <a :href="writeHref">{{ isAuthenticated ? '继续书写' : '登录' }} <span aria-hidden="true">↗</span></a>
      </div>

      <ol v-if="visibleRecentDiaries.length" class="memory-list">
        <li v-for="(diary, index) in visibleRecentDiaries" :key="diary.id" class="memory-item">
          <a class="memory-link" :href="`/diary/${diary.id}?from=home`">
            <span :class="['mini-core', `emotion-${diary.emotion}`]" aria-hidden="true"></span>
            <span class="memory-content">
              <span class="memory-title">{{ diary.title }}</span>
              <span class="memory-meta">{{ diaryMeta(diary) }}</span>
            </span>
            <span class="memory-privacy">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="10" width="12" height="9" rx="2" />
                <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
              </svg>
              {{ privacyLabels[diary.visibility] }}
            </span>
          </a>
          <span v-if="index < visibleRecentDiaries.length - 1" class="orbit-thread" aria-hidden="true"></span>
        </li>
      </ol>

      <div v-else class="memory-empty">
        <span aria-hidden="true">○</span>
        <p>{{ isAuthenticated ? '还没有被保存的片段。第一颗星，可以只从一句话开始。' : '登录后，这里只会出现你自己真实保存的日记。' }}</p>
        <a :href="writeHref">{{ isAuthenticated ? '写下第一篇' : '登录或注册' }}</a>
      </div>
    </aside>

    <div class="week-spectrum" :aria-label="weeklyDiaries.length ? `最近七天有 ${weeklyDiaries.length} 篇真实记录` : '最近七天还没有日记记录'">
      <span class="spectrum-label">本周情绪轨迹</span>
      <div :class="['spectrum-track', { empty: !weeklyDiaries.length }]" aria-hidden="true">
        <span
          v-for="(diary, index) in weeklyDiaries"
          :key="diary.id"
          class="spectrum-node real-spectrum-node"
          :style="{ left: `${weeklyDiaries.length === 1 ? 50 : index * 100 / (weeklyDiaries.length - 1)}%`, background: emotionColors[diary.emotion] }"
        ></span>
      </div>
      <p>{{ weeklyDiaries.length ? `来自 ${weeklyDiaries.length} 篇真实记录` : isAuthenticated ? '写下日记后自动生成' : '登录后根据日记生成' }}</p>
    </div>
  </section>
</template>
