<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from '@/components/app/AppHeader.vue'
import HomeHero from '@/components/home/HomeHero.vue'
import type { DiaryListResponse } from '@/types/diary'
import type { SessionState } from '@/types/auth'

const notice = ref('')
let noticeTimer: number | undefined
const { data: session } = await useFetch<SessionState>('/api/session')
const recentData = ref<DiaryListResponse | null>(null)
if (session.value?.isAuthenticated) {
  const { data } = await useFetch<DiaryListResponse>('/api/diaries', {
    key: 'home-private-diaries',
    query: { scope: 'mine', page: 1, limit: 20 },
  })
  recentData.value = data.value ?? null
}

function showNotice(message: string) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 3200)
}

async function openEncounter() {
  showNotice('正在为你寻找一篇同频的日记')
  try {
    const result = await $fetch<DiaryListResponse>('/api/diaries', {
      query: { scope: 'public', limit: 12 },
    })
    if (!result.items.length) {
      showNotice('今夜的漂流还很安静，稍后再来看看')
      return
    }
    const selected = result.items[Math.floor(Math.random() * result.items.length)]!
    window.location.assign(`/diary/${selected.id}?from=home`)
  } catch {
    showNotice('暂时没有接收到远方的星笺')
  }
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <AppHeader />
    <main id="main-content">
      <HomeHero
        :recent-diaries="recentData?.items ?? []"
        :is-authenticated="Boolean(session?.isAuthenticated)"
        :greeting-name="session?.isAuthenticated ? session.name : '星友'"
        @encounter="openEncounter"
        @open-core="showNotice('今日心象已被唤醒')"
      />
      <section class="constellation-gateway" aria-labelledby="constellation-gateway-title">
        <div class="gateway-orbit" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="gateway-copy">
          <p>情绪星图 · 独立观测页</p>
          <h2 id="constellation-gateway-title">这一周留下的，不只是一种情绪。</h2>
          <p>沿着七个时间节点回看文字，让平静、想念与温柔各自拥有位置。</p>
        </div>
        <a class="gateway-link" href="/constellation">
          打开完整星图
          <span aria-hidden="true">↗</span>
        </a>
      </section>
    </main>

    <Transition name="notice">
      <p v-if="notice" class="stage-notice" role="status">{{ notice }}</p>
    </Transition>
  </div>
</template>
