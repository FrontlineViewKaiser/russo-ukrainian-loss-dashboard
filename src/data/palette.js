/**
 * Colour assignment.
 *
 * Six hues, in one fixed sequence, used for both category series and outcomes. The
 * sequence is not arbitrary: on a white surface orange separates from almost nothing
 * (orange/green is ΔE 3.2 under protanopia, orange/amber 13.7 to normal vision), so
 * violet sits between orange and amber as a buffer. This exact order is the one that
 * clears the adjacent-pair checks in both light and dark; reordering it breaks them.
 *
 * Two rules follow from having six hues and 23 categories:
 *  1. Colour follows the entity - a category's hue comes from its rank in the whole
 *     dataset, so filtering never repaints the survivors.
 *  2. At most MAX_SERIES hues carry meaning at once; the rest fold into a neutral.
 */

/** Named series the timeline draws before folding the remainder into "Other". */
export const MAX_SERIES = 6

const SLOTS = 6

/**
 * Ranks beyond the sixth reuse a hue with a distinct line style - composite encoding.
 * Six patterns x six hues gives 36 stable slots, which covers the largest category's 77
 * equipment types well past the six that are ever drawn at once. Categories (23 of them)
 * only ever reach tier 3, so widening this does not change any dashboard colour.
 */
const DASHES = [null, '6 3', '2 3', '9 3 2 3', '1 3', '12 3 2 3 2 3']

export const OTHER = 'Other'
export const OTHER_COLOR = 'var(--series-other)'

/** Permanent per-category style, keyed on the fixed whole-dataset ordering. */
export function buildCategoryStyles(orderedCats) {
  const map = new Map()
  orderedCats.forEach((cat, i) => {
    map.set(cat, {
      color: `var(--series-${(i % SLOTS) + 1})`,
      dash: DASHES[Math.floor(i / SLOTS) % DASHES.length],
      rank: i,
    })
  })
  map.set(OTHER, { color: OTHER_COLOR, dash: null, rank: 999 })
  return map
}

/**
 * Outcomes take the same six slots in the same sequence. Charts must render them in
 * this order regardless of value, so the validated adjacency holds under every filter.
 */
export const STATUS_STYLE = {
  Destroyed: { color: 'var(--series-1)' },
  Captured: { color: 'var(--series-2)' },
  Damaged: { color: 'var(--series-3)' },
  'Damaged and abandoned': { color: 'var(--series-4)' },
  Abandoned: { color: 'var(--series-5)' },
  'Damaged and captured': { color: 'var(--series-6)' },
  Other: { color: OTHER_COLOR },
}

export const statusColor = (s) => (STATUS_STYLE[s] || STATUS_STYLE.Other).color
