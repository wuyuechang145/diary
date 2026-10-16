<script setup lang="ts">
import DiaryNewView from '~/views/DiaryNewView.vue'
import type { SessionState } from '~/types/auth'
import type { SavedDraftPreview } from '~/types/diary'
import { safeLocalRedirect } from '~/utils/navigation'

const route = useRoute()
const { data: session } = await useFetch<SessionState>('/api/session')
if (!session.value?.isAuthenticated) {
  const destination = safeLocalRedirect(route.fullPath, '/diary/new')
  await navigateTo(`/login?redirect=${encodeURIComponent(destination)}`, { redirectCode: 302 })
}
const { data: savedDraft } = await useFetch<SavedDraftPreview | null>('/api/diaries/latest-draft', {
  immediate: Boolean(session.value?.isAuthenticated),
})
</script>

<template>
  <DiaryNewView v-if="session?.isAuthenticated" :saved-draft="savedDraft" />
</template>
