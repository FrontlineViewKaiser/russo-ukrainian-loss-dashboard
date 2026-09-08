import { useCallback, useEffect, useMemo, useState } from 'react'
import { DATASETS, loadAll } from './data/load.js'
import LossMap from './components/LossMap.jsx'
import CompatibilityNote from './components/CompatibilityNote.jsx'
import { STATUSES } from './data/normalize.js'
import { Segmented } from './components/ui.jsx'
import Sidebar from './components/Sidebar.jsx'
import LossesPage, { defaultFilters } from './pages/LossesPage.jsx'
import ComparisonPage from './pages/ComparisonPage.jsx'

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
]

const PAGES = [
  { id: 'russia', label: 'Russian Losses', color: 'var(--series-1)' },
  { id: 'ukraine', label: 'Ukrainian Losses', color: 'var(--series-2)' },
  { id: 'comparison', label: 'Comparison', color: 'var(--series-other)' },
  { id: 'warspotting', label: 'Warspotting', color: 'var(--series-3)' },
]
const VALID = new Set(PAGES.map((p) => p.id))

const routeFromHash = () => {
  const id = (location.hash || '').replace(/^#\/?/, '')
  return VALID.has(id) ? id : 'russia'
}

const comparisonDefaults = (data) => {
  // Rank by COMBINED size, not by either side's own ordering - defaulting to one side's
  // top categories would quietly bias what the comparison opens on.
  const combined = new Map()
  for (const id of data.order) {
    for (const { name, value } of data.byId[id].categoryTotals) {
      combined.set(name, (combined.get(name) || 0) + value)
    }
  }
  const ranked = [...combined.entries()].sort((a, b) => b[1] - a[1])
  return {
    granularity: 'month',
    cumulative: false,
    // Exactly one category is charted at a time; open on the largest.
    cat: ranked[0]?.[0] ?? null,
    statuses: new Set(STATUSES),
    shown: new Set(data.order),
  }
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('system')
  const [route, setRoute] = useState(routeFromHash)

  // Filter state per page, held here so navigating away and back restores it.
  const [filters, setFilters] = useState({})

  useEffect(() => {
    loadAll()
      .then((d) => {
        setData(d)
        const init = { comparison: comparisonDefaults(d) }
        for (const id of Object.keys(d.byId)) init[id] = defaultFilters(d.byId[id])
        setFilters(init)
      })
      .catch(setError)
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    if (!location.hash) location.replace('#/russia')
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  // One stable setter per page, so page components can update only their own slice.
  const setPageFilters = useCallback(
    (id) => (updater) =>
      setFilters((all) => ({
        ...all,
        [id]: typeof updater === 'function' ? updater(all[id]) : updater,
      })),
    [],
  )
  const setters = useMemo(() => {
    const out = {}
    for (const p of PAGES) out[p.id] = setPageFilters(p.id)
    return out
  }, [setPageFilters])

  const counts = useMemo(() => {
    if (!data) return {}
    const out = {}
    for (const [id, db] of Object.entries(data.byId)) out[id] = db.coverage.vehicles
    return out
  }, [data])

  const pages = useMemo(
    () => PAGES.filter((p) => p.id !== 'warspotting' || data?.byId.warspotting),
    [data],
  )

  const title = PAGES.find((p) => p.id === route)?.label || ''

  let body
  if (error) {
    body = (
      <div className="panel">
        <h2>Could not load the data</h2>
        <p className="cap">{String(error.message || error)}</p>
      </div>
    )
  } else if (data && route === 'warspotting' && !data.byId.warspotting) {
    body = (
      <div className="panel">
        <h2>No Warspotting snapshot yet</h2>
        <p className="cap">
          The API publishes no bulk export, so this section reads a local snapshot. Run{' '}
          <code>npm run fetch:warspotting</code> to create it (about 240 requests, a few
          minutes), then reload.
        </p>
      </div>
    )
  } else if (!data || !filters[route]) {
    body = (
      <div className="panel">
        <div className="empty">Loading…</div>
      </div>
    )
  } else if (route === 'comparison') {
    body = <ComparisonPage data={data} filters={filters.comparison} setFilters={setters.comparison} />
  } else if (route === 'warspotting') {
    const ws = data.byId.warspotting
    body = (
      <LossesPage
        key="warspotting"
        db={ws}
        filters={filters.warspotting}
        setFilters={setters.warspotting}
        extras={({ rows }) => (
          <>
            <LossMap rows={rows} />
            <CompatibilityNote db={ws} oryxCats={data.byId.russia.orderedCats} />
          </>
        )}
        footNote={
          <>
            Source: WarSpotting (ukr.warspotting.net), a separate catalogue of documented
            Russian losses. Every record carries a date, so no entries are excluded from the
            time charts. Snapshot taken by <code>npm run fetch:warspotting</code>; the API
            offers no bulk export, so this is not a live feed.
          </>
        }
      />
    )
  } else {
    body = (
      <LossesPage
        key={route}
        db={data.byId[route]}
        filters={filters[route]}
        setFilters={setters[route]}
      />
    )
  }

  return (
    <div className="shell">
      <Sidebar pages={pages} current={route} counts={counts} />
      <main className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <span className="sub">
            {route === 'comparison'
              ? 'Russia and Ukraine, side by side'
              : route === 'ukraine'
                ? 'Oryx visual confirmations'
                : route === 'warspotting'
                  ? 'ukr.warspotting.net · Russian losses'
                  : 'Oryx visual confirmations'}
          </span>
          <div className="spacer" />
          <Segmented label="Theme" showLabel={false} value={theme} onChange={setTheme} options={THEMES} />
        </header>
        {body}
      </main>
    </div>
  )
}
