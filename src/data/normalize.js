/**
 * Pure parsers for the Oryx scrape. No DOM, no React - so `scripts/check-data.mjs`
 * can run the exact same code the browser runs and reconcile the totals.
 */

/**
 * Canonical status buckets in their fixed display order. Charts render them in this
 * order regardless of the filtered values, because the colour sequence in palette.js
 * is only validated for these adjacencies.
 */
export const STATUSES = [
  'Destroyed',
  'Captured',
  'Damaged',
  'Damaged and abandoned',
  'Abandoned',
  'Damaged and captured',
  'Other',
]

/**
 * The Russian and Ukrainian Oryx lists name two categories differently for what is the
 * same thing. Left unresolved this is not cosmetic: the comparison view matches categories
 * by name, so each side contributes a half-empty entry and one of them reports zero.
 *
 * Canonicalising here, at the point of entry, means either spelling resolves correctly even
 * if a future scrape reintroduces the split. `scripts/check-data.mjs` additionally fails if
 * the two datasets ever disagree on a category name that is not listed here.
 *
 * WarSpotting is deliberately NOT put through this: it keeps its own 18-value taxonomy,
 * where "Vessels" and "Radars, jammers" are different categories, not aliases of these.
 */
const CATEGORY_ALIASES = {
  Radars: 'Radars And Communications Equipment',
  'Naval Ships': 'Naval Ships and Submarines',
}

/** Resolves a source category name to the canonical one. */
export const canonicalCat = (name) => CATEGORY_ALIASES[String(name).trim()] || String(name).trim()

/**
 * Oryx writes multi-vehicle entries as a leading index list: "(6 and 7, destroyed)",
 * "154, 155, 156 and 157, destroyed", "(71 and 72 destroyed)". The parentheses,
 * the comma and the "and" are all inconsistent, so match the numbers instead.
 * Returns { indices, rest }.
 */
function splitIndexPrefix(s) {
  // A leading run of integers joined by commas and/or "and", optionally comma-terminated.
  // The optional leading "and" catches scraper truncation: "and 10, destroyed" is the
  // tail of "9 and 10, destroyed", so the dropped sibling still counts.
  const m = /^(and\s+)?(\d+(?:\s*(?:,|and)\s*\d+)*)\s*,?\s+(.*)$/.exec(s)
  if (!m) return { indices: [], rest: s, truncated: false }
  const indices = m[2].match(/\d+/g) || []
  return { indices, rest: m[3], truncated: Boolean(m[1]) }
}

/**
 * @returns {{ status: string, weight: number }} weight is the number of vehicles the
 * row accounts for - normally 1, but 2+ when one photo documented several.
 */
export function parseStatus(raw) {
  let s = String(raw || '').trim().toLowerCase()
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim()

  const { indices, rest, truncated } = splitIndexPrefix(s)
  const weight = Math.max(1, indices.length + (truncated ? 1 : 0))
  const t = rest || s

  // Flags, not exact strings: the tail contains typos ("damagd", "damage and captured"),
  // ship names ("b-237 'rostov-na-donu', damaged...") and qualifiers ("on the ground").
  const destroyed = /destroy|destr\b|sunk|scuttled/.test(t)
  const damaged = /damag/.test(t)
  const abandoned = /abandon/.test(t)
  const captured = /captur|defected/.test(t)

  // Final fate wins: "captured and later destroyed" is a destroyed vehicle.
  let status
  if (destroyed) status = 'Destroyed'
  else if (damaged && abandoned) status = 'Damaged and abandoned'
  else if (damaged && captured) status = 'Damaged and captured'
  else if (captured) status = 'Captured'
  else if (abandoned) status = 'Abandoned'
  else if (damaged) status = 'Damaged' // incl. "damaged beyond economical repair"
  else status = 'Other'

  return { status, weight }
}

const MIN_YEAR = 2022
const MAX_YEAR = 2026

/**
 * "18.02.24" -> Date(2024-02-18). Returns null for the ~29% of rows with no date
 * and for the handful of impossible ones (".02", ".33", 31.02, ...).
 */
export function parseDate(raw) {
  const s = String(raw || '').trim()
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s)
  if (!m) return null
  const day = +m[1]
  const month = +m[2]
  const year = 2000 + +m[3]
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  // Rejects 31.02 and friends, which JS would silently roll over.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d
}

/** '157 T-62M' -> { typeName: 'T-62M', typeTotal: 157 } */
export function parseType(raw) {
  const s = String(raw || '').trim()
  const m = /^(\d+)\s+(.*)$/.exec(s)
  if (!m) return { typeName: s || 'Unknown', typeTotal: null }
  return { typeName: m[2].trim(), typeTotal: +m[1] }
}

/** UTC-safe 'YYYY-MM'. */
export function ymOf(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Flattens the nested { Losses: { Category: [...] } } shape into one record array. */
export function flatten(json) {
  const losses = json?.Losses || {}
  const out = []
  for (const rawCat of Object.keys(losses)) {
    const cat = canonicalCat(rawCat)
    for (const e of losses[rawCat]) {
      const { status, weight } = parseStatus(e.status)
      const { typeName, typeTotal } = parseType(e.type)
      const date = parseDate(e.date)
      out.push({
        key: `${cat}-${e.id}`,
        cat,
        id: e.id,
        statusRaw: String(e.status || '').trim(),
        status,
        weight,
        typeName,
        typeTotal,
        img: e.img || '',
        date,
        ym: date ? ymOf(date) : null,
        t: date ? date.getTime() : null,
      })
    }
  }
  return out
}
