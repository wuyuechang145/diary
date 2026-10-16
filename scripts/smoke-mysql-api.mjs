import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { createClient } from 'redis'

dotenv.config({ quiet: true })

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173'
const marker = randomUUID()
const email = `smoke-${marker}@example.invalid`
const password = `Smoke-${randomUUID()}-pass`
const aiConfigured = Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL)
const checks = ['database-health', 'register-session', 'logout-login']
let cookie = ''
let cacheClient
let cacheVersionBefore = 0

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';', 1)[0]
  const body = response.status === 204 ? null : await response.json()
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

async function requestHtml(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} })
  const body = await response.text()
  if (response.status !== 200) throw new Error(`GET ${path} returned ${response.status}`)
  return body
}

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  charset: 'utf8mb4',
})

try {
  const health = await request('/api/health')
  if (health.storage !== 'mysql') throw new Error('Health endpoint is not reporting MySQL')
  if (health.cache === 'ready' && process.env.REDIS_URL) {
    cacheClient = createClient({ url: process.env.REDIS_URL })
    cacheClient.on('error', () => {})
    await cacheClient.connect()
    cacheVersionBefore = Number(await cacheClient.get('xingjian:v1:public:version') ?? 0)
  }

  const account = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName: '接口验收账户', email, password }),
  }, 201)
  if (!account.isAuthenticated) throw new Error('Registration did not create an authenticated session')

  const session = await request('/api/session')
  if (!session.isAuthenticated) throw new Error('Session cookie was not accepted')

  await request('/api/auth/logout', { method: 'POST' })
  const loggedOutSession = await request('/api/session')
  if (loggedOutSession.isAuthenticated) throw new Error('Logout did not clear the authenticated session')

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!login.isAuthenticated) throw new Error('Login did not restore the authenticated session')

  if (await request('/api/diaries/latest-draft', {}, 204) !== null) {
    throw new Error('A new account unexpectedly has a saved draft')
  }
  const blankEditor = await requestHtml('/diary/new?from=profile')
  if (!blankEditor.includes('未保存') || blankEditor.includes(marker)) {
    throw new Error('New diary page is not initially blank')
  }
  const guestDraftPreview = await fetch(`${baseUrl}/api/diaries/latest-draft`)
  if (guestDraftPreview.status !== 401) throw new Error('Latest draft preview is available to guests')

  if (aiConfigured && process.env.SMOKE_AI === '1') {
    const titleResult = await request('/api/ai/title-suggestions', {
      method: 'POST',
      body: JSON.stringify({ content: '窗外的雨停了，我终于把那句话写了下来。', emotion: 'calm' }),
    })
    if (!Array.isArray(titleResult.suggestions) || titleResult.suggestions.length !== 3) {
      throw new Error('AI title endpoint did not return three suggestions')
    }
    checks.push('ai-title-provider')
  } else if (!aiConfigured) {
    await request('/api/ai/title-suggestions', {
      method: 'POST',
      body: JSON.stringify({ content: '一' }),
    }, 503)
    checks.push('ai-title-config-guard')
  }

  const draft = await request('/api/diaries', {
    method: 'POST',
    body: JSON.stringify({
      title: `MySQL 验收 ${marker}`,
      content: '这是一篇用于验证数据库写入、刷新读取与筛选组合的临时日记。',
      emotion: 'calm',
      perspective: 'teen',
      category: 'communication',
      visibility: 'private',
      status: 'draft',
    }),
  }, 201)

  const savedDraft = await request('/api/diaries/latest-draft')
  if (savedDraft?.id !== draft.id || 'content' in savedDraft) {
    throw new Error('Latest draft preview is missing or includes diary content')
  }
  const restorePage = await requestHtml('/diary/new?from=profile')
  if (!restorePage.includes('继续上次保存的草稿吗') || !restorePage.includes(marker)
    || restorePage.includes('这是一篇用于验证数据库写入')) {
    throw new Error('New editor did not offer a metadata-only draft choice')
  }

  const firstVersion = draft.updatedAt
  const changed = await request(`/api/diaries/${draft.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: `MySQL 验收 ${marker} · 已修改`, expectedUpdatedAt: firstVersion }),
  })
  if (changed.updatedAt === firstVersion) throw new Error('Diary update did not advance its version')
  await request(`/api/diaries/${draft.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: '不应覆盖的新标题', expectedUpdatedAt: firstVersion }),
  }, 409)
  const afterConflict = await request(`/api/diaries/${draft.id}`)
  if (afterConflict.title === '不应覆盖的新标题') throw new Error('Stale editor overwrote a newer version')

  const mine = await request('/api/diaries?scope=mine&page=1&limit=20')
  if (!mine.items.some((item) => item.id === draft.id)) throw new Error('Created diary is missing from account list')

  const profilePage = await requestHtml('/profile')
  if (!profilePage.includes(`/diary/edit/${draft.id}`) || !profilePage.includes('再次编辑')) {
    throw new Error('Profile does not render diary management actions')
  }
  const editPage = await requestHtml(`/diary/edit/${draft.id}`)
  if (!editPage.includes(marker)) throw new Error('SSR edit page did not load the saved diary')

  await request(`/api/diaries/${draft.id}`, {
    method: 'PUT',
    body: JSON.stringify({ visibility: 'public', status: 'published' }),
  })
  if (await request('/api/diaries/latest-draft', {}, 204) !== null) {
    throw new Error('Published diary was offered as an unfinished draft')
  }

  const publicList = await request(
    `/api/diaries?scope=public&perspective=teen&category=communication&q=${encodeURIComponent(marker)}`,
  )
  if (!publicList.items.some((item) => item.id === draft.id)) {
    throw new Error('Published diary is missing from combined public filters')
  }
  if (publicList.items.some((item) => 'content' in item || 'attachments' in item)) {
    throw new Error('List response contains full diary content or attachments')
  }
  // Warm the cached ID page, then verify an immediate privacy change never leaks it.
  await request('/api/diaries?scope=public&page=1&limit=20')
  if (cacheClient) {
    const version = await cacheClient.get('xingjian:v1:public:version') ?? '0'
    const key = `xingjian:v1:public:${version}:${JSON.stringify({ page: 1, limit: 20 })}`
    const cached = JSON.parse(await cacheClient.get(key) ?? 'null')
    if (!cached?.ids?.includes(draft.id) || 'content' in cached) {
      throw new Error('Redis public cache did not contain only the expected ID page')
    }
  }
  await request(`/api/diaries/${draft.id}`, {
    method: 'PUT', body: JSON.stringify({ visibility: 'private' }),
  })
  const privateList = await request('/api/diaries?scope=public&page=1&limit=20')
  if (privateList.items.some((item) => item.id === draft.id)) throw new Error('Private diary leaked through public list')
  const guestDetail = await fetch(`${baseUrl}/api/diaries/${draft.id}`)
  if (guestDetail.status !== 403) throw new Error('Private diary detail is readable without owner session')

  await request(`/api/diaries/${draft.id}`, {
    method: 'PUT', body: JSON.stringify({ visibility: 'anonymous' }),
  })
  const anonymousList = await (await fetch(`${baseUrl}/api/diaries?scope=public&page=1&limit=20`)).json()
  const anonymousItem = anonymousList.items.find((item) => item.id === draft.id)
  if (!anonymousItem || anonymousItem.authorId || anonymousItem.authorName !== '匿名星友') {
    throw new Error('Anonymous public summary exposed an author or went missing')
  }

  const profile = await request('/api/profile')
  if (profile.stats.total !== 1 || profile.stats.published !== 1) {
    throw new Error('Profile statistics do not reflect MySQL diary data')
  }

  await request(`/api/diaries/${draft.id}`, { method: 'DELETE' }, 204)
  const afterDelete = await request('/api/diaries?scope=mine&page=1&limit=20')
  if (afterDelete.items.some((item) => item.id === draft.id)) throw new Error('Deleted diary remains in account list')

  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => request('/api/diaries', {
    method: 'POST',
    body: JSON.stringify({ title: `并发验收 ${marker} ${index}`, content: `私密测试 ${index}`, visibility: 'private' }),
  }, 201)))
  if (new Set(concurrent.map((item) => item.id)).size !== concurrent.length) {
    throw new Error('Concurrent writes did not create distinct diaries')
  }
  const afterConcurrent = await request('/api/diaries?scope=mine&page=1&limit=20')
  if (!concurrent.every((item) => afterConcurrent.items.some((saved) => saved.id === item.id))) {
    throw new Error('Concurrent diary writes are missing from MySQL-backed list')
  }
  await Promise.all(concurrent.map((item) => request(`/api/diaries/${item.id}`, { method: 'DELETE' }, 204)))
  if (cacheClient) {
    const versionAfter = Number(await cacheClient.get('xingjian:v1:public:version') ?? 0)
    if (versionAfter <= cacheVersionBefore) throw new Error('Public writes did not invalidate Redis cache version')
    checks.push('redis-id-cache-and-invalidation')
  }
  if (cacheClient && process.env.SMOKE_RATE_LIMIT === '1') {
    let throttled = 0
    for (let index = 0; index < 245; index += 1) {
      const response = await fetch(`${baseUrl}/api/diaries?scope=public&page=1`, { headers: { cookie } })
      await response.arrayBuffer()
      if (response.status === 429) {
        if (!response.headers.get('retry-after')) throw new Error('429 response has no Retry-After header')
        throttled += 1
      } else if (response.status !== 200) {
        throw new Error(`Rate-limit test returned unexpected ${response.status}`)
      }
    }
    if (!throttled) throw new Error('Redis did not enforce the per-account read limit')
    checks.push('redis-atomic-read-limit')
  }
  console.log(JSON.stringify({
    ok: true,
    checks: [...checks, 'manual-save-draft-preview', 'new-editor-no-body-leak', 'stale-write-conflict', 'create-read', 'profile-actions', 'ssr-edit-page', 'update-publish', 'combined-filter', 'summary-projection', 'privacy-after-cache', 'anonymous-summary', 'profile-stats', 'delete-refresh', 'eight-concurrent-private-writes'],
  }))
} finally {
  await connection.execute('DELETE FROM users WHERE email = ?', [email])
  await connection.end()
  if (cacheClient) cacheClient.destroy()
}
