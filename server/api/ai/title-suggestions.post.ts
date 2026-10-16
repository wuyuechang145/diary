import { createError, defineEventHandler, readBody } from 'h3'
import { generateTitleSuggestions } from '../../utils/aiTitle'
import { getSessionActor } from '../../utils/session'
import type { DiaryCategory, DiaryEmotion, DiaryPerspective } from '../../utils/diaryStore'

type RequestBody = {
  content?: unknown
  emotion?: unknown
  perspective?: unknown
  category?: unknown
}

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
  const actor = getSessionActor(event)
  if (!actor.isAuthenticated) {
    throw createError({ statusCode: 401, statusMessage: '请先登录，再使用标题生成' })
  }

  const body = await readBody<RequestBody>(event)
  const content = typeof body?.content === 'string' ? body.content : ''
  const suggestions = await generateTitleSuggestions({
    content,
    emotion: emotions.has(body?.emotion as DiaryEmotion) ? body?.emotion as DiaryEmotion : 'unspecified',
    perspective: perspectives.has(body?.perspective as DiaryPerspective)
      ? body?.perspective as DiaryPerspective
      : 'unspecified',
    category: categories.has(body?.category as DiaryCategory) ? body?.category as DiaryCategory : 'unspecified',
  })

  return { suggestions }
})
