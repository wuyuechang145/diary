import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { DiaryCategory, DiaryPerspective } from '@/types/diary'

export type Visibility = 'private' | 'friends' | 'anonymous' | 'public'
export type EmotionKey = 'calm' | 'gentle' | 'longing' | 'courage' | 'tension' | 'sadness' | 'unspecified'

export type DraftAttachment = {
  id: string
  type: 'image' | 'audio'
  name: string
}

export type DiaryDraft = {
  id: string
  serverId?: string
  date: string
  title: string
  content: string
  emotion: EmotionKey
  perspective: DiaryPerspective
  category: DiaryCategory
  visibility: Visibility
  userEditedEmotion: boolean
  attachments: DraftAttachment[]
  location?: string
  createdAt: string
  updatedAt: string
}

type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'error'

function createDraft(date?: string): DiaryDraft {
  const now = new Date().toISOString()
  return {
    id: `new:${now}`,
    date: date ?? now.slice(0, 10),
    title: '',
    content: '',
    emotion: 'unspecified',
    perspective: 'unspecified',
    category: 'unspecified',
    visibility: 'private',
    userEditedEmotion: false,
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function useDiaryDraft(requestedDate?: string, initialDraft?: Partial<DiaryDraft>) {
  const draft: Ref<DiaryDraft> = ref({
    ...createDraft(requestedDate),
    ...initialDraft,
    date: requestedDate ?? initialDraft?.date ?? new Date().toISOString().slice(0, 10),
    visibility: initialDraft?.visibility === 'friends' ? 'private' : initialDraft?.visibility ?? 'private',
    attachments: initialDraft?.attachments ? [...initialDraft.attachments] : [],
  })
  const status = ref<SaveStatus>(initialDraft?.serverId ? 'saved' : 'unsaved')
  const lastSavedAt = ref<Date | null>(initialDraft?.updatedAt ? new Date(initialDraft.updatedAt) : null)
  const isDirty = ref(false)
  const isOffline = ref(false)
  let replacing = false

  const lastSavedLabel = computed(() => {
    if (status.value === 'saving') return '正在保存到服务器'
    if (status.value === 'error') return '保存失败，当前内容尚未同步'
    if (isOffline.value) return '当前离线，点击保存后才能同步'
    if (isDirty.value) return '有未保存的更改'
    if (lastSavedAt.value) {
      return `已保存到服务器 ${lastSavedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    }
    return '未保存 · 点击保存才会写入账户'
  })

  watch(draft, () => {
    if (replacing) return
    isDirty.value = true
    status.value = 'unsaved'
  }, { deep: true, flush: 'sync' })

  function restoreDraft(value: Partial<DiaryDraft>) {
    replacing = true
    draft.value = {
      ...createDraft(requestedDate),
      ...value,
      date: value.date ?? requestedDate ?? new Date().toISOString().slice(0, 10),
      visibility: value.visibility === 'friends' ? 'private' : value.visibility ?? 'private',
      attachments: value.attachments ? [...value.attachments] : [],
    }
    replacing = false
    lastSavedAt.value = value.updatedAt ? new Date(value.updatedAt) : null
    isDirty.value = false
    status.value = 'saved'
  }

  function markSaving() {
    status.value = 'saving'
  }

  function markSaved(updatedAt: string, matchesCurrentContent: boolean) {
    lastSavedAt.value = new Date(updatedAt)
    isDirty.value = !matchesCurrentContent
    status.value = matchesCurrentContent ? 'saved' : 'unsaved'
  }

  function markError() {
    status.value = 'error'
    isDirty.value = true
  }

  function updateNetworkStatus() {
    isOffline.value = !navigator.onLine
  }

  function confirmBeforeLeaving(event: BeforeUnloadEvent) {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => {
    updateNetworkStatus()
    window.addEventListener('online', updateNetworkStatus)
    window.addEventListener('offline', updateNetworkStatus)
    window.addEventListener('beforeunload', confirmBeforeLeaving)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', updateNetworkStatus)
    window.removeEventListener('offline', updateNetworkStatus)
    window.removeEventListener('beforeunload', confirmBeforeLeaving)
  })

  return { draft, status, lastSavedLabel, isOffline, isDirty, restoreDraft, markSaving, markSaved, markError }
}
