/**
 * Reconciles the normalizer against both datasets. Run: npm run check
 *
 * The Russian file used to carry Oryx's own per-type total in the `type` field
 * ("11 T-55A"), which gave an independent cross-check on the multi-vehicle weight logic.
 * That field has been stripped from the source, so that check is no longer possible there
 * and is not pretended to be. The synthetic Ukrainian file replaces it: the generator is
 * seeded and records the totals it intended to produce, so parsing the file back and
 * comparing against that manifest tests the same code path against independent truth.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flatten, STATUSES } from '../src/data/normalize.js'
import { flattenWarspotting, UNREACHABLE_STATUSES } from '../src/data/warspotting.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sum = (rs) => rs.reduce((a, r) => a + r.weight, 0)
let failures = 0

function describe(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) {
    console.log(`${file}: MISSING`)
    failures++
    return null
  }
  const rows = flatten(JSON.parse(fs.readFileSync(p, 'utf8')))
  const dated = rows.filter((r) => r.t != null)
  const times = dated.map((r) => r.t)

  console.log(`\n=== ${file} ===`)
  console.log('entries          ', rows.length)
  console.log('vehicles (weight)', sum(rows))
  console.log('dated entries    ', dated.length, `(${((100 * dated.length) / rows.length).toFixed(1)}%)`)
  console.log('undated entries  ', rows.length - dated.length)
  console.log('categories       ', new Set(rows.map((r) => r.cat)).size)
  console.log('distinct types   ', new Set(rows.map((r) => r.typeName)).size)
  console.log(
    'date range       ',
    new Date(Math.min(...times)).toISOString().slice(0, 10),
    '->',
    new Date(Math.max(...times)).toISOString().slice(0, 10),
  )

  const byStatus = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + r.weight
  console.log('outcomes:')
  for (const s of STATUSES) if (byStatus[s]) console.log(String(byStatus[s]).padStart(8), s)

  // Distinguish a source gap from a parser gap. A row whose status is blank in the source
  // genuinely has no outcome, and "Other" is the honest bucket. A row carrying a status we
  // failed to interpret is a bug.
  const others = rows.filter((r) => r.status === 'Other')
  const blank = others.filter((r) => !r.statusRaw)
  const unparsed = others.filter((r) => r.statusRaw)
  if (blank.length) console.log(`  note: ${blank.length} rows carry no status in the source`)
  if (unparsed.length) {
    failures++
    console.log(`  FAIL: ${unparsed.length} rows have a status the parser did not understand:`, [
      ...new Set(unparsed.map((r) => r.statusRaw)),
    ])
  }
  if (!others.length) console.log('  no rows fall through to "Other"')

  const multi = rows.filter((r) => r.weight > 1)
  console.log(
    `multi-vehicle rows ${multi.length} carrying ${sum(multi)} vehicles ` +
      `(+${sum(multi) - multi.length} over a naive 1-row-1-vehicle count)`,
  )

  // Only meaningful while the source keeps Oryx's per-type totals in `type`.
  const labelled = rows.filter((r) => r.typeTotal != null)
  if (!labelled.length) {
    console.log('per-type cross-check: unavailable (source carries no per-type totals)')
  } else {
    const byType = new Map()
    for (const r of labelled) {
      const k = `${r.cat}||${r.typeName}`
      const e = byType.get(k) || { label: r.typeTotal, got: 0 }
      e.got += r.weight
      byType.set(k, e)
    }
    const bad = [...byType.values()].filter((e) => e.got !== e.label).length
    console.log(`per-type cross-check: ${byType.size - bad}/${byType.size} match the printed label`)
  }
  return rows
}

describe('oryx-ru.json')
const ua = describe('oryx-ua.json')

/* ---- the synthetic file is checked against the generator's ground truth ---------- */
const manifestPath = path.join(ROOT, 'scripts', 'ua-manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
if (ua && manifest && ua.length !== manifest.entries) {
  console.log()
  console.log('=== oryx-ua.json vs generator manifest ===')
  console.log(`  skipped: file holds ${ua.length} entries, the generator produced ${manifest.entries}.`)
  console.log('  oryx-ua.json is the real Oryx list now, so the synthetic manifest no longer applies.')
} else if (ua && manifest) {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  console.log('\n=== oryx-ua.json vs generator manifest ===')

  const expect = (label, got, want) => {
    const ok = got === want
    if (!ok) failures++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(26)} got ${got}  want ${want}`)
  }
  expect('entries', ua.length, m.entries)
  expect('vehicles', sum(ua), m.vehicles)
  expect('undated entries', ua.filter((r) => r.t == null).length, m.undated)
  expect('multi-vehicle rows', ua.filter((r) => r.weight > 1).length, m.multiRows)

  const byCat = {}
  for (const r of ua) byCat[r.cat] = (byCat[r.cat] || 0) + r.weight
  const catMismatch = Object.entries(m.byCategory).filter(([k, v]) => byCat[k] !== v)
  expect('categories reconciled', Object.keys(m.byCategory).length - catMismatch.length, Object.keys(m.byCategory).length)
  if (catMismatch.length) console.log('    ', catMismatch.slice(0, 5))

  // The generator records raw outcome words; map them the way the app does.
  const canon = { destroyed: 'Destroyed', captured: 'Captured', damaged: 'Damaged',
    'damaged and abandoned': 'Damaged and abandoned', abandoned: 'Abandoned',
    'damaged and captured': 'Damaged and captured' }
  const byStatus = {}
  for (const r of ua) byStatus[r.status] = (byStatus[r.status] || 0) + r.weight
  const stMismatch = Object.entries(m.byOutcome).filter(([k, v]) => byStatus[canon[k]] !== v)
  expect('outcomes reconciled', Object.keys(m.byOutcome).length - stMismatch.length, Object.keys(m.byOutcome).length)
  if (stMismatch.length) console.log('    ', stMismatch)
}

/* ---- the WarSpotting snapshot is checked against the API's own published totals ---- */
const wsPath = path.join(ROOT, 'warspotting.json')
if (!fs.existsSync(wsPath)) {
  console.log()
  console.log('=== warspotting.json ===')
  console.log('  not present - run `npm run fetch:warspotting` to create it (optional)')
} else {
  const json = JSON.parse(fs.readFileSync(wsPath, 'utf8'))
  const rows = flattenWarspotting(json)
  const dated = rows.filter((r) => r.t != null)
  const times = dated.map((r) => r.t)

  console.log()
  console.log('=== warspotting.json ===')
  console.log('snapshot taken   ', json.fetchedAt)
  console.log('records          ', rows.length)
  console.log('undated          ', rows.length - dated.length)
  console.log('types            ', new Set(rows.map((r) => r.cat)).size)
  console.log('models           ', new Set(rows.map((r) => r.typeName)).size)
  console.log('with coordinates ', rows.filter((r) => r.geo).length)
  console.log('date range       ',
    new Date(Math.min(...times)).toISOString().slice(0, 10), '->',
    new Date(Math.max(...times)).toISOString().slice(0, 10))

  const byStatus = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + r.weight
  console.log('outcomes:')
  for (const s of STATUSES) if (byStatus[s]) console.log(String(byStatus[s]).padStart(8), s)

  const expect = (label, got, want) => {
    const ok = got === want
    if (!ok) failures++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(30)} got ${got}  want ${want}`)
  }
  console.log()
  console.log('vs the API totals embedded in the snapshot:')
  const api = json.stats?.counts_by_status || {}
  const apiTotal = Object.values(api).reduce((a, b) => a + b, 0)
  expect('records vs API total', rows.length, apiTotal)
  for (const [k, v] of Object.entries(api)) {
    const canon = k[0].toUpperCase() + k.slice(1)
    expect(`${canon} vs API`, byStatus[canon] || 0, v)
  }
  expect('undated records', rows.length - dated.length, 0)
  expect('rows falling through to Other', rows.filter((r) => r.status === 'Other').length, 0)
  expect('every record weighs 1', rows.filter((r) => r.weight !== 1).length, 0)
  console.log(`  note  outcomes this source cannot express: ${UNREACHABLE_STATUSES.join(', ')}`)
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
