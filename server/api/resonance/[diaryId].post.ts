import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { setResonance } from '../../utils/resonanceStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const diaryId = getRouterParam(event, 'diaryId')
  if (!diaryId) throw createError({ statusCode: 400, statusMessage: '缺少日记 ID' })
  const body = await readBody<{ type?: unknown }>(event)
  return await setResonance(diaryId, body?.type, getSessionActor(event))
})
