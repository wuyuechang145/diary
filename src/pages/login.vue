<script setup lang="ts">
import { computed, ref } from 'vue'
import AuthOrbit from '~/components/auth/AuthOrbit.vue'
import type { SessionState } from '~/types/auth'
import { safeLocalRedirect } from '~/utils/navigation'

const route = useRoute()
const { data: session } = await useFetch<SessionState>('/api/session')
if (session.value?.isAuthenticated) await navigateTo('/profile', { redirectCode: 302 })

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const formError = ref('')

const redirectPath = computed(() => safeLocalRedirect(route.query.redirect))
const registerHref = computed(() => `/register?redirect=${encodeURIComponent(redirectPath.value)}`)

function errorMessage(error: unknown) {
  return (error as { data?: { statusMessage?: string } })?.data?.statusMessage ?? '暂时无法登录，请稍后再试'
}

async function submitLogin() {
  if (submitting.value) return
  submitting.value = true
  formError.value = ''
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    window.location.assign(redirectPath.value)
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: '登录 · 星笺',
  description: '回到你的私人星域，继续写下未说出口的心事。',
})
</script>

<template>
  <main class="auth-page">
    <AuthOrbit
      eyebrow="IDENTITY HOMECOMING · 身份归航"
      title="回到属于你的星域。"
      description="这里记得你写下的每一束微光。登录以后，私人星笺与共鸣轨迹会继续沿着原来的方向生长。"
    />

    <section class="auth-panel" aria-labelledby="login-title">
      <a class="auth-brand" href="/" aria-label="返回星笺首页">
        <span class="brand-mark" aria-hidden="true"><span class="brand-star"></span></span>
        <span class="brand-name">星笺</span>
      </a>

      <div class="auth-form-wrap">
        <header class="auth-form-heading">
          <p>WELCOME BACK</p>
          <h2 id="login-title">欢迎回来</h2>
          <span>让今晚的心事，接着上一次的星轨继续。</span>
        </header>

        <form class="auth-form" @submit.prevent="submitLogin">
          <label class="auth-field">
            <span>邮箱</span>
            <input v-model="email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required />
          </label>
          <label class="auth-field">
            <span>密码</span>
            <span class="password-input">
              <input v-model="password" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="current-password" placeholder="输入你的密码" required />
              <button type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </span>
          </label>

          <p v-if="formError" class="auth-error" role="alert">{{ formError }}</p>
          <button class="auth-submit" type="submit" :disabled="submitting">
            <span>{{ submitting ? '正在归航…' : '进入我的星域' }}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p class="auth-switch">第一次来到这里？ <a :href="registerHref">创建一颗属于你的星</a></p>
        <p class="auth-assurance"><span aria-hidden="true">◇</span> 密码只以加密摘要保存，日记仍遵循你选择的可见范围。</p>
      </div>
    </section>
  </main>
</template>
