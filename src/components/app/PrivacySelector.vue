<script setup lang="ts">
import { useId } from 'vue'
import type { Visibility } from '@/composables/useDiaryDraft'

withDefaults(
  defineProps<{
    modelValue: Visibility
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: Visibility]
}>()

const groupName = `diary-visibility-${useId()}`

const options: Array<{ value: Visibility; label: string; description: string; symbol: string }> = [
  { value: 'private', label: '仅自己可见', description: '只保存在你的星域', symbol: '●' },
  { value: 'anonymous', label: '匿名公开', description: '隐藏身份后进入广场', symbol: '○' },
  { value: 'public', label: '公开并显示身份', description: '所有人可读并看到作者', symbol: '✦' },
]
</script>

<template>
  <fieldset :class="['privacy-selector', { compact }]">
    <legend class="sr-only">选择日记可见范围</legend>
    <label
      v-for="option in options"
      :key="option.value"
      :class="['privacy-option', { selected: modelValue === option.value }]"
    >
      <input
        type="radio"
        :name="groupName"
        :value="option.value"
        :checked="modelValue === option.value"
        @change="emit('update:modelValue', option.value)"
      />
      <span class="privacy-symbol" aria-hidden="true">{{ option.symbol }}</span>
      <span class="privacy-copy">
        <strong>{{ option.label }}</strong>
        <small v-if="!compact">{{ option.description }}</small>
      </span>
      <svg v-if="modelValue === option.value" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 12 4 4 8-9" />
      </svg>
    </label>
  </fieldset>
</template>
