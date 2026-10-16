import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { deleteDiary } from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少日记 ID' })
  await deleteDiary(id, getSessionActor(event))
  setResponseStatus(event, 204)
  return null
})
