import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getResonanceState } from '../../utils/resonanceStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const diaryId = getRouterParam(event, 'diaryId')
  if (!diaryId) throw createError({ statusCode: 400, statusMessage: '缺少日记 ID' })
  return await getResonanceState(diaryId, getSessionActor(event))
})
