import { STATUSES } from './normalize.js'
import { bucketStart } from './aggregate.js'
import { GRAINS } from './cube.js'

/**
 * Encodes and decodes a page's view state in the URL hash, so any view can be linked,
 * bookmarked or pasted to someone else.
 *
 *   #/russia?cats=Tanks,Trucks and similar vehicles&b=quarter&cum=1&from=2023-02&to=2024-09
 *   #/comparison?cat=Tanks&b=week&sides=russia
 *
 * Three rules keep the links usable:
 *
 *  - Anything sitting at its default is omitted, so an untouched page is just `#/russia`
 *    and a link only carries what actually differs.
 *  - Categories and outcomes go in by NAME, not index. Indices would be far shorter, but a
 *    link would silently point at the wrong category the moment the source ordering changed.
 *    (No category or status name contains a comma, so joining on one is safe.)
 *  - The brush window is stored as bucket START DATES rather than indices, so a link still
 *    resolves when the recipient's bucket size differs from the sender's.
 *
 * Decoding never throws: anything unrecognised falls back to the default.
 */

const ALL = 'all'

/** Splits `#/route?query` into its parts. */
export function parseHash(hash = location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  const qi = raw.indexOf('?')
  return {
    route: (qi === -1 ? raw : raw.slice(0, qi)) || '',
    params: new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1)),
  }
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))

/** 'YYYY-MM' for month/quarter, 'YYYY-MM-DD' for week - enough to find the bucket again. */
const stamp = (ts, grain) => {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`
  return grain === 'week' ? `${base}-${p(d.getUTCDate())}` : base
}

/** Nearest bucket index for a stamp, or null if it is unparseable or outside the axis. */
function indexForStamp(axis, grain, text) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(text || '').trim())
  if (!m) return null
  const ts = Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1)
  if (Number.isNaN(ts)) return null
  const target = bucketStart(ts, grain)
  const exact = axis.indexOf(target)
  if (exact !== -1) return exact
  // Outside the axis or between buckets: clamp to the nearest, so an old link still opens.
  if (ts <= axis[0]) return 0
  if (ts >= axis[axis.length - 1]) return axis.length - 1
  let best = 0
  for (let i = 1; i < axis.length; i++) {
    if (Math.abs(axis[i] - ts) < Math.abs(axis[best] - ts)) best = i
  }
  return best
}

/* ------------------------------------------------------------------- encode -- */

/**
 * @param {object} filters current page state
 * @param {object} defaults the same shape at its defaults - anything equal is omitted
 * @param {object} ctx { allCats, axis } for the `all` sentinel and window stamps
 */
export function encodeFilters(filters, defaults, ctx = {}) {
  const p = new URLSearchParams()
  if (!filters || !defaults) return ''

  if (filters.granularity !== defaults.granularity) p.set('b', filters.granularity)
  if (filters.cumulative !== defaults.cumulative) p.set('cum', '1')
  if (filters.splitBy && filters.splitBy !== defaults.splitBy) p.set('split', filters.splitBy)

  if (filters.cats && defaults.cats && !sameSet(filters.cats, defaults.cats)) {
    const all = ctx.allCats || []
    p.set('cats', all.length && filters.cats.size === all.length ? ALL : [...filters.cats].join(','))
  }
  if (filters.cat !== undefined && filters.cat !== defaults.cat) p.set('cat', filters.cat ?? '')

  if (filters.statuses && defaults.statuses && !sameSet(filters.statuses, defaults.statuses)) {
    p.set('out', [...filters.statuses].join(','))
  }
  if (filters.shown && defaults.shown && !sameSet(filters.shown, defaults.shown)) {
    p.set('sides', [...filters.shown].join(','))
  }

  // The window is only meaningful against an axis, and only worth writing when narrowed.
  // Resolve the axis for the CURRENT grain: callers pass axisFor, since the axis changes
  // with the bucket size and the indices in `range` are relative to it.
  const axis = ctx.axisFor ? ctx.axisFor(filters.granularity) : ctx.axis
  const r = filters.range
  if (axis?.length && Array.isArray(r)) {
    const [from, to] = r
    if (from > 0 || to < axis.length - 1) {
      p.set('from', stamp(axis[Math.max(0, from)], filters.granularity))
      p.set('to', stamp(axis[Math.min(axis.length - 1, to)], filters.granularity))
    }
  }
  return p.toString()
}

/* ------------------------------------------------------------------- decode -- */

/** Returns a filters object: defaults, overridden by whatever the URL validly supplies. */
export function decodeFilters(params, defaults, ctx = {}) {
  if (!params || !defaults) return defaults
  const out = { ...defaults }

  const b = params.get('b')
  if (b && GRAINS.includes(b)) out.granularity = b

  if (params.has('cum')) out.cumulative = params.get('cum') !== '0'

  const split = params.get('split')
  if (split === 'key' || split === 'outcome') out.splitBy = split

  const allCats = ctx.allCats || []
  const cats = params.get('cats')
  if (cats != null && defaults.cats) {
    if (cats === ALL) out.cats = new Set(allCats)
    else {
      const known = cats.split(',').map((s) => s.trim()).filter((s) => allCats.includes(s))
      // An empty result would blank the page; keep the default rather than show nothing.
      if (known.length) out.cats = new Set(known)
    }
  }

  const cat = params.get('cat')
  if (cat != null && 'cat' in defaults && allCats.includes(cat)) out.cat = cat

  const out_ = params.get('out')
  if (out_ != null && defaults.statuses) {
    const known = out_.split(',').map((s) => s.trim()).filter((s) => STATUSES.includes(s))
    if (known.length) out.statuses = new Set(known)
  }

  const sides = params.get('sides')
  if (sides != null && defaults.shown) {
    const known = sides.split(',').map((s) => s.trim()).filter((s) => (ctx.allSides || []).includes(s))
    if (known.length) out.shown = new Set(known)
  }

  const axis = ctx.axisFor ? ctx.axisFor(out.granularity) : ctx.axis
  if (axis?.length && (params.has('from') || params.has('to'))) {
    const from = indexForStamp(axis, out.granularity, params.get('from'))
    const to = indexForStamp(axis, out.granularity, params.get('to'))
    if (from != null || to != null) {
      const a = from ?? 0
      const b2 = to ?? axis.length - 1
      out.range = a <= b2 ? [a, b2] : [b2, a]
    }
  }
  return out
}

/** Builds the full hash for a page, omitting an empty query. */
export function buildHash(route, filters, defaults, ctx) {
  const q = encodeFilters(filters, defaults, ctx)
  return `#/${route}${q ? `?${q}` : ''}`
}
