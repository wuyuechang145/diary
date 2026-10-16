import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { setAuthenticatedSession, type SessionActor } from '../../utils/session'
import { createUser } from '../../utils/userStore'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const user = await createUser(body ?? {})
  const actor: SessionActor = {
    id: `user:${user.id}`,
    name: user.displayName,
    canClaimLegacy: false,
    isAuthenticated: true,
  }
  setAuthenticatedSession(event, user)
  setResponseStatus(event, 201)
  return { id: actor.id, name: actor.name, isAuthenticated: true }
})
