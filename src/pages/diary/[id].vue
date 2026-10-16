<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import ResonancePanel from '~/components/diary/ResonancePanel.vue'
import EmotionScene from '~/components/three/EmotionScene.client.vue'
import { categoryMeta, emotionMeta, perspectiveMeta, type DiaryDetail } from '~/types/diary'

type ResonanceType = 'glow' | 'hug' | 'together' | 'same-experience'

const route = useRoute()
const diaryId = String(route.params.id)
const returnTarget = computed(() => {
  const from = typeof route.query.from === 'string' ? route.query.from : ''
  if (from === 'home') return { href: '/', label: '返回首页' }
  if (from === 'profile') return { href: '/profile', label: '返回个人主页' }
  if (from === 'constellation') return { href: '/constellation', label: '返回情绪星图' }
  if (from === 'explore') return { href: '/explore', label: '返回共鸣广场' }
  return diary.value?.isOwner
    ? { href: '/profile', label: '返回个人主页' }
    : { href: '/explore', label: '返回共鸣广场' }
})
const shareFeedback = ref('')
const resonancePulse = ref(0)
const resonanceTone = ref<ResonanceType>('glow')
let shareTimer: number | undefined

const { data: diary, status, error, refresh } = await useFetch<DiaryDetail>(`/api/diaries/${diaryId}`)

const paragraphs = computed(() => diary.value?.content.split(/\n\s*\n/).filter(Boolean) ?? [])
const privacyLabels = {
  private: '仅自己可见',
  friends: '旧设置 · 仅自己可见',
  anonymous: '匿名公开',
  public: '公开并显示身份',
}

const visualSeed = computed(() => {
  let hash = 2166136261
  for (const character of diaryId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
})

const displayDate = computed(() => {
  if (!diary.value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${diary.value.date}T12:00:00`))
})

function showShareFeedback(message: string) {
  shareFeedback.value = message
  window.clearTimeout(shareTimer)
  shareTimer = window.setTimeout(() => {
    shareFeedback.value = ''
  }, 2600)
}

async function shareDiary() {
  if (!diary.value || !import.meta.client) return
  const shareData = {
    title: `${diary.value.title} · 星笺`,
    text: diary.value.summary,
    url: new URL(`/diary/${encodeURIComponent(diaryId)}`, window.location.origin).toString(),
  }
  try {
    if (navigator.share) {
      await navigator.share(shareData)
      showShareFeedback('分享面板已打开')
    } else {
      await navigator.clipboard.writeText(shareData.url)
      showShareFeedback('阅读链接已复制')
    }
  } catch (shareError) {
    if ((shareError as DOMException).name !== 'AbortError') showShareFeedback('暂时无法分享，请稍后再试')
  }
}

function handleResonance(type: ResonanceType) {
  resonanceTone.value = type
  resonancePulse.value += 1
}

onBeforeUnmount(() => {
  window.clearTimeout(shareTimer)
})

useSeoMeta({
  title: () => diary.value ? `${diary.value.title} · 星笺` : '阅读星笺',
  description: () => diary.value?.summary ?? '阅读一篇被允许遇见的星笺。',
})
</script>

<template>
  <div class="reader-page">
    <a class="skip-link" href="#diary-content">跳到日记正文</a>

    <header class="reader-header">
      <a class="reader-back" :href="returnTarget.href">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        <span>{{ returnTarget.label }}</span>
      </a>
      <div class="reader-progress" aria-hidden="true">
        <span></span>
      </div>
      <button v-if="diary" type="button" class="reader-share" @click="shareDiary">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5" />
        </svg>
        分享
      </button>
    </header>

    <main id="diary-content">
      <div v-if="status === 'pending'" class="reader-loading" aria-label="正在展开日记">
        <div class="reader-loading-core"></div>
        <div><span></span><span></span><span></span><span></span></div>
      </div>

      <section v-else-if="error" class="reader-state" role="alert">
        <span class="state-orbit" aria-hidden="true"></span>
        <h1>{{ error.statusCode === 403 ? '这颗星仍属于它自己的夜空' : '没有找到这篇星笺' }}</h1>
        <p>{{ error.statusCode === 403 ? '作者还没有允许它被遇见。' : '它可能已经被撤回，或者漂向了别的轨道。' }}</p>
        <div>
          <a class="primary-button" href="/explore">返回共鸣广场</a>
          <button type="button" class="reader-retry" @click="refresh()">重新寻找</button>
        </div>
      </section>

      <div v-else-if="diary" class="reader-workbench">
        <aside class="reader-imagery" aria-labelledby="reader-imagery-title">
          <div class="reader-imagery-sticky">
            <div :class="['reader-scene', `pulse-${resonanceTone}`]">
              <ClientOnly>
                <EmotionScene
                  :emotion="diary.emotion"
                  :perspective="diary.perspective"
                  :category="diary.category"
                  :visual-seed="visualSeed"
                  variant="planetary"
                  :interactive-label="`${diary.title}的心象。可拖动查看。`"
                />
                <template #fallback>
                  <div class="emotion-scene emotion-scene--planetary" aria-hidden="true">
                    <div class="static-core loading"><span></span></div>
                  </div>
                </template>
              </ClientOnly>
              <span v-if="resonancePulse" :key="resonancePulse" class="resonance-ripple" aria-hidden="true"></span>
            </div>
            <div class="reader-imagery-copy">
              <p>这篇文字的心象</p>
              <p id="reader-imagery-title" class="reader-imagery-title">{{ emotionMeta[diary.emotion].label }}</p>
              <span>{{ emotionMeta[diary.emotion].sentence }}</span>
            </div>
            <div class="emotion-wave" aria-hidden="true">
              <i v-for="height in [18, 34, 26, 46, 22, 38, 16, 30, 20, 42, 24, 32]" :key="height" :style="{ height: `${height}px` }"></i>
            </div>
          </div>
        </aside>

        <article class="diary-reader">
          <header class="diary-reader-heading">
            <p>{{ displayDate }}</p>
            <h1>{{ diary.title }}</h1>
            <div class="reader-byline">
              <span>{{ diary.authorName }}</span>
              <span>{{ emotionMeta[diary.emotion].label }}</span>
              <span>{{ privacyLabels[diary.visibility] }}</span>
              <span v-if="diary.location">{{ diary.location }}</span>
            </div>
            <dl class="reader-context-tags" aria-label="作者主动选择的视角和内容主题">
              <div>
                <dt>作者视角</dt>
                <dd>{{ perspectiveMeta[diary.perspective].label }}</dd>
              </div>
              <div>
                <dt>内容主题</dt>
                <dd>{{ categoryMeta[diary.category].label }}</dd>
              </div>
            </dl>
          </header>

          <div class="diary-prose">
            <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
          </div>

          <footer class="diary-reader-footer">
            <div>
              <span :class="['reader-emotion-mark', `emotion-${diary.emotion}`]" aria-hidden="true"></span>
              <p>情绪只是这篇文字的一种视觉建议，不是对作者的判断。</p>
            </div>
            <button type="button" @click="shareDiary">分享这篇星笺</button>
          </footer>
        </article>

        <ResonancePanel :diary-id="diary.id" @pulse="handleResonance" />
      </div>
    </main>

    <Transition name="notice">
      <p v-if="shareFeedback" class="stage-notice" role="status">{{ shareFeedback }}</p>
    </Transition>
  </div>
</template>
