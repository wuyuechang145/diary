import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2026-08-16',
  srcDir: 'src/',
  serverDir: fileURLToPath(new URL('./server', import.meta.url)),
  telemetry: false,
  devtools: { enabled: false },
  experimental: { appManifest: false },
  css: ['~/styles/global.css'],
  runtimeConfig: {
    sessionSecret: process.env.NUXT_SESSION_SECRET
      || (process.env.NODE_ENV === 'production' ? '' : 'local-development-only-secret-do-not-deploy'),
    publicOrigin: process.env.PUBLIC_ORIGIN || '',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '星笺 · 把心事写成一颗会呼吸的星',
      meta: [
        {
          name: 'description',
          content: '一个以沉浸式心象陪伴书写的 3D 动态日记空间。',
        },
        { name: 'color-scheme', content: 'dark' },
        { name: 'theme-color', content: '#080b18' },
      ],
      style: [
        {
          id: 'critical-dark-shell',
          textContent: ':root{color-scheme:dark;background:#07080f}html,body,#__nuxt{min-height:100%;background-color:#07080f}body{margin:0;color:#f4f2fa}',
        },
      ],
    },
  },
  routeRules: {
    '/**': {
      headers: {
        'cache-control': 'private, no-cache, must-revalidate',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
    '/_nuxt/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
    '/api/**': {
      headers: {
        'cache-control': 'private, no-store, max-age=0',
      },
    },
  },
  nitro: {
    compressPublicAssets: true,
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
})
