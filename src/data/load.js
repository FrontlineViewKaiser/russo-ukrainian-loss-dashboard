import { flatten, STATUSES } from './normalize.js'
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

const fetchRows = async (file) => flatten(await fetchJson(file))

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
  const totals = new Map(totalsBy(rows, (r) => r.cat).map((c) => [c.name, c.value]))
  const orderedCats = order || [...totals.keys()]
  const categoryTotals = orderedCats.map((name) => ({ name, value: totals.get(name) || 0 }))
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
    Promise.all(DATASETS.map((d) => fetchRows(d.file))),
    // Optional: the snapshot only exists once `npm run fetch:warspotting` has been run.
    fetchJson(WARSPOTTING.file).catch(() => null),
  ])

  const times = oryx.flat().filter((r) => r.t != null).map((r) => r.t)
  const domain = [Math.min(...times), Math.max(...times)]

  // One category order shared by every Oryx dataset, ranked by combined size so neither
  // side's ordering is imposed on the other.
  const combined = new Map()
  for (const rows of oryx) {
    for (const r of rows) combined.set(r.cat, (combined.get(r.cat) || 0) + r.weight)
  }
  const sharedCats = [...combined.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)

  const byId = {}
  DATASETS.forEach((meta, i) => {
    byId[meta.id] = prepare(meta, oryx[i], domain, sharedCats)
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
