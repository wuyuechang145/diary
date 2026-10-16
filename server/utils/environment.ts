import { readFileSync } from 'node:fs'

const fileValueCache = new Map<string, string>()

export function environmentValue(name: string) {
  const direct = process.env[name]?.trim()
  if (direct) return direct

  const file = process.env[`${name}_FILE`]?.trim()
  if (!file) return undefined
  const cached = fileValueCache.get(file)
  if (cached) return cached

  try {
    const value = readFileSync(file, 'utf8').trim()
    if (!value) return undefined
    fileValueCache.set(file, value)
    return value
  }
  catch {
    throw new Error(`Unable to read ${name}_FILE`)
  }
}
