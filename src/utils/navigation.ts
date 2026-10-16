export function safeLocalRedirect(value: unknown, fallback = '/profile') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\')) return fallback
  try {
    const base = 'https://xingjian.local'
    const target = new URL(value, base)
    if (target.origin !== base || !target.pathname.startsWith('/') || target.pathname.startsWith('//')) return fallback
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}
