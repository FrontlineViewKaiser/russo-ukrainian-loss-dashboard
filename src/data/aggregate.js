/**
 * Pure aggregation helpers. Everything sums `weight`, never row count, so the rows
 * that document two vehicles at once are counted as two.
 */

const DAY = 86400000

export const GRANULARITIES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
]

/** Start of the bucket containing `ts`, as a UTC timestamp (weeks start Monday). */
export function bucketStart(ts, g) {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (g === 'week') {
    const dow = (d.getUTCDay() + 6) % 7
    return Date.UTC(y, m, d.getUTCDate() - dow)
  }
  if (g === 'quarter') return Date.UTC(y, Math.floor(m / 3) * 3, 1)
  return Date.UTC(y, m, 1)
}

function nextBucket(ts, g) {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (g === 'week') return ts + 7 * DAY
  if (g === 'quarter') return Date.UTC(y, m + 3, 1)
  return Date.UTC(y, m + 1, 1)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function bucketLabel(ts, g) {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (g === 'week') return `${d.getUTCDate()} ${MONTHS[m]} ${y}`
  if (g === 'quarter') return `Q${Math.floor(m / 3) + 1} ${y}`
  return `${MONTHS[m]} ${y}`
}

/** Short form for axis ticks, where space is tight. */
export function tickLabel(ts, g) {
  const d = new Date(ts)
  const y = String(d.getUTCFullYear()).slice(2)
  const m = d.getUTCMonth()
  if (g === 'week') return `${d.getUTCDate()} ${MONTHS[m]}`
  if (g === 'quarter') return `Q${Math.floor(m / 3) + 1} '${y}`
  return `${MONTHS[m]} '${y}`
}

/**
 * Every bucket from `min` to `max` inclusive - including empty ones. Zero-filling is
 * what keeps cumulative lines monotonic and stops quiet weeks from being skipped.
 */
export function bucketAxis(min, max, g) {
  const out = []
  for (let ts = bucketStart(min, g); ts <= max; ts = nextBucket(ts, g)) out.push(ts)
  return out
}

/**
 * Equipment-type totals inside a time window, descending.
 *
 * Unlike every other figure on the page this cannot come from the cube: the cube indexes
 * (category, status, bucket), and giving equipment types their own time dimension would
 * cost about 3.8 MB per dataset at week resolution to save roughly two milliseconds. A
 * single filtered pass over the rows is the better trade.
 *
 * `fromTs`/`toTs` are a half-open range of timestamps, so callers pass the start of the
 * first bucket and the start of the bucket after the last.
 */
export function totalsByTypeInWindow(rows, catSet, statusSet, fromTs, toTs) {
  const acc = new Map()
  for (const r of rows) {
    if (r.t == null || r.t < fromTs || r.t >= toTs) continue
    if (!catSet.has(r.cat) || !statusSet.has(r.status)) continue
    acc.set(r.typeName, (acc.get(r.typeName) || 0) + r.weight)
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

/** Weighted totals by an arbitrary key, sorted descending. */
export function totalsBy(records, keyFn) {
  const m = new Map()
  for (const r of records) {
    const k = keyFn(r)
    if (k == null) continue
    m.set(k, (m.get(k) || 0) + r.weight)
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

/** Compact "Mar 23 - Aug 24" label for a brushed window; null when it spans everything. */
export function rangeLabel(axis, granularity, from, to) {
  if (!axis?.length) return null
  const a = Math.max(0, from ?? 0)
  const b = Math.min(axis.length - 1, to ?? axis.length - 1)
  if (a === 0 && b === axis.length - 1) return null
  const short = (ts) => tickLabel(ts, granularity).replace(/'/, "")
  return a === b ? short(axis[a]) : `${short(axis[a])} – ${short(axis[b])}`
}

export const sumWeight = (records) => records.reduce((a, r) => a + r.weight, 0)

export const fmt = (n) => n.toLocaleString('en-US')
