import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { SessionActor } from './session'
import { database, fromMysqlDate, toMysqlDate } from './database'
import { invalidatePublicLists, publicListVersion, redisClient } from './redis'

export type DiaryVisibility = 'private' | 'friends' | 'anonymous' | 'public'
export type DiaryStatus = 'draft' | 'published'
export type DiaryEmotion = 'calm' | 'gentle' | 'longing' | 'courage' | 'tension' | 'sadness' | 'unspecified'
export type DiaryPerspective = 'teen' | 'parent' | 'family' | 'unspecified'
export type DiaryCategory =
  | 'daily-life'
  | 'growth-conflict'
  | 'pressure'
  | 'communication'
  | 'expectation-responsibility'
  | 'understanding-gratitude'
  | 'unspecified'

export type DiaryAttachment = {
  id: string
  type: 'image' | 'audio'
  name: string
}

export type DiaryRecord = {
  id: string
  authorId: string
  authorName: string
  date: string
  title: string
  content: string
  summary: string
  emotion: DiaryEmotion
  perspective: DiaryPerspective
  category: DiaryCategory
  visibility: DiaryVisibility
  status: DiaryStatus
  attachments: DiaryAttachment[]
  location?: string
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export type DiaryWriteInput = {
  date?: unknown
  title?: unknown
  content?: unknown
  emotion?: unknown
  perspective?: unknown
  category?: unknown
  visibility?: unknown
  status?: unknown
  attachments?: unknown
  location?: unknown
  expectedUpdatedAt?: unknown
}

export type DiaryListOptions = {
  page: number
  limit: number
  emotion?: DiaryEmotion
  perspective?: DiaryPerspective
  category?: DiaryCategory
  query?: string
}

interface DiaryRow extends RowDataPacket {
  id: string
  user_id: string
  author_name: string
  diary_date: string
  title: string
  content: string
  summary: string
  emotion: DiaryEmotion
  perspective: DiaryPerspective
  category: DiaryCategory
  visibility: DiaryVisibility
  status: DiaryStatus
  attachments: string | DiaryAttachment[]
  location: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

interface CountRow extends RowDataPacket {
  total: number | string
}

interface SavedDraftRow extends RowDataPacket {
  id: string
  title: string
  diary_date: string
  updated_at: string
}

interface DiarySummaryRow extends RowDataPacket {
  id: string
  user_id: string
  author_name: string
  diary_date: string
  title: string
  summary: string
  emotion: DiaryEmotion
  perspective: DiaryPerspective
  category: DiaryCategory
  visibility: DiaryVisibility
  status: DiaryStatus
  location: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

type CachedPage = { ids: string[], total: number, page: number, limit: number, totalPages: number, hasMore: boolean }
type FreshPage = CachedPage & { rows: DiarySummaryRow[] }
const pendingPublicPages = new Map<string, Promise<FreshPage>>()
const summaryColumns = `id, user_id, author_name, diary_date, title, summary, emotion,
  perspective, category, visibility, status, location, created_at, updated_at, published_at`

function presentSummary(row: DiarySummaryRow, actor: SessionActor) {
  const isOwner = actor.isAuthenticated && actor.id === `user:${row.user_id}`
  const anonymous = !isOwner && row.visibility === 'anonymous'
  return {
    id: row.id,
    authorId: anonymous ? undefined : `user:${row.user_id}`,
    authorName: anonymous ? '匿名星友' : row.author_name,
    date: row.diary_date,
    title: row.title,
    summary: row.summary,
    emotion: emotionValues.has(row.emotion) ? row.emotion : 'unspecified',
    perspective: perspectiveValues.has(row.perspective) ? row.perspective : 'unspecified',
    category: categoryValues.has(row.category) ? row.category : 'unspecified',
    visibility: row.visibility,
    status: row.status,
    location: row.location ?? undefined,
    createdAt: fromMysqlDate(row.created_at)!,
    updatedAt: fromMysqlDate(row.updated_at)!,
    publishedAt: fromMysqlDate(row.published_at),
    isOwner,
  }
}

const visibilityValues = new Set<DiaryVisibility>(['private', 'anonymous', 'public'])
const emotionValues = new Set<DiaryEmotion>(['calm', 'gentle', 'longing', 'courage', 'tension', 'sadness', 'unspecified'])
const perspectiveValues = new Set<DiaryPerspective>(['teen', 'parent', 'family', 'unspecified'])
const categoryValues = new Set<DiaryCategory>([
  'daily-life',
  'growth-conflict',
  'pressure',
  'communication',
  'expectation-responsibility',
  'understanding-gratitude',
  'unspecified',
])
const statusValues = new Set<DiaryStatus>(['draft', 'published'])

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function makeSummary(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 108 ? `${compact.slice(0, 108)}…` : compact
}

function normalizeStoredDiary(record: DiaryRecord): DiaryRecord {
  return {
    ...record,
    perspective: perspectiveValues.has(record.perspective) ? record.perspective : 'unspecified',
    category: categoryValues.has(record.category) ? record.category : 'unspecified',
  }
}

function cleanAttachments(value: unknown): DiaryAttachment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const type = candidate.type === 'audio' ? 'audio' : candidate.type === 'image' ? 'image' : undefined
    const name = cleanText(candidate.name, 120)
    if (!type || !name) return []
    return [{
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 80) : randomUUID(),
      type,
      name,
    }]
  })
}

function parseAttachments(value: DiaryRow['attachments']) {
  if (Array.isArray(value)) return cleanAttachments(value)
  try {
    return cleanAttachments(JSON.parse(value || '[]'))
  } catch {
    return []
  }
}

function fromRow(row: DiaryRow): DiaryRecord {
  return normalizeStoredDiary({
    id: row.id,
    authorId: `user:${row.user_id}`,
    authorName: row.author_name,
    date: row.diary_date,
    title: row.title,
    content: row.content,
    summary: row.summary,
    emotion: emotionValues.has(row.emotion) ? row.emotion : 'unspecified',
    perspective: row.perspective,
    category: row.category,
    visibility: row.visibility,
    status: row.status,
    attachments: parseAttachments(row.attachments),
    location: row.location ?? undefined,
    createdAt: fromMysqlDate(row.created_at)!,
    updatedAt: fromMysqlDate(row.updated_at)!,
    publishedAt: fromMysqlDate(row.published_at),
  })
}

function actorUserId(actor: SessionActor) {
  return actor.isAuthenticated && actor.id.startsWith('user:') ? actor.id.slice(5) : undefined
}

export function isDiaryOwner(record: DiaryRecord, actor: SessionActor) {
  return actor.isAuthenticated && record.authorId === actor.id
}

export function canReadDiary(record: DiaryRecord, actor: SessionActor) {
  return isDiaryOwner(record, actor)
    || (record.status === 'published' && (record.visibility === 'public' || record.visibility === 'anonymous'))
}

export function normalizeDiaryInput(body: DiaryWriteInput, current?: DiaryRecord) {
  const content = typeof body.content === 'string' ? body.content.slice(0, 50_000) : current?.content ?? ''
  const requestedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 60) : current?.title ?? ''
  const status = statusValues.has(body.status as DiaryStatus)
    ? body.status as DiaryStatus
    : current?.status ?? 'draft'
  const visibility = visibilityValues.has(body.visibility as DiaryVisibility)
    ? body.visibility as DiaryVisibility
    : current?.visibility ?? 'private'
  const emotion = emotionValues.has(body.emotion as DiaryEmotion)
    ? body.emotion as DiaryEmotion
    : current?.emotion ?? 'unspecified'
  const perspective = perspectiveValues.has(body.perspective as DiaryPerspective)
    ? body.perspective as DiaryPerspective
    : current?.perspective ?? 'unspecified'
  const category = categoryValues.has(body.category as DiaryCategory)
    ? body.category as DiaryCategory
    : current?.category ?? 'unspecified'
  const dateCandidate = cleanText(body.date, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)
    ? dateCandidate
    : current?.date ?? new Date().toISOString().slice(0, 10)

  if (status === 'published' && !content.trim()) {
    throw createError({ statusCode: 422, statusMessage: '发布前请先写下一句话' })
  }

  const location = body.location === undefined
    ? current?.location
    : cleanText(body.location, 80) || undefined
  const attachments = body.attachments === undefined
    ? current?.attachments ?? []
    : cleanAttachments(body.attachments)
  const title = requestedTitle || makeSummary(content).slice(0, 24) || '未命名星笺'

  return {
    date,
    title,
    content,
    summary: makeSummary(content),
    emotion,
    perspective,
    category,
    visibility,
    status,
    attachments,
    location,
  }
}

export async function createDiary(body: DiaryWriteInput, actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再保存日记' })
  const now = new Date().toISOString()
  const normalized = normalizeDiaryInput(body)
  const record: DiaryRecord = {
    id: randomUUID(),
    authorId: actor.id,
    authorName: actor.name,
    ...normalized,
    createdAt: now,
    updatedAt: now,
    publishedAt: normalized.status === 'published' ? now : undefined,
  }
  await database().execute<ResultSetHeader>(
    `INSERT INTO diaries
      (id, user_id, author_name, diary_date, title, content, summary, emotion, perspective,
       category, visibility, status, attachments, location, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.id, userId, record.authorName, record.date, record.title, record.content, record.summary,
      record.emotion, record.perspective, record.category, record.visibility, record.status,
      JSON.stringify(record.attachments), record.location ?? null, toMysqlDate(now), toMysqlDate(now),
      record.publishedAt ? toMysqlDate(record.publishedAt) : null],
  )
  if (record.status === 'published' && (record.visibility === 'public' || record.visibility === 'anonymous')) {
    await invalidatePublicLists()
  }
  return presentDiary(record, actor)
}

export async function getDiary(id: string) {
  const [rows] = await database().execute<DiaryRow[]>('SELECT * FROM diaries WHERE id = ? LIMIT 1', [id])
  return rows[0] ? fromRow(rows[0]) : undefined
}

export async function getLatestSavedDraft(actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再查看自己的草稿' })
  const [rows] = await database().execute<SavedDraftRow[]>(
    `SELECT id, title, diary_date, updated_at FROM diaries
     WHERE user_id = ? AND status = 'draft'
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  return row ? {
    id: row.id,
    title: row.title,
    date: row.diary_date,
    updatedAt: fromMysqlDate(row.updated_at)!,
  } : null
}

export async function updateDiary(id: string, body: DiaryWriteInput, actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再修改日记' })
  const current = await getDiary(id)
  if (!current) throw createError({ statusCode: 404, statusMessage: '没有找到这篇星笺' })
  if (!isDiaryOwner(current, actor)) {
    throw createError({ statusCode: 403, statusMessage: '只能修改自己的星笺' })
  }
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updatedAt) {
    throw createError({ statusCode: 409, statusMessage: '这篇星笺已在另一处更新，请先核对最新版本' })
  }
  const normalized = normalizeDiaryInput(body, current)
  const now = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
  const record: DiaryRecord = {
    ...current,
    ...normalized,
    authorId: actor.id,
    authorName: actor.name,
    updatedAt: now,
    publishedAt: normalized.status === 'published' ? current.publishedAt ?? now : undefined,
  }
  const [updateResult] = await database().execute<ResultSetHeader>(
    `UPDATE diaries SET
       author_name = ?, diary_date = ?, title = ?, content = ?, summary = ?, emotion = ?,
       perspective = ?, category = ?, visibility = ?, status = ?, attachments = ?, location = ?,
       updated_at = ?, published_at = ?
     WHERE id = ? AND user_id = ? AND updated_at = ?`,
    [record.authorName, record.date, record.title, record.content, record.summary, record.emotion,
      record.perspective, record.category, record.visibility, record.status, JSON.stringify(record.attachments),
      record.location ?? null, toMysqlDate(now), record.publishedAt ? toMysqlDate(record.publishedAt) : null,
      record.id, userId, toMysqlDate(current.updatedAt)],
  )
  if (updateResult.affectedRows !== 1) {
    throw createError({ statusCode: 409, statusMessage: '这篇星笺已在另一处更新，请先核对最新版本' })
  }
  if ([current, record].some((item) => item.status === 'published'
    && (item.visibility === 'public' || item.visibility === 'anonymous'))) {
    await invalidatePublicLists()
  }
  return presentDiary(record, actor)
}

export async function deleteDiary(id: string, actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再删除日记' })
  const current = await getDiary(id)
  if (!current) throw createError({ statusCode: 404, statusMessage: '没有找到这篇星笺' })
  if (!isDiaryOwner(current, actor)) {
    throw createError({ statusCode: 403, statusMessage: '只能删除自己的星笺' })
  }
  await database().execute<ResultSetHeader>('DELETE FROM diaries WHERE id = ? AND user_id = ?', [id, userId])
  if (current.status === 'published' && (current.visibility === 'public' || current.visibility === 'anonymous')) {
    await invalidatePublicLists()
  }
}

export async function listDiaries(
  scope: 'mine' | 'public',
  actor: SessionActor,
  options: DiaryListOptions,
) {
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (scope === 'mine') {
    const userId = actorUserId(actor)
    if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再查看自己的日记' })
    conditions.push('user_id = ?')
    values.push(userId)
  } else {
    conditions.push("status = 'published'", "visibility IN ('public', 'anonymous')")
  }
  if (options.emotion) {
    conditions.push('emotion = ?')
    values.push(options.emotion)
  }
  if (options.perspective) {
    conditions.push('perspective = ?')
    values.push(options.perspective)
  }
  if (options.category) {
    conditions.push('category = ?')
    values.push(options.category)
  }
  if (options.query) {
    conditions.push("CONCAT_WS(' ', title, summary, CASE WHEN visibility = 'public' THEN author_name ELSE '' END) LIKE ? ESCAPE '!'")
    values.push(`%${options.query.replace(/[!%_]/g, (match) => `!${match}`)}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const order = scope === 'mine' ? 'updated_at DESC, id DESC' : 'published_at DESC, id DESC'
  const version = scope === 'public' && !options.query && options.page <= 10
    ? await publicListVersion()
    : undefined
  const cacheKey = version === undefined ? undefined : `xingjian:v1:public:${version}:${JSON.stringify(options)}`
  if (cacheKey) {
    try {
      const cached = await (await redisClient())?.get(cacheKey)
      if (cached) {
        const page = JSON.parse(cached) as CachedPage
        if (Array.isArray(page.ids) && page.ids.length <= options.limit
          && page.ids.every((id) => /^[a-f0-9-]{36}$/i.test(id))) {
          if (!page.ids.length) return { items: [], total: page.total, page: page.page, limit: page.limit, totalPages: page.totalPages, hasMore: page.hasMore }
          const [rows] = await database().execute<DiarySummaryRow[]>(
            `SELECT ${summaryColumns} FROM diaries WHERE id IN (${page.ids.map(() => '?').join(',')})
             AND status = 'published' AND visibility IN ('public', 'anonymous')`, page.ids,
          )
          const byId = new Map(rows.map((row) => [row.id, row]))
          if (byId.size === page.ids.length) {
            return { ...page, items: page.ids.map((id) => presentSummary(byId.get(id)!, actor)) }
          }
        }
      }
    } catch {
      // Corrupt or unavailable cache never blocks the database path.
    }
  }
  const loadPage = async (): Promise<FreshPage> => {
    const [countRows] = await database().execute<CountRow[]>(`SELECT COUNT(*) AS total FROM diaries ${where}`, values)
    const total = Number(countRows[0]?.total ?? 0)
    const totalPages = Math.min(200, Math.max(1, Math.ceil(total / options.limit)))
    const page = Math.min(options.page, totalPages)
    const offset = (page - 1) * options.limit
    const [rows] = await database().execute<DiarySummaryRow[]>(
      `SELECT ${summaryColumns} FROM diaries ${where}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      [...values, options.limit, offset],
    )
    const fresh = { rows, ids: rows.map((row) => row.id), total, page, limit: options.limit, totalPages, hasMore: page < totalPages }
    if (cacheKey && (total === 0 || rows.length > 0) && version === await publicListVersion()) {
      const { rows: _rows, ...pageData } = fresh
      try {
        await (await redisClient())?.set(cacheKey, JSON.stringify(pageData), { EX: 18 + Math.floor(Math.random() * 10) })
      } catch { /* Cache is optional. */ }
    }
    return fresh
  }

  let flight = cacheKey ? pendingPublicPages.get(cacheKey) : undefined
  if (!flight) {
    flight = loadPage()
    if (cacheKey) pendingPublicPages.set(cacheKey, flight)
  }
  let fresh: FreshPage
  try {
    fresh = await flight
  } finally {
    if (cacheKey && pendingPublicPages.get(cacheKey) === flight) pendingPublicPages.delete(cacheKey)
  }
  const { rows, ids: _ids, ...pagination } = fresh
  return { ...pagination, items: rows.map((row) => presentSummary(row, actor)) }
}

export async function getDiaryStats(actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) {
    return { total: 0, published: 0, private: 0, anonymous: 0, dominantEmotion: null }
  }
  interface StatsRow extends RowDataPacket {
    total: number | string
    published: number | string
    private_count: number | string
    anonymous_count: number | string
  }
  interface EmotionRow extends RowDataPacket {
    emotion: DiaryEmotion
    total: number | string
  }
  const [[stats], emotionRows] = await Promise.all([
    database().execute<StatsRow[]>(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(status = 'published'), 0) AS published,
        COALESCE(SUM(visibility IN ('private', 'friends')), 0) AS private_count,
        COALESCE(SUM(visibility = 'anonymous'), 0) AS anonymous_count
       FROM diaries WHERE user_id = ?`,
      [userId],
    ),
    database().execute<EmotionRow[]>(
      'SELECT emotion, COUNT(*) AS total FROM diaries WHERE user_id = ? GROUP BY emotion ORDER BY total DESC LIMIT 1',
      [userId],
    ),
  ])
  const dominant = emotionRows[0][0]?.emotion
  return {
    total: Number(stats[0]?.total ?? 0),
    published: Number(stats[0]?.published ?? 0),
    private: Number(stats[0]?.private_count ?? 0),
    anonymous: Number(stats[0]?.anonymous_count ?? 0),
    dominantEmotion: dominant ?? null,
  }
}

export function presentDiary(record: DiaryRecord, actor: SessionActor) {
  const normalized = normalizeStoredDiary(record)
  const isOwner = isDiaryOwner(normalized, actor)
  const anonymous = !isOwner && normalized.visibility === 'anonymous'
  return {
    ...normalized,
    authorId: anonymous ? undefined : normalized.authorId,
    authorName: anonymous ? '匿名星友' : normalized.authorName,
    isOwner,
  }
}
