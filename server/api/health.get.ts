import { defineEventHandler } from 'h3'
import { verifyDatabaseConnection } from '../utils/database'
import { redisClient, redisIsConfigured } from '../utils/redis'

export default defineEventHandler(async () => {
  await verifyDatabaseConnection()
  const cache = !redisIsConfigured() ? 'disabled' : (await redisClient())?.isReady ? 'ready' : 'degraded'
  return {
    ok: true,
    service: 'xingjian-nitro',
    storage: 'mysql',
    cache,
    timestamp: new Date().toISOString(),
  }
})
