import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'

dotenv.config({ quiet: true })

function environmentValue(name) {
  const direct = process.env[name]?.trim()
  if (direct) return direct
  const file = process.env[`${name}_FILE`]?.trim()
  if (!file) return undefined
  const value = readFileSync(file, 'utf8').trim()
  return value || undefined
}

const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']
const missing = required.filter((name) => !environmentValue(name))
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`)

const database = environmentValue('MYSQL_DATABASE')
if (!/^[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error('MYSQL_DATABASE may contain only letters, numbers, and underscores')
}

const port = Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT is invalid')

const connectionOptions = {
  host: environmentValue('MYSQL_HOST'),
  port,
  user: environmentValue('MYSQL_USER'),
  password: environmentValue('MYSQL_PASSWORD'),
  database,
  charset: 'utf8mb4',
  timezone: 'Z',
}

async function connectWithRetry() {
  let lastError
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      return await mysql.createConnection(connectionOptions)
    }
    catch (error) {
      lastError = error
      if (attempt < 30) await new Promise(resolve => setTimeout(resolve, 1_000))
    }
  }
  throw lastError
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
    perspective VARCHAR(32) NOT NULL DEFAULT 'unspecified',
    category VARCHAR(48) NOT NULL DEFAULT 'unspecified',
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

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [database, table, column],
  )
  return rows.length > 0
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [database, table, index],
  )
  return rows.length > 0
}

const connection = await connectWithRetry()
let locked = false
try {
  const [[lock]] = await connection.execute("SELECT GET_LOCK('xingjian:schema', 30) AS acquired")
  if (Number(lock.acquired) !== 1) throw new Error('Could not acquire the database migration lock')
  locked = true

  for (const statement of schemaStatements) await connection.query(statement)

  if (!await columnExists(connection, 'diaries', 'perspective')) {
    await connection.query("ALTER TABLE diaries ADD COLUMN perspective VARCHAR(32) NOT NULL DEFAULT 'unspecified' AFTER emotion")
  }
  if (!await columnExists(connection, 'diaries', 'category')) {
    await connection.query("ALTER TABLE diaries ADD COLUMN category VARCHAR(48) NOT NULL DEFAULT 'unspecified' AFTER perspective")
  }
  if (!await indexExists(connection, 'diaries', 'idx_diaries_public_feed')) {
    await connection.query('CREATE INDEX idx_diaries_public_feed ON diaries (status, published_at DESC, id DESC)')
  }
  if (!await indexExists(connection, 'diaries', 'idx_diaries_filters')) {
    await connection.query('CREATE INDEX idx_diaries_filters ON diaries (perspective, category, emotion)')
  }

  await connection.execute(
    `INSERT INTO migration_history (migration_key, applied_at, details)
     VALUES ('schema-v1', UTC_TIMESTAMP(3), ?)
     ON DUPLICATE KEY UPDATE details=VALUES(details)`,
    [JSON.stringify({ schema: 1 })],
  )
  console.log(JSON.stringify({ ok: true, database, schema: 1 }))
}
finally {
  if (locked) await connection.execute("SELECT RELEASE_LOCK('xingjian:schema')")
  await connection.end()
}
