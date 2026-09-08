/**
 * Snapshots the WarSpotting catalogue of documented Russian losses.
 * Run: npm run fetch:warspotting   (~237 requests, roughly 5 minutes)
 *
 * The API has no bulk export: pages are 100 records keyed by id, and the published limit
 * is 10 requests per 10 seconds. So this runs once, writes warspotting.json, and the app
 * reads that static file - no API traffic at runtime.
 *
 * Paging walks `cursor = lastId + 1`. Ids are strictly increasing but sparse (page one
 * covers ids 1..144), so the cursor must come from the last record, not from a count.
 *
 * A User-Agent header is mandatory; without one the service answers 520.
 *
 * It also stores /api/stats/russia, which gives an independent cross-check: the number of
 * records we fetched must equal the totals the API itself publishes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://ukr.warspotting.net'
const HEADERS = { 'User-Agent': 'oryx-visualizer/0.1 (local analysis tool)' }
const PAGE = 100
const DELAY_MS = 1200 // 10 req / 10 s is the published cap; stay comfortably inside it

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(pathname, attempt = 1) {
  const res = await fetch(BASE + pathname, { headers: HEADERS })
  if (res.ok) return res.json()

  // 429 = rate limited, 5xx = transient (520 usually means the UA header was dropped).
  if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
    const wait = DELAY_MS * 2 ** attempt
    console.warn(`  HTTP ${res.status} on ${pathname}; retrying in ${wait}ms (attempt ${attempt})`)
    await sleep(wait)
    return getJson(pathname, attempt + 1)
  }
  throw new Error(`HTTP ${res.status} for ${pathname}`)
}

console.log('Fetching /api/stats/russia …')
const stats = await getJson('/api/stats/russia')
const expected = Object.values(stats.counts_by_status).reduce((a, b) => a + b, 0)
console.log('  API reports', expected, 'losses:', JSON.stringify(stats.counts_by_status))
console.log(`  ~${Math.ceil(expected / PAGE)} pages at ${PAGE}/page\n`)

const losses = []
const seen = new Set()
let cursor = 1
let pages = 0
const started = Date.now()

for (;;) {
  await sleep(DELAY_MS)
  const { losses: batch } = await getJson(`/api/losses/russia/${cursor}`)
  pages++
  if (!batch?.length) break

  for (const l of batch) {
    if (seen.has(l.id)) continue // defensive: paging should never overlap
    seen.add(l.id)
    losses.push(l)
  }

  const last = batch[batch.length - 1].id
  const pct = Math.min(100, Math.round((100 * losses.length) / expected))
  const elapsed = (Date.now() - started) / 1000
  const eta = losses.length ? Math.round((elapsed / losses.length) * (expected - losses.length)) : 0
  process.stdout.write(
    `\r  page ${String(pages).padStart(3)}  ${String(losses.length).padStart(6)}/${expected}  ${String(pct).padStart(3)}%  last id ${String(last).padStart(6)}  eta ${eta}s   `,
  )

  if (batch.length < PAGE) break
  if (last + 1 <= cursor) {
    console.warn('\n  cursor stopped advancing; stopping to avoid an infinite loop')
    break
  }
  cursor = last + 1
}

console.log('\n')

// ---- report, and cross-check against the API's own published totals -------------
const dates = losses.map((l) => l.date).filter(Boolean).sort()
const statuses = {}
for (const l of losses) statuses[l.status] = (statuses[l.status] || 0) + 1
const types = new Set(losses.map((l) => l.type))
const undated = losses.filter((l) => !l.date).length
const withGeo = losses.filter((l) => l.geo).length

console.log('records      ', losses.length, `(API reported ${expected}, delta ${losses.length - expected})`)
console.log('pages        ', pages)
console.log('date range   ', dates[0], '->', dates[dates.length - 1])
console.log('undated      ', undated)
console.log('types        ', types.size)
console.log('with geo     ', withGeo, `(${((100 * withGeo) / losses.length).toFixed(1)}%)`)
console.log('statuses     ', JSON.stringify(statuses))

fs.writeFileSync(
  path.join(ROOT, 'warspotting.json'),
  JSON.stringify({ fetchedAt: new Date().toISOString(), source: BASE + '/api/docs/', stats, losses }),
)
const mb = fs.statSync(path.join(ROOT, 'warspotting.json')).size / 1048576
console.log(`\nwarspotting.json written (${mb.toFixed(1)} MB)`)
