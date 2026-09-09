import { useCallback, useEffect, useMemo, useState } from 'react'
import { DATASETS, loadAll } from './data/load.js'
import LossMap from './components/LossMap.jsx'
import CompatibilityNote from './components/CompatibilityNote.jsx'
import { STATUSES } from './data/normalize.js'
import { buildHash, decodeFilters, parseHash } from './data/urlState.js'
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

// Must split the query off first: the hash now carries the whole view state.
const routeFromHash = () => {
  const { route } = parseHash()
  return VALID.has(route) ? route : 'russia'
}

const comparisonDefaults = (data) => {
  // sharedCats is Oryx's editorial order, so open on the largest by combined size instead
  // of simply the first one listed.
  const combined = new Map()
  for (const id of data.order) {
    for (const { name, value } of data.byId[id].categoryTotals) {
      combined.set(name, (combined.get(name) || 0) + value)
    }
  }
  const ranked = [...combined.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return {
    granularity: 'month',
    cumulative: false,
    // Exactly one category is charted at a time; open on the largest.
    cat: ranked[0] ?? null,
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
  const [copied, setCopied] = useState(false)

  // Defaults per page, and the context the URL codec needs to validate names and windows.
  const defaultsFor = useCallback((d, id) => (
    id === 'comparison' ? comparisonDefaults(d) : defaultFilters(d.byId[id])
  ), [])
  const ctxFor = useCallback((d, id) => {
    const db = id === 'comparison' ? d.byId[d.order[0]] : d.byId[id]
    return {
      allCats: id === 'comparison' ? d.sharedCats : db.orderedCats,
      allSides: d.order,
      axisFor: (g) => db.cube.axes[g],
    }
  }, [])

  useEffect(() => {
    loadAll()
      .then((d) => {
        setData(d)
        const init = {}
        for (const id of [...Object.keys(d.byId), 'comparison']) init[id] = defaultsFor(d, id)
        // Seed the page named in the hash from its query, so a pasted link opens on that view.
        const { route: r, params } = parseHash()
        if (VALID.has(r) && init[r]) init[r] = decodeFilters(params, init[r], ctxFor(d, r))
        setFilters(init)
      })
      .catch(setError)
  }, [defaultsFor, ctxFor])

  useEffect(() => {
    // A pasted link or Back/Forward changes the hash: adopt both the route and its state.
    const onHash = () => {
      const { route: r, params } = parseHash()
      const next = VALID.has(r) ? r : 'russia'
      setRoute(next)
      setData((d) => {
        if (d) {
          setFilters((all) => ({ ...all, [next]: decodeFilters(params, defaultsFor(d, next), ctxFor(d, next)) }))
        }
        return d
      })
    }
    window.addEventListener('hashchange', onHash)
    if (!location.hash) location.replace('#/russia')
    return () => window.removeEventListener('hashchange', onHash)
  }, [defaultsFor, ctxFor])

  // Mirror the current view into the address bar. replaceState, not pushState: the sidebar
  // links already push, so pushing per toggle would bury page navigation under filter steps.
  // replaceState fires no hashchange, so this cannot loop back into the listener above.
  useEffect(() => {
    if (!data || !filters[route]) return
    const next = buildHash(route, filters[route], defaultsFor(data, route), ctxFor(data, route))
    if (next !== location.hash) history.replaceState(null, '', next)
  }, [data, filters, route, defaultsFor, ctxFor])

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
