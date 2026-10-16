import { defineEventHandler, readBody } from 'h3'
import { setAuthenticatedSession, type SessionActor } from '../../utils/session'
import { authenticateUser } from '../../utils/userStore'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const user = await authenticateUser(body ?? {})
  const actor: SessionActor = {
    id: `user:${user.id}`,
    name: user.displayName,
    canClaimLegacy: false,
    isAuthenticated: true,
  }
  setAuthenticatedSession(event, user)
  return { id: actor.id, name: actor.name, isAuthenticated: true }
})
