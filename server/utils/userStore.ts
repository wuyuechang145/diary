import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createError } from 'h3'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { database, fromMysqlDate, toMysqlDate } from './database'

const scrypt = promisify(scryptCallback)

export type UserRecord = {
  id: string
  email: string
  displayName: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  updatedAt: string
}

interface UserRow extends RowDataPacket {
  id: string
  email: string
  display_name: string
  password_hash: string
  password_salt: string
  created_at: string
  updated_at: string
}

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: fromMysqlDate(row.created_at)!,
    updatedAt: fromMysqlDate(row.updated_at)!,
  }
}

async function findByEmail(email: string) {
  const [rows] = await database().execute<UserRow[]>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email],
  )
  return rows[0] ? fromRow(rows[0]) : undefined
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US').slice(0, 160) : ''
}

export function validateRegistration(input: Record<string, unknown>) {
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 24) : ''
  const email = normalizeEmail(input.email)
  const password = typeof input.password === 'string' ? input.password : ''

  if (displayName.length < 2) throw createError({ statusCode: 422, statusMessage: '昵称至少需要 2 个字符' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 422, statusMessage: '请填写有效的邮箱地址' })
  }
  if (password.length < 8 || password.length > 128) {
    throw createError({ statusCode: 422, statusMessage: '密码需为 8—128 个字符' })
  }
  return { displayName, email, password }
}

async function passwordDigest(password: string, salt: string) {
  return Buffer.from(await scrypt(password, salt, 64) as ArrayBuffer).toString('base64url')
}

export async function createUser(input: Record<string, unknown>) {
  const { displayName, email, password } = validateRegistration(input)
  if (await findByEmail(email)) {
    throw createError({ statusCode: 409, statusMessage: '这个邮箱已经抵达过星笺，请直接登录' })
  }

  const now = new Date().toISOString()
  const salt = randomBytes(16).toString('base64url')
  const record: UserRecord = {
    id: randomUUID(),
    email,
    displayName,
    passwordHash: await passwordDigest(password, salt),
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await database().execute<ResultSetHeader>(
      `INSERT INTO users
        (id, email, display_name, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.email, record.displayName, record.passwordHash, record.passwordSalt,
        toMysqlDate(record.createdAt), toMysqlDate(record.updatedAt)],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw createError({ statusCode: 409, statusMessage: '这个邮箱已经抵达过星笺，请直接登录' })
    }
    throw error
  }
  return record
}

export async function authenticateUser(input: Record<string, unknown>) {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === 'string' ? input.password : ''
  if (!email || !password) throw createError({ statusCode: 422, statusMessage: '请输入邮箱和密码' })

  const user = await findByEmail(email)
  if (!user) throw createError({ statusCode: 401, statusMessage: '邮箱或密码不正确' })

  const candidate = Buffer.from(await passwordDigest(password, user.passwordSalt), 'base64url')
  const expected = Buffer.from(user.passwordHash, 'base64url')
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw createError({ statusCode: 401, statusMessage: '邮箱或密码不正确' })
  }
  return user
}

export async function getUserByActorId(actorId: string) {
  if (!actorId.startsWith('user:')) return undefined
  const [rows] = await database().execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [actorId.slice(5)])
  return rows[0] ? fromRow(rows[0]) : undefined
}
