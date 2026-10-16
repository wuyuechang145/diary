// Bounded read-only baseline; never creates accounts or writes diary data.
const baseUrl = process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:5173'
const requests = Number(process.env.LOAD_REQUESTS ?? 100)
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10)
if (!Number.isInteger(requests) || requests < 1 || requests > 1000
  || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
  throw new Error('LOAD_REQUESTS must be 1..1000 and LOAD_CONCURRENCY must be 1..50')
}

const samples = []
const statuses = new Map()
let next = 0
const started = performance.now()
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
  while (next < requests) {
    const index = next++
    const path = index % 5 === 0 ? '/api/diaries?scope=public&page=2&limit=12' : '/api/diaries?scope=public&page=1&limit=12'
    const before = performance.now()
    try {
      const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(8_000) })
      await response.arrayBuffer()
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1)
    } catch {
      statuses.set('network-error', (statuses.get('network-error') ?? 0) + 1)
    }
    samples.push(performance.now() - before)
  }
}))
samples.sort((a, b) => a - b)
const percentile = (p) => Math.round(samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)] ?? 0)
console.log(JSON.stringify({
  requests, concurrency, durationMs: Math.round(performance.now() - started),
  p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  statuses: Object.fromEntries(statuses),
}))
