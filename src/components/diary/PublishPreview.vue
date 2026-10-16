<script setup lang="ts">
import { ref } from 'vue'
import type { DiaryDraft, Visibility } from '@/composables/useDiaryDraft'
import { categoryMeta, emotionMeta, perspectiveMeta } from '@/types/diary'
import PrivacySelector from '@/components/app/PrivacySelector.vue'

const props = defineProps<{
  draft: DiaryDraft
}>()

const emit = defineEmits<{
  'update:visibility': [value: Visibility]
  publish: []
}>()

const dialog = ref<HTMLDialogElement | null>(null)

function show() {
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

defineExpose({ show, close })
</script>

<template>
  <dialog ref="dialog" class="publish-preview" @cancel="close">
    <div class="publish-preview-shell">
      <header class="publish-preview-header">
        <button type="button" class="preview-close" aria-label="关闭发布预览" @click="close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <p>发布前预览</p>
        <span>{{ draft.date }}</span>
      </header>

      <div class="publish-preview-content">
        <div class="preview-diary">
          <div class="preview-static-core" aria-hidden="true"><span></span></div>
          <p class="preview-emotion">
            {{ draft.emotion === 'unspecified' ? '你没有为这篇日记选择情绪；' : `你主动选择以「${emotionMeta[draft.emotion].label}」记录此刻；` }}星笺不会根据正文推断年龄、身份、心理状态或家庭关系。
          </p>
          <dl class="preview-classification" aria-label="日记分类">
            <div>
              <dt>作者视角</dt>
              <dd>{{ perspectiveMeta[draft.perspective].label }}</dd>
            </div>
            <div>
              <dt>内容主题</dt>
              <dd>{{ categoryMeta[draft.category].label }}</dd>
            </div>
          </dl>
          <h2>{{ draft.title || '未命名的这一刻' }}</h2>
          <p class="preview-body">{{ draft.content || '正文仍是空白。回去写下一句话，再来看看它会变成什么。' }}</p>
          <ul v-if="draft.location" class="preview-attachments">
            <li v-if="draft.location">{{ draft.location }}</li>
          </ul>
        </div>

        <aside class="publish-confirmation">
          <p class="confirmation-title">谁能看见这篇日记</p>
          <PrivacySelector
            :model-value="props.draft.visibility"
            compact
            @update:model-value="emit('update:visibility', $event)"
          />
          <p class="publish-note">
            发布后仍可随时更改可见范围。公开前请勿填写真实姓名、学校、联系方式和精确住址，并检查正文与附件是否包含可识别身份的信息。
          </p>
          <button type="button" class="primary-button publish-confirm-button" @click="emit('publish')">
            确认发布
          </button>
          <button type="button" class="text-button preview-return" @click="close">返回继续修改</button>
        </aside>
      </div>
    </div>
  </dialog>
</template>
