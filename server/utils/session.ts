import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createError, deleteCookie, getCookie, getRequestURL, setCookie, type H3Event } from 'h3'
import { environmentValue } from './environment'

export type SessionActor = {
  id: string
  name: string
  canClaimLegacy: boolean
  isAuthenticated: boolean
}

const DEVELOPMENT_COOKIE_NAME = 'xingjian_session'
const PRODUCTION_COOKIE_NAME = '__Host-xingjian_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 365
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function signatureFor(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function sessionSecret(event: H3Event) {
  const secret = environmentValue('NUXT_SESSION_SECRET') || useRuntimeConfig(event).sessionSecret
  if (typeof secret !== 'string' || secret.length < 32) {
    throw createError({ statusCode: 500, statusMessage: '服务端尚未配置安全的会话密钥' })
  }
  return secret
}

function validSignature(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function secureCookie(event: H3Event) {
  const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim() || useRuntimeConfig(event).publicOrigin
  if (typeof configuredOrigin === 'string' && configuredOrigin) {
    try {
      const url = new URL(configuredOrigin)
      if (url.protocol === 'https:') return true
      if (url.protocol === 'http:' && isLoopback(url.hostname)) return false
      if (process.env.NODE_ENV === 'production') {
        throw createError({ statusCode: 500, statusMessage: '生产 PUBLIC_ORIGIN 必须使用 HTTPS（localhost 除外）' })
      }
    }
    catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
      throw createError({ statusCode: 500, statusMessage: 'PUBLIC_ORIGIN 格式无效' })
    }
  }
  return process.env.NODE_ENV === 'production' || getRequestURL(event).protocol === 'https:'
}

function cookieOptions(event: H3Event) {
  const secure = secureCookie(event)
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  }
}

function cookieName(event: H3Event) {
  return secureCookie(event) ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME
}

function setGuestCookie(event: H3Event, sessionId: string, secret: string) {
  const value = `g:${sessionId}`
  setCookie(event, cookieName(event), `g.${sessionId}.${signatureFor(value, secret)}`, cookieOptions(event))
}

export function setAuthenticatedSession(event: H3Event, user: { id: string; displayName: string }) {
  const secret = sessionSecret(event)
  const encodedName = Buffer.from(user.displayName, 'utf8').toString('base64url')
  const value = `u:${user.id}:${encodedName}`
  setCookie(event, cookieName(event), `u.${user.id}.${encodedName}.${signatureFor(value, secret)}`, cookieOptions(event))
}

export function clearAuthSession(event: H3Event) {
  const secure = secureCookie(event)
  deleteCookie(event, cookieName(event), { path: '/', secure, sameSite: 'lax' })
}

export function getSessionActor(event: H3Event): SessionActor {
  const secret = sessionSecret(event)
  const cookie = getCookie(event, cookieName(event))
  const parts = cookie?.split('.') ?? []

  if (parts[0] === 'u' && parts.length === 4) {
    const [, candidateId = '', encodedName = '', candidateSignature = ''] = parts
    const value = `u:${candidateId}:${encodedName}`
    if (ID_PATTERN.test(candidateId) && validSignature(candidateSignature, signatureFor(value, secret))) {
      const name = Buffer.from(encodedName, 'base64url').toString('utf8').slice(0, 24)
      if (name) {
        return {
          id: `user:${candidateId}`,
          name,
          canClaimLegacy: false,
          isAuthenticated: true,
        }
      }
    }
  }

  const isVersionedGuest = parts[0] === 'g' && parts.length === 3
  const candidateId = isVersionedGuest ? parts[1] ?? '' : parts[0] ?? ''
  const candidateSignature = isVersionedGuest ? parts[2] ?? '' : parts[1] ?? ''
  const signedValue = isVersionedGuest ? `g:${candidateId}` : candidateId
  const valid = ID_PATTERN.test(candidateId)
    && validSignature(candidateSignature, signatureFor(signedValue, secret))
  const sessionId = valid ? candidateId : randomUUID()

  if (!valid) setGuestCookie(event, sessionId, secret)

  return {
    id: `guest:${sessionId}`,
    name: `星友 ${sessionId.slice(0, 4).toUpperCase()}`,
    canClaimLegacy: false,
    isAuthenticated: false,
  }
}
