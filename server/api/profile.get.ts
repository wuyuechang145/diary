import { createError, defineEventHandler } from 'h3'
import { getDiaryStats } from '../utils/diaryStore'
import { getSessionActor } from '../utils/session'
import { getUserByActorId } from '../utils/userStore'

export default defineEventHandler(async (event) => {
  const actor = getSessionActor(event)
  if (!actor.isAuthenticated) throw createError({ statusCode: 401, statusMessage: '请先登录，再查看私人星域' })
  const user = await getUserByActorId(actor.id)
  if (!user) throw createError({ statusCode: 401, statusMessage: '登录状态已失效，请重新登录' })
  return {
    account: {
      id: actor.id,
      name: user.displayName,
      email: user.email,
      createdAt: user.createdAt,
    },
    stats: await getDiaryStats(actor),
  }
})
