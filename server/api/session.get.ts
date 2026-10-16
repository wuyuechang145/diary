import { defineEventHandler } from 'h3'
import { getSessionActor } from '../utils/session'

export default defineEventHandler((event) => {
  const actor = getSessionActor(event)
  return {
    id: actor.id,
    name: actor.name,
    isAuthenticated: actor.isAuthenticated,
    mode: actor.isAuthenticated ? 'account' : 'signed-anonymous-session',
  }
})
