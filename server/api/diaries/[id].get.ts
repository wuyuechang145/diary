import { createError, defineEventHandler, getRouterParam } from 'h3'
import { canReadDiary, getDiary, presentDiary } from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少日记 ID' })

  const diary = await getDiary(id)
  if (!diary) throw createError({ statusCode: 404, statusMessage: '没有找到这篇星笺' })

  const actor = getSessionActor(event)
  if (!canReadDiary(diary, actor)) {
    throw createError({ statusCode: 403, statusMessage: '这篇星笺没有对外公开' })
  }

  return presentDiary(diary, actor)
})
