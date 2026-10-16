<script setup lang="ts">
import { computed, ref } from 'vue'
import AuthOrbit from '~/components/auth/AuthOrbit.vue'
import type { SessionState } from '~/types/auth'
import { safeLocalRedirect } from '~/utils/navigation'

const route = useRoute()

const { data: session } = await useFetch<SessionState>('/api/session')
if (session.value?.isAuthenticated) await navigateTo('/profile', { redirectCode: 302 })

const displayName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const formError = ref('')
const redirectPath = computed(() => safeLocalRedirect(route.query.redirect))
const loginHref = computed(() => `/login?redirect=${encodeURIComponent(redirectPath.value)}`)

function errorMessage(error: unknown) {
  return (error as { data?: { statusMessage?: string } })?.data?.statusMessage ?? '暂时无法创建账户，请稍后再试'
}

async function submitRegistration() {
  if (submitting.value) return
  formError.value = ''
  if (password.value !== confirmPassword.value) {
    formError.value = '两次输入的密码不一致'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { displayName: displayName.value, email: email.value, password: password.value },
    })
    window.location.assign(redirectPath.value)
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: '注册 · 星笺',
  description: '创建你的星笺账户，拥有一片可以安心书写的私人星域。',
})
</script>

<template>
  <main class="auth-page">
    <AuthOrbit
      eyebrow="A NEW STAR · 初次点亮"
      title="为真实的感受，留一片不被催促的夜空。"
      description="你可以先做自己，再慢慢成为被理解的家人。这里不推断身份，也不替你定义情绪，只安静保存你主动写下的文字。"
    />

    <section class="auth-panel" aria-labelledby="register-title">
      <a class="auth-brand" href="/" aria-label="返回星笺首页">
        <span class="brand-mark" aria-hidden="true"><span class="brand-star"></span></span>
        <span class="brand-name">星笺</span>
      </a>

      <div class="auth-form-wrap register-form-wrap">
        <header class="auth-form-heading">
          <p>BEGIN YOUR ORBIT</p>
          <h2 id="register-title">点亮你的星</h2>
          <span>昵称可以是一盏灯、一阵风，或任何让你安心的名字。</span>
        </header>

        <form class="auth-form" @submit.prevent="submitRegistration">
          <label class="auth-field">
            <span>昵称</span>
            <input v-model="displayName" type="text" name="nickname" autocomplete="nickname" minlength="2" maxlength="24" placeholder="输入你希望展示的昵称" required />
          </label>
          <label class="auth-field">
            <span>邮箱</span>
            <input v-model="email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required />
          </label>
          <label class="auth-field">
            <span>密码</span>
            <span class="password-input">
              <input v-model="password" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="至少 8 个字符" required />
              <button type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </span>
          </label>
          <label class="auth-field">
            <span>确认密码</span>
            <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" name="password-confirmation" autocomplete="new-password" minlength="8" maxlength="128" placeholder="再输入一次密码" required />
          </label>

          <p v-if="formError" class="auth-error" role="alert">{{ formError }}</p>
          <button class="auth-submit" type="submit" :disabled="submitting">
            <span>{{ submitting ? '正在点亮…' : '创建账户并进入' }}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p class="auth-switch">已经拥有星域？ <a :href="loginHref">直接登录</a></p>
        <p class="auth-assurance"><span aria-hidden="true">◇</span> 注册即表示你愿意共同维护一个尊重隐私、彼此倾听的空间。</p>
      </div>
    </section>
  </main>
</template>
