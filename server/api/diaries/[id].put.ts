import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { updateDiary, type DiaryWriteInput } from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少日记 ID' })
  const body = await readBody<DiaryWriteInput>(event)
  return await updateDiary(id, body ?? {}, getSessionActor(event))
})
