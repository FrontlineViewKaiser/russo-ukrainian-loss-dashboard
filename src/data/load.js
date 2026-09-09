import { canonicalCat, flatten, STATUSES } from './normalize.js'
import { flattenWarspotting, warspottingCoverage } from './warspotting.js'
import { buildCategoryStyles } from './palette.js'
import { totalsBy, sumWeight } from './aggregate.js'
import { buildCube } from './cube.js'

/**
 * The two Oryx datasets. These share a bucket axis and are the only ones the Comparison
 * page can use - it needs two sides of the same conflict measured the same way.
 */
export const DATASETS = [
  { id: 'russia', label: 'Russian Losses', short: 'Russia', abbr: 'RU', file: 'oryx-ru.json' },
  { id: 'ukraine', label: 'Ukrainian Losses', short: 'Ukraine', abbr: 'UA', file: 'oryx-ua.json' },
]

/**
 * WarSpotting is a separate catalogue, not a third side: it publishes Russian losses only,
 * under its own 18-value taxonomy, and runs later than the Oryx files. It therefore gets
 * its own bucket axis and stays out of the comparison.
 */
export const WARSPOTTING = {
  id: 'warspotting', label: 'Warspotting', short: 'Warspotting', abbr: 'WS',
  file: 'warspotting.json',
}

async function fetchJson(file) {
  const url = import.meta.env.BASE_URL + file
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load ' + url + ' (HTTP ' + res.status + ')')
  return res.json()
}

/** Returns the parsed rows plus the category order exactly as the file lists them. */
async function fetchOryx(file) {
  const json = await fetchJson(file)
  const fileOrder = Object.keys(json?.Losses || {}).map(canonicalCat)
  return { rows: flatten(json), fileOrder }
}

/**
 * Everything a dashboard needs for one dataset, aggregated on the shared domain.
 *
 * `order` fixes the category sequence. The Oryx datasets are given one shared order so the
 * selectors, bar charts, small multiples and comparison all read the same way - and, because
 * buildCategoryStyles assigns hues by rank, so that a category keeps the same colour on
 * every page. Ordering each dataset by its own totals made Tanks a different colour on the
 * Russian and Ukrainian pages.
 */
function prepare(meta, rows, domain, order) {
  const bySize = totalsBy(rows, (r) => r.cat)
  const totals = new Map(bySize.map((c) => [c.name, c.value]))
  const orderedCats = order || bySize.map((c) => c.name)
  const categoryTotals = orderedCats.map((name) => ({ name, value: totals.get(name) || 0 }))
  // Display order is editorial, so "top N" needs its own size ranking - otherwise the
  // default selection would lead with MRAP (64 entries) and fold Trucks (4,327) into Other.
  const rankedCats = [...orderedCats].sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0))
  const dated = rows.filter((r) => r.t != null)

  const rowsByCat = new Map()
  for (const r of rows) {
    let a = rowsByCat.get(r.cat)
    if (!a) rowsByCat.set(r.cat, (a = []))
    a.push(r)
  }

  return {
    ...meta,
    rows,
    rowsByCat,
    dated,
    domain,
    cube: buildCube(rows, orderedCats, STATUSES, domain),
    orderedCats,
    rankedCats,
    categoryTotals,
    categoryStyles: buildCategoryStyles(orderedCats),
    coverage: {
      entries: rows.length,
      vehicles: sumWeight(rows),
      datedEntries: dated.length,
      datedVehicles: sumWeight(dated),
      undatedEntries: rows.length - dated.length,
      types: new Set(rows.map((r) => r.typeName)).size,
    },
  }
}

/**
 * Loads every dataset and builds all cubes on ONE shared bucket axis.
 *
 * The shared domain is not incidental: the comparison view overlays two cubes, which is
 * only possible if their bucket arrays are the same length and start at the same instant.
 * Categories are matched by name everywhere, never by index, because the two datasets rank
 * their categories differently.
 */
export async function loadAll() {
  const [oryx, wsJson] = await Promise.all([
    Promise.all(DATASETS.map((d) => fetchOryx(d.file))),
    // Optional: the snapshot only exists once `npm run fetch:warspotting` has been run.
    fetchJson(WARSPOTTING.file).catch(() => null),
  ])

  const times = oryx.flatMap((o) => o.rows).filter((r) => r.t != null).map((r) => r.t)
  const domain = [Math.min(...times), Math.max(...times)]

  // Every Oryx page uses the category order as the Russian file lists it. That is Oryx's
  // own grouping - armour first, trucks last - rather than a size ranking, and both files
  // already ship it. Anything a later file adds is appended so nothing can be dropped.
  const sharedCats = [...oryx[0].fileOrder]
  for (const { fileOrder } of oryx.slice(1)) {
    for (const c of fileOrder) if (!sharedCats.includes(c)) sharedCats.push(c)
  }

  const byId = {}
  DATASETS.forEach((meta, i) => {
    byId[meta.id] = prepare(meta, oryx[i].rows, domain, sharedCats)
  })

  if (wsJson) {
    const rows = flattenWarspotting(wsJson)
    const wsTimes = rows.filter((r) => r.t != null).map((r) => r.t)
    // Its own domain: WarSpotting runs months later than the Oryx files, and forcing the
    // shared axis would pad every Oryx chart with empty buckets.
    const wsDomain = [Math.min(...wsTimes), Math.max(...wsTimes)]
    byId[WARSPOTTING.id] = {
      // No shared order: WarSpotting has its own taxonomy, not these categories.
      ...prepare(WARSPOTTING, rows, wsDomain),
      warspotting: warspottingCoverage(rows, wsJson),
    }
  }

  return {
    byId,
    order: DATASETS.map((d) => d.id),
    domain,
    sharedCats,
    hasWarspotting: Boolean(wsJson),
  }
}
