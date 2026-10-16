<script setup lang="ts">
import DiaryNewView from '~/views/DiaryNewView.vue'
import type { SessionState } from '~/types/auth'
import type { DiaryDetail } from '~/types/diary'

const route = useRoute()
const diaryId = String(route.params.id)
const editPath = `/diary/edit/${encodeURIComponent(diaryId)}`
const { data: session } = await useFetch<SessionState>('/api/session')

if (!session.value?.isAuthenticated) {
  await navigateTo(`/login?redirect=${encodeURIComponent(editPath)}`, { redirectCode: 302 })
}

const { data: diary, error } = await useFetch<DiaryDetail>(`/api/diaries/${diaryId}`)
if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    statusMessage: error.value.statusMessage ?? '没有找到这篇星笺',
  })
}
if (diary.value && !diary.value.isOwner) {
  await navigateTo('/profile', { redirectCode: 302 })
}

useSeoMeta({
  title: () => diary.value ? `编辑《${diary.value.title}》· 星笺` : '编辑星笺',
  description: '继续修改自己写下的星笺。',
})
</script>

<template>
  <DiaryNewView
    v-if="session?.isAuthenticated && diary?.isOwner"
    :initial-diary="diary"
  />
</template>
