import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ quiet: true })

const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`)

const databaseName = process.env.MYSQL_DATABASE.trim()
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error('MYSQL_DATABASE may contain only letters, numbers, and underscores')
}
const port = Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT is invalid')

const connectionOptions = {
  host: process.env.MYSQL_HOST.trim(),
  port,
  user: process.env.MYSQL_USER.trim(),
  password: process.env.MYSQL_PASSWORD,
  charset: 'utf8mb4',
  timezone: 'Z',
}

let connection
try {
  connection = await mysql.createConnection({ ...connectionOptions, database: databaseName })
} catch (error) {
  if (error?.code !== 'ER_BAD_DB_ERROR') throw error

  const bootstrap = await mysql.createConnection(connectionOptions)
  try {
    await bootstrap.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } finally {
    await bootstrap.end()
  }
  connection = await mysql.createConnection({ ...connectionOptions, database: databaseName })
}
const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(160) NOT NULL UNIQUE,
    display_name VARCHAR(24) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    INDEX idx_users_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS diaries (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    author_name VARCHAR(24) NOT NULL,
    diary_date DATE NOT NULL,
    title VARCHAR(60) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    summary VARCHAR(320) NOT NULL,
    emotion VARCHAR(24) NOT NULL,
    perspective VARCHAR(32) NOT NULL,
    category VARCHAR(48) NOT NULL,
    visibility VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    attachments JSON NOT NULL,
    location VARCHAR(80) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    published_at DATETIME(3) NULL,
    CONSTRAINT fk_diaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_diaries_user_updated (user_id, updated_at DESC),
    INDEX idx_diaries_public (status, visibility, published_at DESC),
    INDEX idx_diaries_public_feed (status, published_at DESC, id DESC),
    INDEX idx_diaries_filters (perspective, category, emotion)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resonances (
    id CHAR(36) NOT NULL PRIMARY KEY,
    diary_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    type VARCHAR(32) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_resonances_diary FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE,
    CONSTRAINT fk_resonances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_resonance_diary_user (diary_id, user_id),
    INDEX idx_resonances_diary (diary_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS migration_history (
    migration_key VARCHAR(80) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL,
    details JSON NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]
for (const statement of schemaStatements) await connection.query(statement)

async function jsonFiles(directory, recursive = false) {
  const output = []
  let entries = []
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return output
    throw error
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && recursive) output.push(...await jsonFiles(path, true))
    if (entry.isFile()) output.push(JSON.parse(await readFile(path, 'utf8')))
  }
  return output
}

function mysqlDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 23).replace('T', ' ')
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

const dataRoot = resolve(process.cwd(), '.data')
const users = await jsonFiles(resolve(dataRoot, 'users', 'user'))
const diaries = await jsonFiles(resolve(dataRoot, 'diaries', 'diary'))
const resonances = await jsonFiles(resolve(dataRoot, 'resonances', 'resonance'), true)
const userIds = new Set(users.map((user) => user.id))
const diaryIds = new Set(diaries.map((diary) => diary.id))
let migratedUsers = 0
let migratedDiaries = 0
let migratedResonances = 0

await connection.beginTransaction()
try {
  for (const user of users) {
    await connection.execute(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email=VALUES(email), display_name=VALUES(display_name), password_hash=VALUES(password_hash), password_salt=VALUES(password_salt), updated_at=VALUES(updated_at)`,
      [user.id, user.email, user.displayName, user.passwordHash, user.passwordSalt, mysqlDate(user.createdAt), mysqlDate(user.updatedAt)],
    )
    migratedUsers += 1
  }

  for (const diary of diaries) {
    const userId = String(diary.authorId ?? '').replace(/^user:/, '')
    if (!userIds.has(userId)) continue
    await connection.execute(
      `INSERT INTO diaries (id, user_id, author_name, diary_date, title, content, summary, emotion, perspective, category, visibility, status, attachments, location, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE author_name=VALUES(author_name), diary_date=VALUES(diary_date), title=VALUES(title), content=VALUES(content), summary=VALUES(summary), emotion=VALUES(emotion), perspective=VALUES(perspective), category=VALUES(category), visibility=VALUES(visibility), status=VALUES(status), attachments=VALUES(attachments), location=VALUES(location), updated_at=VALUES(updated_at), published_at=VALUES(published_at)`,
      [diary.id, userId, diary.authorName, diary.date, diary.title, diary.content, diary.summary, diary.emotion ?? 'unspecified', diary.perspective ?? 'unspecified', diary.category ?? 'unspecified', diary.visibility, diary.status, JSON.stringify(diary.attachments ?? []), diary.location ?? null, mysqlDate(diary.createdAt), mysqlDate(diary.updatedAt), diary.publishedAt ? mysqlDate(diary.publishedAt) : null],
    )
    migratedDiaries += 1
  }

  for (const resonance of resonances) {
    const userId = String(resonance.userId ?? '').replace(/^user:/, '')
    if (!userIds.has(userId) || !diaryIds.has(resonance.diaryId)) continue
    await connection.execute(
      `INSERT INTO resonances (id, diary_id, user_id, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE type=VALUES(type), updated_at=VALUES(updated_at)`,
      [resonance.id, resonance.diaryId, userId, resonance.type, mysqlDate(resonance.createdAt), mysqlDate(resonance.updatedAt)],
    )
    migratedResonances += 1
  }

  const details = JSON.stringify({ users: migratedUsers, diaries: migratedDiaries, resonances: migratedResonances })
  await connection.execute(
    `INSERT INTO migration_history (migration_key, applied_at, details)
     VALUES ('fs-to-mysql-v1', ?, ?)
     ON DUPLICATE KEY UPDATE applied_at=VALUES(applied_at), details=VALUES(details)`,
    [mysqlDate(new Date().toISOString()), details],
  )
  await connection.commit()
} catch (error) {
  await connection.rollback()
  throw error
}

const [[userCount]] = await connection.query('SELECT COUNT(*) AS count FROM users')
const [[diaryCount]] = await connection.query('SELECT COUNT(*) AS count FROM diaries')
const [[resonanceCount]] = await connection.query('SELECT COUNT(*) AS count FROM resonances')
await connection.end()

console.log(JSON.stringify({
  migrated: { users: migratedUsers, diaries: migratedDiaries, resonances: migratedResonances },
  databaseTotals: { users: Number(userCount.count), diaries: Number(diaryCount.count), resonances: Number(resonanceCount.count) },
}))
