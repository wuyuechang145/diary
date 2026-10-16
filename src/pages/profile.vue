<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from '~/components/app/AppHeader.vue'
import type { ProfileResponse, SessionState } from '~/types/auth'
import { emotionMeta, type DiaryListResponse, type DiarySummary } from '~/types/diary'

const { data: session } = await useFetch<SessionState>('/api/session')
if (!session.value?.isAuthenticated) await navigateTo('/login?redirect=/profile', { redirectCode: 302 })

const diaryPage = ref(1)
const { data: profile, refresh: refreshProfile } = await useFetch<ProfileResponse>('/api/profile')
const { data: diaries, refresh: refreshDiaries } = await useFetch<DiaryListResponse>('/api/diaries', {
  query: computed(() => ({ scope: 'mine', page: diaryPage.value, limit: 10 })),
})
const loggingOut = ref(false)
const deletingId = ref('')
const pendingDelete = ref<DiarySummary | null>(null)
const managementNotice = ref('')

const initial = computed(() => profile.value?.account.name.trim().slice(0, 1) || '星')
const joinedAt = computed(() => {
  if (!profile.value?.account.createdAt) return '今夜加入'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(profile.value.account.createdAt))
})
const dominantEmotion = computed(() => {
  const emotion = profile.value?.stats.dominantEmotion
  return emotion ? emotionMeta[emotion].label : '等待书写'
})
const statItems = computed(() => [
  { value: profile.value?.stats.total ?? 0, label: '全部星笺' },
  { value: profile.value?.stats.published ?? 0, label: '已经发布' },
  { value: profile.value?.stats.private ?? 0, label: '仅自己可见' },
  { value: profile.value?.stats.anonymous ?? 0, label: '匿名漂流' },
])

function formatDiaryDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function askToDelete(diary: DiarySummary) {
  managementNotice.value = ''
  pendingDelete.value = diary
}

async function confirmDelete() {
  if (!pendingDelete.value || deletingId.value) return
  const diary = pendingDelete.value
  deletingId.value = diary.id
  managementNotice.value = ''
  try {
    const endpoint: string = `/api/diaries/${encodeURIComponent(diary.id)}`
    await $fetch(endpoint, { method: 'DELETE' })
    pendingDelete.value = null
    await Promise.all([refreshDiaries(), refreshProfile()])
    if (!diaries.value?.items.length && diaryPage.value > 1) diaryPage.value -= 1
    managementNotice.value = `《${diary.title}》已删除`
  } catch (error) {
    managementNotice.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage
      ?? '暂时无法删除，请稍后再试'
  } finally {
    deletingId.value = ''
  }
}

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    window.location.assign('/login')
  } finally {
    loggingOut.value = false
  }
}

useSeoMeta({
  title: computed(() => `${profile.value?.account.name ?? '我的星域'} · 星笺`),
  description: '查看你的星笺、私人书写统计与身份信息。',
})
</script>

<template>
  <div class="app-shell profile-page">
    <a class="skip-link" href="#profile-content">跳到个人主页</a>
    <AppHeader />

    <main id="profile-content" class="profile-shell">
      <section class="profile-identity" aria-labelledby="profile-title">
        <div class="profile-orbit" aria-hidden="true">
          <span class="profile-orbit-line"></span>
          <span class="profile-orbit-line profile-orbit-line-secondary"></span>
          <span class="profile-avatar">{{ initial }}</span>
          <span class="profile-satellite"></span>
        </div>

        <div class="profile-intro">
          <p>PRIVATE CONSTELLATION · 私人星域</p>
          <h1 id="profile-title">{{ profile?.account.name }}</h1>
          <p>从 {{ joinedAt }} 开始，你把一些没有说出口的话留在了这里。</p>
          <div class="profile-account-meta">
            <span>{{ profile?.account.email }}</span>
            <span aria-hidden="true">·</span>
            <span>主情绪：{{ dominantEmotion }}</span>
          </div>
        </div>

        <div class="profile-actions">
          <a class="primary-button" href="/diary/new?from=profile">写下此刻 <span aria-hidden="true">↗</span></a>
          <button type="button" :disabled="loggingOut" @click="logout">{{ loggingOut ? '正在离开…' : '退出登录' }}</button>
        </div>
      </section>

      <section class="profile-stat-grid" aria-label="星笺统计">
        <article v-for="(item, index) in statItems" :key="item.label">
          <span>0{{ index + 1 }}</span>
          <strong>{{ String(item.value).padStart(2, '0') }}</strong>
          <p>{{ item.label }}</p>
        </article>
      </section>

      <section class="profile-ledger" aria-labelledby="profile-ledger-title">
        <header>
          <div>
            <p>JOURNAL CONTROL · 日记管理</p>
            <h2 id="profile-ledger-title">管理我的星笺</h2>
          </div>
          <a href="/diary/new?from=profile">新建一篇 <span aria-hidden="true">↗</span></a>
        </header>

        <div v-if="diaries?.items.length" class="profile-diary-list">
          <article v-for="(diary, index) in diaries.items" :key="diary.id" class="profile-diary">
            <span class="profile-diary-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="profile-diary-core" :class="`emotion-${diary.emotion}`"></span>
            <a class="profile-diary-copy" :href="`/diary/${diary.id}?from=profile`">
              <strong>{{ diary.title }}</strong>
              <small>{{ formatDiaryDate(diary.date) }} · {{ diary.status === 'published' ? '已发布' : '草稿' }} · {{ emotionMeta[diary.emotion].label }} · {{ diary.visibility === 'private' ? '仅自己' : diary.visibility === 'anonymous' ? '匿名公开' : diary.visibility === 'friends' ? '旧设置 · 仅自己' : '公开范围' }}</small>
            </a>
            <div class="profile-diary-actions" :aria-label="`管理《${diary.title}》`">
              <a :href="`/diary/${diary.id}?from=profile`">查看</a>
              <a class="edit" :href="`/diary/edit/${diary.id}?from=profile`">再次编辑</a>
              <button type="button" :disabled="Boolean(deletingId)" @click="askToDelete(diary)">删除</button>
            </div>
          </article>

          <nav v-if="diaries.totalPages > 1" class="profile-pagination" aria-label="日记列表分页">
            <button type="button" :disabled="diaryPage <= 1" @click="diaryPage -= 1">上一页</button>
            <span>第 {{ diaries.page }} / {{ diaries.totalPages }} 页</span>
            <button type="button" :disabled="!diaries.hasMore" @click="diaryPage += 1">下一页</button>
          </nav>
        </div>

        <div v-else class="profile-empty">
          <span aria-hidden="true">✦</span>
          <h3>这片星域还很安静</h3>
          <p>无需写得完整，从一句此刻真实的话开始就好。</p>
          <a href="/diary/new?from=profile">写下第一篇星笺</a>
        </div>

        <p v-if="managementNotice" class="management-notice" role="status">{{ managementNotice }}</p>
      </section>
    </main>

    <div v-if="pendingDelete" class="delete-dialog-layer" role="presentation" @click.self="pendingDelete = null">
      <section class="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
        <span class="delete-dialog-mark" aria-hidden="true">✦</span>
        <p>REMOVE FROM CONSTELLATION</p>
        <h2 id="delete-dialog-title">确认删除《{{ pendingDelete.title }}》？</h2>
        <p id="delete-dialog-description">删除后将无法从个人主页或共鸣广场找回，请确认这正是你的决定。</p>
        <div>
          <button type="button" :disabled="Boolean(deletingId)" @click="pendingDelete = null">先保留</button>
          <button class="danger" type="button" :disabled="Boolean(deletingId)" @click="confirmDelete">
            {{ deletingId ? '正在删除…' : '确认删除' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  background:
    radial-gradient(circle at 14% 17%, color-mix(in oklch, var(--color-patina) 9%, transparent), transparent 30rem),
    radial-gradient(circle at 82% 25%, color-mix(in oklch, var(--color-indigo) 13%, transparent), transparent 33rem);
}

.profile-shell {
  width: min(1460px, 100%);
  margin: 0 auto;
  padding: clamp(52px, 7vw, 106px) clamp(24px, 5vw, 76px) 110px;
}

.profile-identity {
  display: grid;
  grid-template-columns: minmax(210px, 0.48fr) minmax(360px, 1fr) auto;
  align-items: center;
  padding-bottom: clamp(58px, 7vw, 94px);
  gap: clamp(28px, 5vw, 82px);
  border-bottom: 1px solid var(--line-subtle);
}

.profile-orbit {
  position: relative;
  display: grid;
  width: min(22vw, 280px);
  aspect-ratio: 1;
  place-items: center;
}

.profile-orbit-line {
  position: absolute;
  inset: 10%;
  border: 1px solid color-mix(in oklch, var(--color-cyan) 38%, transparent);
  border-radius: 50%;
  transform: rotate(-24deg) scaleY(0.52);
}

.profile-orbit-line-secondary {
  inset: 22%;
  border-color: color-mix(in oklch, var(--color-coral) 32%, transparent);
  transform: rotate(38deg) scaleY(0.7);
}

.profile-avatar {
  position: relative;
  z-index: 1;
  display: grid;
  width: 42%;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 47% 53% 44% 56%;
  background:
    radial-gradient(circle at 34% 28%, color-mix(in oklch, var(--color-coral) 82%, white), transparent 26%),
    radial-gradient(circle at 72% 70%, var(--color-cyan), transparent 43%),
    var(--color-indigo);
  box-shadow: 0 0 56px color-mix(in oklch, var(--color-indigo) 42%, transparent);
  color: white;
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 54px);
}

.profile-satellite {
  position: absolute;
  top: 18%;
  right: 12%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-coral);
  box-shadow: 0 0 15px var(--color-coral);
}

.profile-intro > p:first-child,
.profile-ledger header p {
  margin: 0 0 14px;
  color: var(--color-patina);
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.09em;
}

.profile-intro h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(48px, 6vw, 82px);
  font-weight: 500;
  line-height: 1.15;
}

.profile-intro > p:nth-child(3) {
  max-width: 36em;
  margin: 22px 0 0;
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: 17px;
  line-height: 1.8;
}

.profile-account-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 22px;
  gap: 8px;
  color: var(--color-faint);
  font-size: 14px;
}

.profile-actions {
  display: grid;
  min-width: 170px;
  gap: 10px;
}

.profile-actions button {
  min-height: 46px;
  border: 0;
  background: transparent;
  color: var(--color-faint);
  cursor: pointer;
}

.profile-actions button:hover { color: var(--color-ink); }

.profile-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--line-subtle);
}

.profile-stat-grid article {
  position: relative;
  min-height: 188px;
  padding: 34px clamp(20px, 3vw, 44px);
  border-right: 1px solid var(--line-subtle);
}

.profile-stat-grid article:last-child { border-right: 0; }

.profile-stat-grid article > span {
  position: absolute;
  top: 22px;
  right: 22px;
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 13px;
}

.profile-stat-grid strong {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(42px, 5vw, 68px);
  font-weight: 400;
  line-height: 1;
}

.profile-stat-grid p {
  margin: 16px 0 0;
  color: var(--color-muted);
  font-size: 14px;
}

.profile-ledger { padding-top: clamp(56px, 7vw, 90px); }

.profile-ledger > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--line-subtle);
}

.profile-ledger h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(30px, 3.5vw, 46px);
  font-weight: 500;
}

.profile-ledger header a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--color-muted);
  font-size: 14px;
}

.profile-diary {
  display: grid;
  grid-template-columns: 40px 44px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 102px;
  padding: 18px 8px;
  gap: 18px;
  border-bottom: 1px solid var(--line-subtle);
  transition: background 180ms var(--ease-orbit), padding 180ms var(--ease-orbit);
}

.profile-diary:hover {
  padding-right: 16px;
  padding-left: 16px;
  background: color-mix(in oklch, var(--color-ink) 3%, transparent);
}

.profile-diary-index,
.profile-diary-open {
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 13px;
}

.profile-diary-core {
  width: 34px;
  height: 34px;
  border-radius: 47% 53% 43% 57%;
  background: radial-gradient(circle at 32% 28%, var(--color-coral), transparent 28%), var(--color-indigo);
  box-shadow: 0 0 18px color-mix(in oklch, var(--color-indigo) 35%, transparent);
}

.profile-diary-copy { display: grid; min-width: 0; gap: 8px; }
.profile-diary-copy strong {
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-diary-copy small { color: var(--color-faint); font-size: 14px; }

.profile-diary-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.profile-diary-actions a,
.profile-diary-actions button,
.profile-pagination button {
  display: inline-flex;
  min-height: 44px;
  padding: 0 14px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-subtle);
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.profile-diary-actions .edit {
  border-color: color-mix(in oklch, var(--color-cyan) 36%, var(--line-subtle));
  color: var(--color-cyan);
}

.profile-diary-actions button:hover { color: var(--color-coral); }
.profile-diary-actions a:hover,
.profile-pagination button:hover:not(:disabled) { border-color: var(--color-cyan); color: var(--color-ink); }
.profile-diary-actions button:disabled,
.profile-pagination button:disabled { cursor: not-allowed; opacity: 0.42; }

.profile-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 28px;
  gap: 14px;
  color: var(--color-faint);
  font-size: 14px;
}

.management-notice {
  margin: 22px 0 0;
  color: var(--color-patina);
  text-align: center;
}

.delete-dialog-layer {
  position: fixed;
  z-index: 80;
  display: grid;
  inset: 0;
  padding: 20px;
  place-items: center;
  background: color-mix(in oklch, var(--color-night) 76%, transparent);
  backdrop-filter: blur(12px);
}

.delete-dialog {
  width: min(520px, 100%);
  padding: clamp(30px, 5vw, 50px);
  border: 1px solid color-mix(in oklch, var(--color-coral) 28%, var(--line-subtle));
  border-radius: 28px;
  background: color-mix(in oklch, var(--color-night) 94%, var(--color-indigo));
  box-shadow: 0 30px 90px color-mix(in oklch, black 52%, transparent);
  text-align: center;
}

.delete-dialog-mark { color: var(--color-coral); font-size: 26px; }
.delete-dialog > p:first-of-type {
  margin: 14px 0 10px;
  color: var(--color-coral);
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
}
.delete-dialog h2 { margin: 0; font-family: var(--font-display); font-size: clamp(25px, 4vw, 36px); font-weight: 500; }
.delete-dialog > p:last-of-type { margin: 18px auto 0; color: var(--color-muted); line-height: 1.75; }
.delete-dialog > div { display: flex; justify-content: center; margin-top: 30px; gap: 10px; }
.delete-dialog button {
  min-width: 120px;
  min-height: 46px;
  border: 1px solid var(--line-subtle);
  border-radius: 999px;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
}
.delete-dialog button.danger { border-color: color-mix(in oklch, var(--color-coral) 54%, transparent); background: color-mix(in oklch, var(--color-coral) 14%, transparent); color: var(--color-coral); }
.delete-dialog button:disabled { cursor: wait; opacity: 0.58; }

.profile-empty {
  display: grid;
  min-height: 290px;
  place-items: center;
  align-content: center;
  gap: 10px;
  text-align: center;
}
.profile-empty > span { color: var(--color-patina); font-size: 28px; }
.profile-empty h3 { margin: 0; font-family: var(--font-display); font-size: 25px; font-weight: 500; }
.profile-empty p { margin: 0; color: var(--color-muted); }
.profile-empty a { display: inline-flex; min-height: 44px; align-items: center; color: var(--color-cyan); }

@media (max-width: 920px) {
  .profile-identity { grid-template-columns: 180px minmax(0, 1fr); }
  .profile-orbit { width: 180px; }
  .profile-actions { grid-column: 2; grid-template-columns: auto auto; justify-content: start; }
}

@media (max-width: 680px) {
  .profile-shell { padding: 48px 18px 88px; }
  .profile-identity { display: block; }
  .profile-orbit { width: 150px; margin-bottom: 28px; }
  .profile-intro h1 { font-size: 48px; }
  .profile-actions { display: flex; margin-top: 30px; }
  .profile-stat-grid { grid-template-columns: repeat(2, 1fr); }
  .profile-stat-grid article { min-height: 150px; border-bottom: 1px solid var(--line-subtle); }
  .profile-stat-grid article:nth-child(2) { border-right: 0; }
  .profile-diary { grid-template-columns: 34px minmax(0, 1fr); gap: 12px; }
  .profile-diary-index { display: none; }
  .profile-diary-actions { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; }
  .profile-diary-actions a,
  .profile-diary-actions button { flex: 1; padding: 0 10px; }
  .profile-ledger > header { align-items: flex-start; flex-direction: column; }
}
</style>
