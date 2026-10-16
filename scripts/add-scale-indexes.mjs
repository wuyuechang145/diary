import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ quiet: true })

const database = process.env.MYSQL_DATABASE?.trim()
if (!database || !/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('MYSQL_DATABASE is missing or invalid')
for (const name of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`)
}
const port = Number(process.env.MYSQL_PORT ?? 3306)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT is invalid')

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database,
})
try {
  const [[size]] = await connection.execute('SELECT COUNT(*) AS total FROM diaries')
  const [indices] = await connection.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'diaries' AND INDEX_NAME = 'idx_diaries_public_feed' LIMIT 1`,
    [database],
  )
  if (process.argv.includes('--plan')) {
    const [plan] = await connection.query(
      `EXPLAIN SELECT id, title FROM diaries WHERE status = 'published'
       AND visibility IN ('public', 'anonymous') ORDER BY published_at DESC, id DESC LIMIT 12`,
    )
    console.log(JSON.stringify({
      diaries: Number(size.total), publicFeedIndexExists: indices.length > 0,
      selectedIndex: plan[0]?.key ?? null, extra: plan[0]?.Extra ?? '',
    }))
  } else if (!indices.length) {
    await connection.query('CREATE INDEX idx_diaries_public_feed ON diaries (status, published_at DESC, id DESC)')
    console.log('Created public feed index.')
  } else {
    console.log('Public feed index already exists.')
  }
} finally {
  await connection.end()
}
