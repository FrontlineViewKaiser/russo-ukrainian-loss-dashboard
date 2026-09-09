/**
 * A pre-aggregated counting cube.
 *
 * Filtering used to mean re-scanning the 23,117 raw records for every chart on every
 * click. Instead we aggregate up front into flat typed arrays indexed by
 * (key, status, bucket), so an interaction becomes a few thousand integer adds over
 * contiguous memory rather than repeated passes over an object array.
 *
 * The first dimension is deliberately just "a key". The dashboard builds one cube keyed
 * by category; the per-category drill-down builds one keyed by equipment type. Both then
 * share every selector below, and the same chart component renders either.
 *
 * Size is trivial: 23 categories x 7 statuses x 222 weeks x 4 bytes is ~140 KB, and the
 * month and quarter grids are far smaller.
 */
import { bucketAxis, bucketStart } from './aggregate.js'
import { STATUSES } from './normalize.js'
import { buildCategoryStyles } from './palette.js'

export const GRAINS = ['week', 'month', 'quarter']

/**
 * @param {object[]} rows normalized records
 * @param {string[]} keys the first dimension, in the order that fixes colour assignment
 * @param {string[]} statuses the second dimension, in fixed display order
 * @param {[number, number]} domain [minTs, maxTs] for the bucket axes
 * @param {(r: object) => string} keyOf which field of a record supplies the key
 */
export function buildCube(rows, keys, statuses, domain, keyOf = (r) => r.cat) {
  const nK = keys.length
  const nS = statuses.length
  const keyIdx = new Map(keys.map((k, i) => [k, i]))
  const stIdx = new Map(statuses.map((s, i) => [s, i]))

  const axes = {}
  const slot = {}
  const counts = {}
  for (const g of GRAINS) {
    const axis = bucketAxis(domain[0], domain[1], g)
    axes[g] = axis
    slot[g] = new Map(axis.map((ts, i) => [ts, i]))
    counts[g] = new Int32Array(nK * nS * axis.length)
  }

  const totalAll = new Int32Array(nK * nS) // includes undated rows
  const totalDated = new Int32Array(nK * nS)

  for (const r of rows) {
    const k = keyIdx.get(keyOf(r))
    const s = stIdx.get(r.status)
    if (k === undefined || s === undefined) continue
    const pair = k * nS + s

    totalAll[pair] += r.weight
    if (r.t == null) continue
    totalDated[pair] += r.weight
    for (const g of GRAINS) {
      const b = slot[g].get(bucketStart(r.t, g))
      if (b === undefined) continue
      counts[g][pair * axes[g].length + b] += r.weight
    }
  }

  return { nK, nS, keys, statuses, keyIdx, stIdx, axes, counts, totalAll, totalDated }
}

/**
 * The drill-down cube: one category's rows, keyed by equipment type.
 *
 * Built on demand rather than up front - the largest category is 6,253 rows, so this
 * costs a few ms, whereas pre-aggregating all 602 types x 222 weeks would not pay for
 * itself. Types are ranked by total weight so colour assignment is stable and the
 * biggest contributors take the leading hues.
 */
export function buildTypeCube(catRows, domain) {
  const totals = new Map()
  for (const r of catRows) totals.set(r.typeName, (totals.get(r.typeName) || 0) + r.weight)
  const types = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)

  return {
    cube: buildCube(catRows, types, STATUSES, domain, (r) => r.typeName),
    types,
    styles: buildCategoryStyles(types),
  }
}

/* ------------------------------------------------------------------ series -- */

/** Bucket totals for one key, summed over the given statuses. */
export function keyBuckets(cube, g, k, statusIdxs) {
  const nB = cube.axes[g].length
  const src = cube.counts[g]
  const out = new Float64Array(nB)
  for (const s of statusIdxs) {
    const base = (k * cube.nS + s) * nB
    for (let b = 0; b < nB; b++) out[b] += src[base + b]
  }
  return out
}

/** Bucket totals for one status, summed over the given keys. */
export function statusBuckets(cube, g, s, keyIdxs) {
  const nB = cube.axes[g].length
  const src = cube.counts[g]
  const out = new Float64Array(nB)
  for (const k of keyIdxs) {
    const base = (k * cube.nS + s) * nB
    for (let b = 0; b < nB; b++) out[b] += src[base + b]
  }
  return out
}

/** One series summed over many keys - what the comparison chart needs per side. */
export function sumKeys(cube, g, keyIdxs, statusIdxs) {
  const nB = cube.axes[g].length
  const src = cube.counts[g]
  const out = new Float64Array(nB)
  for (const k of keyIdxs) {
    for (const s of statusIdxs) {
      const base = (k * cube.nS + s) * nB
      for (let b = 0; b < nB; b++) out[b] += src[base + b]
    }
  }
  return out
}

/**
 * Sum a bucket series over an inclusive index window - how the metric card scopes itself
 * to the chart's brush. Always fed the per-period series, never the cumulative one, so the
 * figures are the same whichever way the chart is drawn.
 */
export function windowSum(arr, from, to) {
  const a = Math.max(0, from ?? 0)
  const b = Math.min(arr.length - 1, to ?? arr.length - 1)
  let n = 0
  for (let i = a; i <= b; i++) n += arr[i]
  return n
}

export function runningTotal(arr) {
  let acc = 0
  const out = new Float64Array(arr.length)
  for (let i = 0; i < arr.length; i++) out[i] = acc += arr[i]
  return out
}

/* ------------------------------------------------------------------ totals -- */

/** Scalar total over a selection. `dated` restricts to rows carrying a date. */
export function total(cube, keyIdxs, statusIdxs, dated = false) {
  const src = dated ? cube.totalDated : cube.totalAll
  let n = 0
  for (const k of keyIdxs) for (const s of statusIdxs) n += src[k * cube.nS + s]
  return n
}

/**
 * Per-key totals for the given statuses. `dated` restricts to rows carrying a date, which
 * the comparison page needs so its category pills count the same rows its charts plot.
 */
export function totalsByKey(cube, statusIdxs, dated = false) {
  const src = dated ? cube.totalDated : cube.totalAll
  const out = new Array(cube.nK)
  for (let k = 0; k < cube.nK; k++) {
    let n = 0
    for (const s of statusIdxs) n += src[k * cube.nS + s]
    out[k] = { name: cube.keys[k], value: n }
  }
  return out
}

/**
 * Per-key totals inside an inclusive bucket window - what the category chart and the
 * category pills need once they follow the chart's brush. Reads the bucket grid directly
 * rather than calling keyBuckets per key, so the whole set costs a fraction of a millisecond.
 */
export function totalsByKeyWindow(cube, g, statusIdxs, from, to) {
  const nB = cube.axes[g].length
  const src = cube.counts[g]
  const a = Math.max(0, from ?? 0)
  const b = Math.min(nB - 1, to ?? nB - 1)
  const out = new Array(cube.nK)
  for (let k = 0; k < cube.nK; k++) {
    let n = 0
    for (const st of statusIdxs) {
      const base = (k * cube.nS + st) * nB
      for (let i = a; i <= b; i++) n += src[base + i]
    }
    out[k] = { name: cube.keys[k], value: n }
  }
  return out
}

/** Per-status totals inside an inclusive bucket window, in the fixed status order. */
export function totalsByStatusWindow(cube, g, keyIdxs, from, to) {
  const nB = cube.axes[g].length
  const src = cube.counts[g]
  const a = Math.max(0, from ?? 0)
  const b = Math.min(nB - 1, to ?? nB - 1)
  return cube.statuses.map((name, st) => {
    let n = 0
    for (const k of keyIdxs) {
      const base = (k * cube.nS + st) * nB
      for (let i = a; i <= b; i++) n += src[base + i]
    }
    return { name, value: n }
  })
}

