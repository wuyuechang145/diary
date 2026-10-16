<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import PrivacySelector from '@/components/app/PrivacySelector.vue'
import PublishPreview from '@/components/diary/PublishPreview.vue'
import EmotionScene from '@/components/three/EmotionScene.client.vue'
import {
  categoryMeta,
  emotionMeta,
  perspectiveMeta,
  type DiaryCategory,
  type DiaryDetail,
  type DiaryPerspective,
  type SavedDraftPreview,
} from '@/types/diary'
import {
  useDiaryDraft,
  type EmotionKey,
  type Visibility,
} from '@/composables/useDiaryDraft'

const route = useRoute()
const props = defineProps<{ initialDiary?: DiaryDetail; savedDraft?: SavedDraftPreview | null }>()
const dateParam = typeof route.query.date === 'string' ? route.query.date : ''
const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T12:00:00Z`) : null
const requestedDate = parsedDate && !Number.isNaN(parsedDate.getTime())
  && parsedDate.toISOString().slice(0, 10) === dateParam ? dateParam : undefined
const initialDraft = props.initialDiary
  ? {
      serverId: props.initialDiary.id,
      date: props.initialDiary.date,
      title: props.initialDiary.title,
      content: props.initialDiary.content,
      emotion: props.initialDiary.emotion,
      perspective: props.initialDiary.perspective,
      category: props.initialDiary.category,
      visibility: props.initialDiary.visibility,
      attachments: props.initialDiary.attachments,
      location: props.initialDiary.location,
      createdAt: props.initialDiary.createdAt,
      updatedAt: props.initialDiary.updatedAt,
      userEditedEmotion: true,
    }
  : undefined
const { draft, status, lastSavedLabel, isOffline, restoreDraft, markSaving, markSaved, markError } = useDiaryDraft(requestedDate, initialDraft)

const editor = ref<HTMLTextAreaElement | null>(null)
const locationEditor = ref<HTMLInputElement | null>(null)
const locationInput = ref('')
const showLocationEditor = ref(false)
const preview = ref<InstanceType<typeof PublishPreview> | null>(null)
const notice = ref('')
const serverSyncing = ref(false)
const restoreDialog = ref<HTMLDialogElement | null>(null)
const restoring = ref(false)
const restoreError = ref('')
const currentServerStatus = ref<'draft' | 'published'>(props.initialDiary?.status ?? 'draft')
const serverVersion = ref(props.initialDiary?.updatedAt)
const titleGenerating = ref(false)
const titleSuggestions = ref<TitleSuggestion[]>([])
const titleSuggestionError = ref('')
let noticeTimer: number | undefined

type ServerDiary = {
  id: string
  updatedAt: string
}

type TitleTone = 'plain' | 'imagery' | 'restrained'
type TitleSuggestion = {
  title: string
  tone: TitleTone
}

type TitleSuggestionResponse = {
  suggestions: TitleSuggestion[]
}

const titleToneLabels: Record<TitleTone, { label: string; description: string }> = {
  plain: { label: '白描', description: '保留事情原本的样子' },
  imagery: { label: '意象', description: '让感受落进一个画面' },
  restrained: { label: '留白', description: '把没说完的留给读者' },
}

const emotionOptions: Array<{ value: EmotionKey; label: string; description: string; symbol: string }> = [
  { value: 'calm', label: '平静', description: '呼吸缓慢而清澈', symbol: '○' },
  { value: 'gentle', label: '温柔', description: '带一点温暖内光', symbol: '◐' },
  { value: 'longing', label: '想念', description: '轨道向远处延伸', symbol: '⌒' },
  { value: 'courage', label: '勇气', description: '核心稳定地亮起', symbol: '✦' },
  { value: 'tension', label: '压力', description: '表面更紧、更敏锐', symbol: '◇' },
  { value: 'sadness', label: '难过', description: '运动变慢并下沉', symbol: '◒' },
]

const perspectiveOptions: DiaryPerspective[] = ['teen', 'parent', 'family', 'unspecified']
const categoryOptions: DiaryCategory[] = [
  'daily-life',
  'growth-conflict',
  'pressure',
  'communication',
  'expectation-responsibility',
  'understanding-gratitude',
  'unspecified',
]

const wordCount = computed(() => draft.value.content.replace(/\s/g, '').length)
const isEditing = computed(() => Boolean(props.initialDiary))
const visibilityLabels: Record<Visibility, string> = {
  private: '仅自己可见',
  friends: '旧设置 · 仅自己可见',
  anonymous: '匿名公开',
  public: '公开并显示身份',
}
const visibilityLabel = computed(() => visibilityLabels[draft.value.visibility])
const returnPath = computed(() => {
  const source = typeof route.query.from === 'string' ? route.query.from : ''
  if (source === 'profile') return '/profile'
  if (source === 'constellation') return '/constellation'
  if (source === 'explore') return '/explore'
  return isEditing.value ? '/profile' : '/'
})
const returnLabel = computed(() => ({
  '/profile': '返回个人主页',
  '/constellation': '返回情绪星图',
  '/explore': '返回共鸣广场',
  '/': '返回首页',
} as Record<string, string>)[returnPath.value] ?? '返回')
const displayDate = computed(() => {
  const value = new Date(`${draft.value.date}T12:00:00`)
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(value)
})

function resizeEditor() {
  if (!editor.value) return
  editor.value.style.height = 'auto'
  editor.value.style.height = `${Math.max(320, editor.value.scrollHeight)}px`
}

watch(
  () => draft.value.content,
  () => void nextTick(resizeEditor),
)

function selectEmotion(value: EmotionKey) {
  draft.value.emotion = value
  draft.value.userEditedEmotion = true
}

function showNotice(message: string) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 3200)
}

function requestErrorMessage(error: unknown) {
  const candidate = error as {
    data?: { statusMessage?: string; message?: string }
    statusMessage?: string
  }
  return candidate.data?.statusMessage
    ?? candidate.data?.message
    ?? candidate.statusMessage
    ?? '标题暂时没有生成，你可以继续自己写'
}

async function generateTitleSuggestions() {
  if (titleGenerating.value) return
  if (!draft.value.content.trim()) {
    showNotice('先写下一点正文，再为这颗星命名')
    editor.value?.focus()
    return
  }

  titleGenerating.value = true
  titleSuggestionError.value = ''
  try {
    const result = await $fetch<TitleSuggestionResponse>('/api/ai/title-suggestions', {
      method: 'POST',
      body: {
        content: draft.value.content,
        emotion: draft.value.emotion,
        perspective: draft.value.perspective,
        category: draft.value.category,
      },
    })
    titleSuggestions.value = result.suggestions
  } catch (error) {
    titleSuggestionError.value = requestErrorMessage(error)
  } finally {
    titleGenerating.value = false
  }
}

function chooseTitle(suggestion: TitleSuggestion) {
  draft.value.title = suggestion.title
  showNotice(`已选用「${suggestion.title}」，仍可继续修改`)
}

async function goBack() {
  window.location.assign(returnPath.value)
}

onMounted(() => {
  if (!isEditing.value && props.savedDraft) restoreDialog.value?.showModal()
})

async function useSavedDraft() {
  if (!props.savedDraft || restoring.value) return
  restoring.value = true
  restoreError.value = ''
  try {
    const previous = await $fetch<DiaryDetail>(`/api/diaries/${props.savedDraft.id}`)
    if (!previous.isOwner || previous.status !== 'draft') throw new Error('草稿已不再可用')
    restoreDraft({
      serverId: previous.id,
      date: previous.date,
      title: previous.title,
      content: previous.content,
      emotion: previous.emotion,
      perspective: previous.perspective,
      category: previous.category,
      visibility: previous.visibility,
      attachments: previous.attachments,
      location: previous.location,
      createdAt: previous.createdAt,
      updatedAt: previous.updatedAt,
      userEditedEmotion: true,
    })
    serverVersion.value = previous.updatedAt
    restoreDialog.value?.close()
    await nextTick()
    resizeEditor()
    editor.value?.focus()
  } catch {
    restoreError.value = '上次保存的草稿暂时无法打开。你仍可从空白页开始。'
  } finally {
    restoring.value = false
  }
}

function serverPayload(publishStatus: 'draft' | 'published') {
  return {
    date: draft.value.date,
    title: draft.value.title,
    content: draft.value.content,
    emotion: draft.value.emotion,
    perspective: draft.value.perspective,
    category: draft.value.category,
    visibility: draft.value.visibility,
    status: publishStatus,
    attachments: [],
    location: draft.value.location,
  }
}

async function persistToServer(publishStatus: 'draft' | 'published') {
  if (serverSyncing.value) return undefined
  const payload = serverPayload(publishStatus)
  serverSyncing.value = true
  markSaving()
  try {
    let saved: ServerDiary
    if (draft.value.serverId) {
      saved = await $fetch<ServerDiary>(`/api/diaries/${draft.value.serverId}`, {
        method: 'PUT',
        body: { ...payload, expectedUpdatedAt: serverVersion.value },
      })
    } else {
      saved = await $fetch<ServerDiary>('/api/diaries', {
        method: 'POST',
        body: payload,
      })
    }
    draft.value.serverId = saved.id
    serverVersion.value = saved.updatedAt
    currentServerStatus.value = publishStatus
    markSaved(saved.updatedAt, JSON.stringify(serverPayload(publishStatus)) === JSON.stringify(payload))
    return saved.id
  } catch (error) {
    markError()
    const statusCode = (error as { statusCode?: number; status?: number }).statusCode
      ?? (error as { status?: number }).status
    showNotice(statusCode === 409
      ? '另一处已经修改这篇日记；本页文字尚未覆盖服务器，请先复制后核对最新版本'
      : '保存失败，当前内容尚未写入服务器，请留在本页重试')
    return undefined
  } finally {
    serverSyncing.value = false
  }
}

async function saveDiary() {
  const saved = await persistToServer(currentServerStatus.value)
  if (saved) showNotice(currentServerStatus.value === 'published' ? '修改已保存到服务器' : '草稿已保存到服务器')
}

async function openPublishPreview() {
  if (!draft.value.content.trim()) {
    showNotice('先写下一句话，再预览这颗心象')
    editor.value?.focus()
    return
  }
  preview.value?.show()
}

async function publishDiary() {
  const id = await persistToServer('published')
  if (!id) return
  preview.value?.close()
  window.location.assign(`/diary/${encodeURIComponent(id)}?from=profile`)
}

async function openLocationEditor() {
  locationInput.value = draft.value.location ?? ''
  showLocationEditor.value = true
  await nextTick()
  locationEditor.value?.focus()
}

function saveLocation() {
  const value = locationInput.value.trim().slice(0, 80)
  draft.value.location = value || undefined
  showLocationEditor.value = false
}

function removeLocation() {
  draft.value.location = undefined
  locationInput.value = ''
  showLocationEditor.value = false
}
</script>

<template>
  <div class="editor-page">
    <a class="skip-link" href="#diary-editor">跳到日记正文</a>

    <header class="editor-header">
      <div class="editor-header-left">
        <button type="button" class="editor-back" :aria-label="returnLabel" @click="goBack">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <a class="editor-brand" href="/">星笺</a>
        <span class="editor-divider"></span>
        <strong v-if="isEditing" class="editor-mode">编辑星笺</strong>
        <p :class="['save-state', `save-state-${status}`]" role="status">
          <span aria-hidden="true"></span>
          {{ lastSavedLabel }}
          <small v-if="isOffline">请联网后保存</small>
        </p>
      </div>

      <div class="editor-header-actions">
        <span class="current-visibility">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="10" width="12" height="9" rx="2" />
            <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
          </svg>
          {{ visibilityLabel }}
        </span>
        <button type="button" class="editor-save-button" :disabled="serverSyncing" @click="saveDiary">
          {{ serverSyncing ? '同步中' : isEditing ? '保存修改' : '保存' }}
        </button>
        <button type="button" class="primary-button editor-preview-button" :disabled="serverSyncing" @click="openPublishPreview">
          预览并发布
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
    </header>

    <main class="diary-workbench">
      <aside class="emotion-control" aria-labelledby="emotion-control-title">
        <div class="workbench-section-heading">
          <p id="emotion-control-title" class="section-title">此刻更接近</p>
          <button
            v-if="draft.userEditedEmotion"
            type="button"
            class="reset-suggestion"
            @click="draft.userEditedEmotion = false; draft.emotion = 'unspecified'"
          >
            恢复建议
          </button>
        </div>
        <p class="emotion-guidance">这只是视觉建议，不是对你的判断。随时可以修改或忽略。</p>

        <fieldset class="emotion-options">
          <legend class="sr-only">选择此刻的情绪</legend>
          <label
            v-for="emotion in emotionOptions"
            :key="emotion.value"
            :class="['emotion-option', { selected: draft.emotion === emotion.value }]"
          >
            <input
              type="radio"
              name="emotion"
              :value="emotion.value"
              :checked="draft.emotion === emotion.value"
              @change="selectEmotion(emotion.value)"
            />
            <span class="emotion-symbol" aria-hidden="true">{{ emotion.symbol }}</span>
            <span>
              <strong>{{ emotion.label }}</strong>
              <small>{{ emotion.description }}</small>
            </span>
            <svg v-if="draft.emotion === emotion.value" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 12 4 4 8-9" />
            </svg>
          </label>
        </fieldset>

        <section class="story-classification" aria-labelledby="story-classification-title">
          <div class="workbench-section-heading">
            <p id="story-classification-title" class="section-title">这篇想讲什么</p>
          </div>
          <p class="classification-guidance">由你主动选择，只帮助家人找到愿意倾听的文字。</p>

          <fieldset class="perspective-options">
            <legend>我从哪个位置说</legend>
            <label
              v-for="perspective in perspectiveOptions"
              :key="perspective"
              :class="['perspective-option', { selected: draft.perspective === perspective }]"
            >
              <input v-model="draft.perspective" type="radio" name="perspective" :value="perspective" />
              <span aria-hidden="true">{{ draft.perspective === perspective ? '✓' : '○' }}</span>
              <span>
                <strong>{{ perspectiveMeta[perspective].label }}</strong>
                <small>{{ perspectiveMeta[perspective].description }}</small>
              </span>
            </label>
          </fieldset>

          <label class="category-field">
            <span>这次主要在经历</span>
            <select v-model="draft.category" aria-describedby="category-help">
              <option v-for="category in categoryOptions" :key="category" :value="category">
                {{ categoryMeta[category].label }}
              </option>
            </select>
          </label>
          <p id="category-help" class="category-help">{{ categoryMeta[draft.category].description }}</p>
        </section>

        <div class="privacy-block">
          <div class="workbench-section-heading">
            <p class="section-title">谁能看见</p>
          </div>
          <PrivacySelector v-model="draft.visibility" />
        </div>
      </aside>

      <section id="diary-editor" class="writing-space" aria-labelledby="writing-title">
        <div class="writing-date">
          <span>{{ displayDate }}</span>
          <span>{{ draft.location || '未添加地点' }}</span>
        </div>
        <h1 id="writing-title" class="sr-only">写下此刻</h1>
        <div class="diary-title-composer">
          <input
            v-model="draft.title"
            class="diary-title-input"
            type="text"
            maxlength="60"
            aria-label="日记标题"
            placeholder="今晚，风把云吹得很慢"
          />
          <button
            type="button"
            class="title-naming-button"
            :disabled="titleGenerating"
            :aria-busy="titleGenerating"
            @click="generateTitleSuggestions"
          >
            <span aria-hidden="true">✦</span>
            {{ titleGenerating ? '正在听这段文字' : '给这颗星命名' }}
          </button>
        </div>

        <p class="title-ai-privacy">
          只有点击时才会把正文发送给标题生成服务；账户、地点和附件不会发送。
        </p>

        <Transition name="title-orbit">
          <section
            v-if="titleSuggestions.length"
            class="title-suggestion-orbit"
            aria-labelledby="title-suggestion-heading"
            aria-live="polite"
          >
            <header>
              <div>
                <span>THREE POSSIBLE NAMES</span>
                <h2 id="title-suggestion-heading">这段文字可能叫作</h2>
              </div>
              <button type="button" :disabled="titleGenerating" @click="generateTitleSuggestions">换一组</button>
            </header>
            <div class="title-suggestion-list">
              <button
                v-for="suggestion in titleSuggestions"
                :key="`${suggestion.tone}:${suggestion.title}`"
                type="button"
                :class="['title-suggestion', `tone-${suggestion.tone}`]"
                @click="chooseTitle(suggestion)"
              >
                <span>{{ titleToneLabels[suggestion.tone].label }}</span>
                <strong>{{ suggestion.title }}</strong>
                <small>{{ titleToneLabels[suggestion.tone].description }}</small>
              </button>
            </div>
          </section>
        </Transition>

        <p v-if="titleSuggestionError" class="title-suggestion-error" role="alert">
          {{ titleSuggestionError }}
          <button type="button" @click="generateTitleSuggestions">重新试一次</button>
        </p>
        <textarea
          ref="editor"
          v-model="draft.content"
          class="diary-body-input"
          aria-label="日记正文"
          placeholder="从一句话开始……"
          @input="resizeEditor"
        ></textarea>

        <div v-if="draft.location" class="editor-attachments" aria-label="已添加的地点">
          <span v-if="draft.location">
            地点 · {{ draft.location }}
            <button type="button" aria-label="移除地点" @click="removeLocation">×</button>
          </span>
        </div>

        <form v-if="showLocationEditor" class="location-editor" @submit.prevent="saveLocation">
          <label for="diary-location">地点只在你主动填写时保存</label>
          <div>
            <input id="diary-location" ref="locationEditor" v-model="locationInput" type="text" maxlength="80" placeholder="填写城市或模糊地点，请勿填写精确住址" />
            <button type="submit">确认</button>
            <button type="button" @click="showLocationEditor = false">取消</button>
          </div>
        </form>

        <footer class="editor-toolbar">
          <div class="media-tools">
            <button :class="{ active: draft.location }" type="button" @click="openLocationEditor">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
              地点
            </button>
          </div>
          <div class="editor-count"><span>{{ wordCount }}</span> 字</div>
        </footer>
      </section>

      <aside class="live-imagery" aria-labelledby="imagery-title">
        <div class="imagery-heading">
          <div>
            <p>实时心象</p>
            <h2 id="imagery-title">文字之外的第二语言</h2>
          </div>
          <span>自动更新</span>
        </div>

        <div class="editor-scene-wrap">
          <ClientOnly>
            <EmotionScene
              :emotion="draft.emotion"
              :perspective="draft.perspective"
              :category="draft.category"
              variant="planetary"
              interactive-label="当前日记的心象预览"
            />
            <template #fallback>
              <div class="emotion-scene emotion-scene--planetary" aria-hidden="true">
                <div class="static-core loading"><span></span></div>
              </div>
            </template>
          </ClientOnly>
        </div>

        <p class="imagery-sentence">{{ emotionMeta[draft.emotion].sentence }}</p>
        <dl class="emotion-metrics">
          <div>
            <dt>主要感受</dt>
            <dd>{{ emotionMeta[draft.emotion].label }}</dd>
          </div>
          <div>
            <dt>作者视角</dt>
            <dd>{{ perspectiveMeta[draft.perspective].label }}</dd>
          </div>
          <div>
            <dt>内容主题</dt>
            <dd>{{ categoryMeta[draft.category].label }}</dd>
          </div>
          <div>
            <dt>当前字数</dt>
            <dd>{{ wordCount }}</dd>
          </div>
        </dl>
        <p class="imagery-note">心象会在你完成一个自然段后平缓更新，不会跟随每个字符跳动。</p>
      </aside>
    </main>

    <PublishPreview
      ref="preview"
      :draft="draft"
      @update:visibility="draft.visibility = $event"
      @publish="publishDiary"
    />

    <dialog ref="restoreDialog" class="draft-restore-dialog" aria-labelledby="draft-restore-title" aria-describedby="draft-restore-description">
      <span class="draft-restore-mark" aria-hidden="true">✦</span>
      <h2 id="draft-restore-title">继续上次保存的草稿吗？</h2>
      <p id="draft-restore-description">
        你在 {{ savedDraft ? new Date(savedDraft.updatedAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }}
        主动保存过《{{ savedDraft?.title }}》。只有选择继续，才会把它载入编辑框。
      </p>
      <p class="draft-restore-hint">从空白开始不会删除这篇草稿，你仍能在个人主页找到它。新的文字也只会在点击“保存”或“确认发布”后写入服务器。</p>
      <p v-if="restoreError" class="draft-restore-error" role="alert">{{ restoreError }}</p>
      <div class="draft-restore-actions">
        <button type="button" :disabled="restoring" @click="restoreDialog?.close()">从空白开始</button>
        <button type="button" class="primary-button" :disabled="restoring" @click="useSavedDraft">
          {{ restoring ? '正在载入…' : '继续上次草稿' }}
        </button>
      </div>
    </dialog>

    <Transition name="notice">
      <p v-if="notice" class="stage-notice editor-notice" role="status">{{ notice }}</p>
    </Transition>
  </div>
</template>
