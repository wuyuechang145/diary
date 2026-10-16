import { createError, defineEventHandler, getQuery } from 'h3'
import {
  listDiaries,
  type DiaryCategory,
  type DiaryEmotion,
  type DiaryPerspective,
} from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

const emotions = new Set<DiaryEmotion>(['calm', 'gentle', 'longing', 'courage', 'tension', 'sadness', 'unspecified'])
const perspectives = new Set<DiaryPerspective>(['teen', 'parent', 'family', 'unspecified'])
const categories = new Set<DiaryCategory>([
  'daily-life',
  'growth-conflict',
  'pressure',
  'communication',
  'expectation-responsibility',
  'understanding-gratitude',
  'unspecified',
])

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const scope = query.scope === 'mine' ? 'mine' : 'public'
  const requestedPage = Number(query.page ?? 1)
  const requestedLimit = Number(query.limit ?? 12)
  const page = Number.isSafeInteger(requestedPage) ? Math.min(200, Math.max(1, requestedPage)) : 1
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(20, Math.max(1, requestedLimit)) : 12
  const emotion = emotions.has(query.emotion as DiaryEmotion) ? query.emotion as DiaryEmotion : undefined
  const perspective = perspectives.has(query.perspective as DiaryPerspective)
    ? query.perspective as DiaryPerspective
    : undefined
  const category = categories.has(query.category as DiaryCategory)
    ? query.category as DiaryCategory
    : undefined
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : undefined
  const actor = getSessionActor(event)
  if (scope === 'mine' && !actor.isAuthenticated) {
    throw createError({ statusCode: 401, statusMessage: '请先登录，再查看自己的日记' })
  }
  const result = await listDiaries(scope, actor, {
    page,
    limit,
    emotion,
    perspective,
    category,
    query: search || undefined,
  })
  return { scope, ...result }
})
