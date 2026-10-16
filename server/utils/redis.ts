import dotenv from 'dotenv'
import { createClient } from 'redis'
import { environmentValue } from './environment'

dotenv.config({ quiet: true })

type RedisClient = ReturnType<typeof createClient>

declare global {
  var __xingjianRedis: RedisClient | undefined
  var __xingjianRedisConnecting: Promise<RedisClient | undefined> | undefined
  var __xingjianRedisRetryAt: number | undefined
}

export async function redisClient(): Promise<RedisClient | undefined> {
  const url = redisUrl()
  if (!url) return undefined
  try {
    if (!['redis:', 'rediss:'].includes(new URL(url).protocol)) return undefined
  } catch {
    return undefined
  }
  const existing = globalThis.__xingjianRedis
  if (existing?.isReady) return existing
  if (existing?.isOpen) return undefined
  if (existing) {
    globalThis.__xingjianRedis = undefined
    globalThis.__xingjianRedisRetryAt = Date.now() + 15_000
  }
  if (globalThis.__xingjianRedisConnecting) return globalThis.__xingjianRedisConnecting
  if (Date.now() < (globalThis.__xingjianRedisRetryAt ?? 0)) return undefined

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: (retries) => retries > 1 ? new Error('Redis unavailable') : 300,
    },
  })
  // node-redis requires an error listener, including during reconnection.
  client.on('error', () => {})
  globalThis.__xingjianRedisConnecting = client.connect().then(() => {
    globalThis.__xingjianRedis = client
    return client
  }).catch(() => {
    globalThis.__xingjianRedisRetryAt = Date.now() + 15_000
    if (client.isOpen) client.destroy()
    return undefined
  }).finally(() => {
    globalThis.__xingjianRedisConnecting = undefined
  })
  return globalThis.__xingjianRedisConnecting
}

function redisUrl() {
  const configured = environmentValue('REDIS_URL')
  if (configured) return configured

  const host = environmentValue('REDIS_HOST')
  if (!host) return undefined
  const port = Number.parseInt(process.env.REDIS_PORT ?? '6379', 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined

  const url = new URL(`redis://${host}:${port}`)
  const password = environmentValue('REDIS_PASSWORD')
  if (password) {
    url.username = 'default'
    url.password = password
  }
  return url.toString()
}

export function redisIsConfigured() {
  return Boolean(environmentValue('REDIS_URL') || environmentValue('REDIS_HOST'))
}

export async function publicListVersion() {
  try {
    const client = await redisClient()
    return client ? (await client.get('xingjian:v1:public:version')) ?? '0' : undefined
  } catch {
    return undefined
  }
}

export async function invalidatePublicLists() {
  try {
    const client = await redisClient()
    if (client) await client.incr('xingjian:v1:public:version')
  } catch {
    // MySQL is authoritative; a short TTL and permission-checked row fetch protect stale IDs.
  }
}
