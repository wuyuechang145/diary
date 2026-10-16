import dotenv from 'dotenv'
import mysql, { type Pool } from 'mysql2/promise'
import { environmentValue } from './environment'

dotenv.config({ quiet: true })

declare global {
  // Reuse the pool across Nuxt development hot reloads.
  var __xingjianMysqlPool: Pool | undefined
}

function requiredEnvironment(name: string) {
  const value = environmentValue(name)
  if (!value) throw new Error(`Missing required database environment variable: ${name}`)
  return value
}

function databaseConfig() {
  const portValue = Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10)
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error('MYSQL_PORT must be a valid TCP port')
  }
  return {
    host: requiredEnvironment('MYSQL_HOST'),
    port: portValue,
    database: requiredEnvironment('MYSQL_DATABASE'),
    user: requiredEnvironment('MYSQL_USER'),
    password: requiredEnvironment('MYSQL_PASSWORD'),
  }
}

function poolSize() {
  const value = Number(process.env.MYSQL_POOL_SIZE ?? '10')
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error('MYSQL_POOL_SIZE must be an integer from 1 to 50')
  }
  return value
}

export function database() {
  if (!globalThis.__xingjianMysqlPool) {
    const size = poolSize()
    globalThis.__xingjianMysqlPool = mysql.createPool({
      ...databaseConfig(),
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: size,
      maxIdle: size,
      idleTimeout: 60_000,
      queueLimit: 100,
      connectTimeout: 5_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  return globalThis.__xingjianMysqlPool
}

export async function verifyDatabaseConnection() {
  await database().query('SELECT 1')
}

export function toMysqlDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 23).replace('T', ' ')
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

export function fromMysqlDate(value: string | Date | null | undefined) {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).toISOString()
}
