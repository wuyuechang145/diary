import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(process.env.XINGJIAN_SECRETS_DIR ?? '/run/xingjian-secrets')
const secrets = {
  mysql_password: 32,
  mysql_root_password: 40,
  redis_password: 32,
  session_secret: 48,
}

await mkdir(root, { recursive: true })

for (const [name, size] of Object.entries(secrets)) {
  const path = resolve(root, name)
  try {
    const handle = await open(path, 'wx', 0o444)
    try {
      await handle.writeFile(`${randomBytes(size).toString('base64url')}\n`, 'utf8')
    }
    finally {
      await handle.close()
    }
  }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const existing = (await readFile(path, 'utf8')).trim()
    if (existing.length < 32) throw new Error(`Stored secret ${name} is invalid`)
  }
  await chmod(path, 0o444)
}

console.log(JSON.stringify({ ok: true, initialized: Object.keys(secrets) }))
