import { createError, getHeader, getRequestURL, setResponseHeader } from 'h3'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin
  }
  catch {
    return ''
  }
}

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/') || !MUTATING_METHODS.has(event.method)) return

  setResponseHeader(event, 'vary', 'Origin, Sec-Fetch-Site')

  const fetchSite = getHeader(event, 'sec-fetch-site')?.toLowerCase()
  if (fetchSite === 'cross-site') {
    throw createError({ statusCode: 403, statusMessage: '请求来源不可信' })
  }

  const origin = getHeader(event, 'origin')
  if (!origin) return

  const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim() || useRuntimeConfig(event).publicOrigin
  const expectedOrigin = normalizedOrigin(
    typeof configuredOrigin === 'string' && configuredOrigin
      ? configuredOrigin
      : getRequestURL(event).origin,
  )

  if (!expectedOrigin || normalizedOrigin(origin) !== expectedOrigin) {
    throw createError({ statusCode: 403, statusMessage: '请求来源不可信' })
  }
})
