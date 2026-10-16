<script setup lang="ts">
import AppHeader from '@/components/app/AppHeader.vue'
import EmotionTimeline from '@/components/home/EmotionTimeline.vue'
import type { DiaryListResponse } from '@/types/diary'
import type { SessionState } from '@/types/auth'

const { data: session } = await useFetch<SessionState>('/api/session')
if (!session.value?.isAuthenticated) await navigateTo('/login?redirect=/constellation', { redirectCode: 302 })
const { data: diaryData } = await useFetch<DiaryListResponse>('/api/diaries', {
  query: { scope: 'mine', page: 1, limit: 20 },
})

function openMemory(id: string) {
  window.location.assign(`/diary/${id}?from=constellation`)
}

function composePast(date: string) {
  window.location.assign(`/diary/new?date=${encodeURIComponent(date)}&from=constellation`)
}

useSeoMeta({
  title: '情绪星图 · 星笺',
  description: '沿着时间、情绪与记忆的轨迹，重新靠近曾经写下的自己。',
})
</script>

<template>
  <div class="app-shell constellation-page">
    <a class="skip-link" href="#constellation-content">跳到情绪星图</a>
    <AppHeader />

    <main id="constellation-content" class="constellation-shell">
      <header class="constellation-intro">
        <div>
          <p class="constellation-kicker">私人观测记录 · {{ diaryData?.total ?? 0 }} 篇账户日记</p>
          <h1>把一周的心事，<br />看成一条有方向的星轨。</h1>
        </div>
        <div class="constellation-intro-copy">
          <p>这里不判断情绪的高低，只把每次书写留在时间里。选择一个节点，重新靠近当时的自己。</p>
          <a class="constellation-write-link" href="/diary/new?from=constellation">
            为今天添一颗星
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <EmotionTimeline
        standalone
        :diaries="diaryData?.items ?? []"
        @open-memory="openMemory"
        @compose-past="composePast"
      />
    </main>
  </div>
</template>
