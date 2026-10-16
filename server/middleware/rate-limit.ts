import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { createError, defineEventHandler, getHeader, getRequestURL, setResponseHeader } from 'h3'
import { redisClient } from '../utils/redis'
import { getSessionActor } from '../utils/session'

type Limit = { bucket: string, max: number, windowSeconds: number }
const localWindows = new Map<string, { count: number, expires: number }>()

const atomicLimit = `local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {value, redis.call('TTL', KEYS[1])}`

function policy(path: string, method: string): Limit | undefined {
  if (path === '/api/health') return undefined
  if (/^\/api\/auth\/(login|register)$/.test(path)) return { bucket: 'auth', max: 12, windowSeconds: 60 }
  if (path === '/api/ai/title-suggestions') return { bucket: 'ai', max: 30, windowSeconds: 60 }
  if (method !== 'GET' && method !== 'HEAD') return { bucket: 'write', max: 60, windowSeconds: 60 }
  return { bucket: 'read', max: 240, windowSeconds: 60 }
}

function requesterIp(event: Parameters<typeof getHeader>[0]) {
  const socketIp = event.node.req.socket.remoteAddress ?? 'unknown'
  const trustedProxies = (process.env.TRUSTED_PROXY_IPS ?? '').split(',').map((ip) => ip.trim()).filter(Boolean)
  if (trustedProxies.includes(socketIp)) {
    const forwarded = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded && isIP(forwarded)) return forwarded
  }
  return socketIp
}

function localLimit(key: string, limit: Limit) {
  const now = Date.now()
  if (localWindows.size > 10_000) {
    for (const [name, state] of localWindows) if (state.expires <= now) localWindows.delete(name)
    if (localWindows.size > 10_000) localWindows.clear()
  }
  const old = localWindows.get(key)
  const next = old && old.expires > now
    ? { count: old.count + 1, expires: old.expires }
    : { count: 1, expires: now + limit.windowSeconds * 1_000 }
  localWindows.set(key, next)
  return { count: next.count, retryAfter: Math.max(1, Math.ceil((next.expires - now) / 1_000)) }
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  const method = event.node.req.method ?? 'GET'
  const limit = policy(path, method)
  if (!limit) return

  const ip = requesterIp(event)
  const actor = limit.bucket === 'auth' ? undefined : getSessionActor(event)
  const identity = actor?.isAuthenticated ? actor.id : `ip:${ip}`
  const hash = createHash('sha256').update(identity).digest('hex')
  const key = `xingjian:v1:limit:${limit.bucket}:${hash}`
  let state: { count: number, retryAfter: number } | undefined
  try {
    const redis = await redisClient()
    if (redis) {
      const result = await redis.eval(atomicLimit, { keys: [key], arguments: [String(limit.windowSeconds)] }) as number[]
      state = { count: Number(result[0]), retryAfter: Math.max(1, Number(result[1])) }
    }
  } catch { /* Local fallback keeps the site usable during a Redis outage. */ }
  state ??= localLimit(key, limit)
  if (state.count > limit.max) {
    setResponseHeader(event, 'Retry-After', state.retryAfter)
    throw createError({ statusCode: 429, statusMessage: '请求过于频繁，请稍后再试' })
  }
})
