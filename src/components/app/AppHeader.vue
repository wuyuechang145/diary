<script setup lang="ts">
import { computed } from 'vue'
import type { SessionState } from '@/types/auth'

const route = useRoute()
const { data: session } = await useFetch<SessionState>('/api/session')
const navItems = [
  { label: '我的星域', href: '/' },
  { label: '共鸣广场', href: '/explore' },
  { label: '情绪星图', href: '/constellation' },
]

const activeSection = computed(() => {
  if (route.path.startsWith('/constellation')) return 'constellation'
  if (route.path.startsWith('/profile') || route.path.startsWith('/login') || route.path.startsWith('/register')) return 'profile'
  if (route.path.startsWith('/explore') || route.path.startsWith('/diary/')) return 'explore'
  return 'home'
})
const accountInitial = computed(() => session.value?.name?.trim().slice(0, 1) || '我')
const composeHref = computed(() => {
  if (route.path.startsWith('/profile')) return '/diary/new?from=profile'
  if (route.path.startsWith('/constellation')) return '/diary/new?from=constellation'
  if (route.path.startsWith('/explore')) return '/diary/new?from=explore'
  return '/diary/new?from=home'
})

function isActive(href: string) {
  if (href === '/explore') return activeSection.value === 'explore'
  if (href === '/constellation') return activeSection.value === 'constellation'
  return href === '/' && activeSection.value === 'home'
}
</script>

<template>
  <header class="app-header">
    <a class="brand" href="/" aria-label="星笺首页">
      <span class="brand-mark" aria-hidden="true">
        <span class="brand-star"></span>
      </span>
      <span class="brand-name">星笺</span>
    </a>

    <nav class="desktop-nav" aria-label="主要导航">
      <a
        v-for="item in navItems"
        :key="item.label"
        :href="item.href"
        :class="['nav-link', { active: isActive(item.href) }]"
        :aria-current="isActive(item.href) ? 'page' : undefined"
      >
        {{ item.label }}
      </a>
    </nav>

    <div class="header-actions">
      <a
        class="icon-button"
        href="/explore?search=open"
        aria-label="搜索公开日记"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </a>
      <a
        v-if="session?.isAuthenticated"
        class="header-account"
        href="/profile"
        aria-label="打开个人主页"
        :aria-current="activeSection === 'profile' ? 'page' : undefined"
      >
        <span class="avatar" aria-hidden="true">{{ accountInitial }}</span>
        <span>{{ session.name }}</span>
      </a>
      <a v-else class="header-login" href="/login">登录</a>
      <a class="primary-button header-compose" :href="composeHref">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        写下此刻
      </a>
    </div>
  </header>

  <nav class="mobile-nav" aria-label="移动端导航">
    <a :class="['mobile-nav-item', { active: activeSection === 'home' }]" href="/" :aria-current="activeSection === 'home' ? 'page' : undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <ellipse cx="12" cy="12" rx="9" ry="4.5" />
      </svg>
      <span>星域</span>
    </a>
    <a :class="['mobile-nav-item', { active: activeSection === 'explore' }]" href="/explore" :aria-current="activeSection === 'explore' ? 'page' : undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12c3-5 13-5 16 0-3 5-13 5-16 0Z" />
        <circle cx="12" cy="12" r="2" />
      </svg>
      <span>共鸣</span>
    </a>
    <a class="mobile-compose" :href="composeHref" aria-label="写日记">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </a>
    <a
      :class="['mobile-nav-item', { active: activeSection === 'constellation' }]"
      href="/constellation"
      :aria-current="activeSection === 'constellation' ? 'page' : undefined"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16c2-5 4-1 6-6s4 4 6-1 3-1 4-4" />
        <circle cx="4" cy="16" r="1" /><circle cx="10" cy="10" r="1" /><circle cx="16" cy="9" r="1" />
      </svg>
      <span>星图</span>
    </a>
    <a
      :class="['mobile-nav-item', { active: activeSection === 'profile' }]"
      :href="session?.isAuthenticated ? '/profile' : '/login'"
      :aria-current="activeSection === 'profile' ? 'page' : undefined"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20c.8-4.2 3-6.3 6.5-6.3s5.7 2.1 6.5 6.3" />
      </svg>
      <span>我的</span>
    </a>
  </nav>
</template>
