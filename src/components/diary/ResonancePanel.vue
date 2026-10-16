<script setup lang="ts">
import { ref } from 'vue'

type ResonanceType = 'glow' | 'hug' | 'together' | 'same-experience'
type ResonanceState = {
  summary: string
  selectedType: ResonanceType | null
  canResonate: boolean
  requiresLogin: boolean
}

const props = defineProps<{
  diaryId: string
}>()

const emit = defineEmits<{
  pulse: [type: ResonanceType]
}>()
const loginHref = `/login?redirect=${encodeURIComponent(`/diary/${props.diaryId}`)}`

const options: Array<{ type: ResonanceType; label: string; description: string; symbol: string }> = [
  { type: 'glow', label: '微光', description: '我读见了你', symbol: '✦' },
  { type: 'hug', label: '抱抱', description: '给此刻一点温暖', symbol: '◐' },
  { type: 'together', label: '同行', description: '这段路并不孤单', symbol: '∞' },
  { type: 'same-experience', label: '我也经历过', description: '我在文字里认出了自己', symbol: '○' },
]

const busy = ref(false)
const feedback = ref('')
const { data, status, error, refresh } = await useFetch<ResonanceState>(`/api/resonance/${props.diaryId}`)

async function choose(type: ResonanceType) {
  if (busy.value || !data.value?.canResonate) return
  busy.value = true
  feedback.value = ''
  try {
    if (data.value.selectedType === type) {
      data.value = await $fetch<ResonanceState>(`/api/resonance/${props.diaryId}`, { method: 'DELETE' })
      feedback.value = '这束共鸣已轻轻收回'
    } else {
      data.value = await $fetch<ResonanceState>(`/api/resonance/${props.diaryId}`, {
        method: 'POST',
        body: { type },
      })
      feedback.value = `已留下${options.find((option) => option.type === type)?.label}`
      emit('pulse', type)
    }
  } catch {
    feedback.value = '共鸣暂时没有送达，请稍后再试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <aside class="resonance-panel" aria-labelledby="resonance-title">
    <header>
      <p>温和回应</p>
      <h2 id="resonance-title">不必评价，只需让对方知道有人读见。</h2>
    </header>

    <div v-if="status === 'pending'" class="resonance-loading" aria-label="正在读取共鸣">
      <span></span><span></span><span></span>
    </div>

    <div v-else-if="error" class="resonance-error" role="alert">
      <p>共鸣暂时没有抵达。</p>
      <button type="button" @click="refresh()">重新接收</button>
    </div>

    <template v-else-if="data">
      <p class="resonance-summary">{{ data.summary }}</p>

      <div v-if="data.requiresLogin" class="own-diary-note">
        <span aria-hidden="true">✦</span>
        <p>登录后可以留下真实共鸣。<a :href="loginHref">前往登录</a></p>
      </div>

      <div v-else-if="data.canResonate" class="resonance-options" role="group" aria-label="选择共鸣方式">
        <button
          v-for="option in options"
          :key="option.type"
          type="button"
          :class="{ selected: data.selectedType === option.type }"
          :aria-pressed="data.selectedType === option.type"
          :disabled="busy"
          @click="choose(option.type)"
        >
          <span class="resonance-symbol" aria-hidden="true">{{ option.symbol }}</span>
          <span>
            <strong>{{ option.label }}</strong>
            <small>{{ option.description }}</small>
          </span>
          <svg v-if="data.selectedType === option.type" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 12 4 4 8-9" />
          </svg>
        </button>
      </div>

      <div v-else class="own-diary-note">
        <span aria-hidden="true">○</span>
        <p>这是你的星笺。它已经被好好留在星域里。</p>
      </div>

      <p class="resonance-privacy">共鸣只传递类型，不公开你的身份，也不形成点赞排行。</p>
      <p class="sr-only" role="status" aria-live="polite">{{ feedback }}</p>
      <Transition name="resonance-feedback">
        <p v-if="feedback" class="resonance-feedback" aria-hidden="true">{{ feedback }}</p>
      </Transition>
    </template>
  </aside>
</template>
