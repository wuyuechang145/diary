import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createDiary, type DiaryWriteInput } from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const body = await readBody<DiaryWriteInput>(event)
  const diary = await createDiary(body ?? {}, getSessionActor(event))
  setResponseStatus(event, 201)
  return diary
})
