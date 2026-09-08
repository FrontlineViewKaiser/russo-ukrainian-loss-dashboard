import { STATUSES, ymOf } from './normalize.js'

/**
 * Normalises a WarSpotting snapshot into the record shape the rest of the app already
 * uses, so `buildCube`, `buildTypeCube` and every chart work on it untouched.
 *
 * Where it differs from the Oryx data, and why:
 *
 *  - `weight` is always 1. WarSpotting publishes one record per vehicle, so the
 *    multi-vehicle parsing the Oryx files need has no counterpart here.
 *  - Every record carries an ISO date, so there is no undated subset at all - the
 *    "undated excluded" caveat that applies to Oryx simply does not arise.
 *  - Only four outcomes exist. There are no compound states, so the canonical
 *    "Damaged and abandoned" / "Damaged and captured" buckets are never populated.
 *  - `type` is WarSpotting's own taxonomy (18 values), deliberately NOT translated into
 *    Oryx's 23 categories: only 7 names coincide and several have no counterpart at all.
 */

/** The four outcomes the API documents, mapped onto our canonical names. */
const STATUS_MAP = {
  destroyed: 'Destroyed',
  captured: 'Captured',
  damaged: 'Damaged',
  abandoned: 'Abandoned',
}

/** Outcomes our model supports that this source can never produce. */
export const UNREACHABLE_STATUSES = STATUSES.filter(
  (s) => s !== 'Other' && !Object.values(STATUS_MAP).includes(s),
)

/** "43.388299,40.005066" -> [lat, lon], or null. */
function parseGeo(raw) {
  if (!raw || typeof raw !== 'string') return null
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw)
  if (!m) return null
  const lat = +m[1]
  const lon = +m[2]
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return [lat, lon]
}

/** "2026-09-03" -> Date, rejecting anything malformed or rolled over. */
function parseDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || '').trim())
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null
  return d
}

export function flattenWarspotting(json) {
  const out = []
  for (const l of json?.losses || []) {
    const date = parseDate(l.date)
    const status = STATUS_MAP[String(l.status || '').trim().toLowerCase()] || 'Other'
    out.push({
      key: `ws-${l.id}`,
      id: l.id,
      cat: (l.type || 'Other').trim(),
      typeName: (l.model || 'Unknown').trim(),
      statusRaw: l.status || '',
      status,
      weight: 1,
      typeTotal: null,
      img: '',
      date,
      t: date ? date.getTime() : null,
      ym: date ? ymOf(date) : null,
      // Fields with no Oryx counterpart.
      place: l.nearest_location || '',
      geo: parseGeo(l.geo),
      unit: l.unit || '',
      tags: l.tags ? String(l.tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
    })
  }
  return out
}

/** Facts the compatibility panel reports, derived from the snapshot rather than asserted. */
export function warspottingCoverage(rows, json) {
  const withGeo = rows.filter((r) => r.geo).length
  const withPlace = rows.filter((r) => r.place).length
  const withUnit = rows.filter((r) => r.unit).length
  const withTags = rows.filter((r) => r.tags.length).length
  const pct = (n) => (rows.length ? Math.round((100 * n) / rows.length) : 0)
  return {
    fetchedAt: json?.fetchedAt || null,
    apiTotals: json?.stats?.counts_by_status || null,
    undated: rows.filter((r) => r.t == null).length,
    withGeo, withPlace, withUnit, withTags,
    geoPct: pct(withGeo), placePct: pct(withPlace), unitPct: pct(withUnit), tagsPct: pct(withTags),
    statusesPresent: [...new Set(rows.map((r) => r.status))],
  }
}
