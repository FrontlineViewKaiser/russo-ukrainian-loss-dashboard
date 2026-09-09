import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { STATUSES } from '../data/normalize.js'
import { MAX_SERIES } from '../data/palette.js'
import {
  statusBuckets, sumKeys, total, totalsByKey, totalsByKeyWindow, totalsByStatusWindow, windowSum,
} from '../data/cube.js'
import { fmt, rangeLabel, totalsByTypeInWindow } from '../data/aggregate.js'
import Toolbar from '../components/Toolbar.jsx'
import EntitySelector from '../components/EntitySelector.jsx'
import MetricStrip from '../components/MetricStrip.jsx'
import LossTimeline from '../components/LossTimeline.jsx'
import SmallMultiples from '../components/SmallMultiples.jsx'
import CategoryDetail from '../components/CategoryDetail.jsx'
import {
  CategoryTotalsBar, MonthlyStatusStack, StatusDonut, TopTypesBar,
} from '../components/Breakdowns.jsx'

const DESTROYED = STATUSES.indexOf('Destroyed')
const CAPTURED = STATUSES.indexOf('Captured')
const EMPTY = []

export const defaultFilters = (db) => ({
  granularity: 'month',
  cumulative: false,
  splitBy: 'key',
  // rankedCats, not orderedCats: display order is Oryx's editorial grouping, so the
  // first six listed are not the six biggest.
  cats: new Set((db.rankedCats || db.orderedCats).slice(0, MAX_SERIES)),
  statuses: new Set(STATUSES),
})

/**
 * One dataset's dashboard. Identical for Russian and Ukrainian losses - only the dataset
 * differs. Filter state is owned by the shell and passed in, so switching pages and coming
 * back restores exactly what the user had.
 */
export default function LossesPage({ db, filters, setFilters, extras, footNote }) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [emphasis, setEmphasis] = useState(null)
  const [detailCat, setDetailCat] = useState(null)


  const {
    granularity, cumulative, splitBy, cats: selectedCats, statuses: selectedStatuses, range,
  } = filters
  // Held in the page filters, not local state, so a shared link can restore the window.
  const setRange = useCallback((r) => setFilters((f) => ({ ...f, range: r })), [setFilters])
  const patch = useCallback((p) => setFilters((f) => ({ ...f, ...p })), [setFilters])

  const setGranularity = useCallback((v) => patch({ granularity: v }), [patch])
  const setCumulative = useCallback((v) => patch({ cumulative: v }), [patch])
  const setSplitBy = useCallback((v) => patch({ splitBy: v }), [patch])

  const toggleCat = useCallback(
    (c) =>
      setFilters((f) => {
        const next = new Set(f.cats)
        next.has(c) ? next.delete(c) : next.add(c)
        return { ...f, cats: next }
      }),
    [setFilters],
  )
  const toggleStatus = useCallback(
    (s) =>
      setFilters((f) => {
        const next = new Set(f.statuses)
        next.has(s) ? next.delete(s) : next.add(s)
        return { ...f, statuses: next }
      }),
    [setFilters],
  )
  const isolate = useCallback(
    (name) => {
      patch({ cats: new Set([name]) })
      setEmphasis(null)
    },
    [patch],
  )
  const reset = useCallback(() => setFilters(defaultFilters(db)), [setFilters, db])

  // ---- selection as index arrays into the cube -------------------------------
  // Every derived figure below is a sum over the pre-aggregated cube, so nothing here
  // touches the raw records again.
  const statusIdxs = useMemo(
    () => STATUSES.map((s, i) => i).filter((i) => selectedStatuses.has(STATUSES[i])),
    [selectedStatuses],
  )
  const catIdxs = useMemo(
    () => db.orderedCats.map((c, i) => i).filter((i) => selectedCats.has(db.orderedCats[i])),
    [db, selectedCats],
  )

  const cube = db.cube

  // Deferred as one object, not several values: independently deferred values can settle in
  // separate passes, rendering the charts more than once per click. The brushed window and
  // the bucket size travel with the selection because the window is a pair of indices into
  // the axis for that bucket size - deferring one without the other would briefly read the
  // window against the wrong axis.
  const selection = useMemo(
    () => ({ catIdxs, statusIdxs, range, granularity }),
    [catIdxs, statusIdxs, range, granularity],
  )
  const chartSel = useDeferredValue(selection)
  const {
    catIdxs: chartCats, statusIdxs: chartStatuses, range: chartRange, granularity: chartGrain,
  } = chartSel
  const stale = chartSel !== selection

  // The brushed window, clamped and resolved to both bucket indices (for the cube) and
  // timestamps (for the row scan the equipment types need).
  const win = useMemo(() => {
    const axis = cube.axes[chartGrain]
    const last = axis.length - 1
    const [a, b] = Array.isArray(chartRange) && chartRange.length === 2 ? chartRange : [0, last]
    const from = Math.min(Math.max(0, a), last)
    const to = Math.min(Math.max(from, b), last)
    return {
      from,
      to,
      fromTs: axis[from],
      // Open-ended on the last bucket, so entries late in a partial final bucket still count.
      toTs: to >= last ? Infinity : axis[to + 1],
      label: rangeLabel(axis, chartGrain, from, to),
    }
  }, [cube, chartGrain, chartRange])

  // Everything below follows the brush, so a pill, its bar, its slice and its types always
  // count the same rows. The consequence is that these are dated entries only: an undated
  // record carries no date and so falls in no window. The metric strip reports how many.
  const categoryTotals = useMemo(
    () => totalsByKeyWindow(cube, chartGrain, chartStatuses, win.from, win.to),
    [cube, chartGrain, chartStatuses, win],
  )
  const statusTotals = useMemo(
    () => totalsByStatusWindow(cube, chartGrain, chartCats, win.from, win.to),
    [cube, chartGrain, chartCats, win],
  )
  const typeTotals = useMemo(() => {
    const catNames = new Set(chartCats.map((k) => cube.keys[k]))
    const statusNames = new Set(chartStatuses.map((i) => cube.statuses[i]))
    return totalsByTypeInWindow(db.rows, catNames, statusNames, win.fromTs, win.toTs)
  }, [db, cube, chartCats, chartStatuses, win])

  // The facet grid draws every category across the whole axis, so its totals stay whole-range;
  // a windowed number beside a full-range sparkline would not describe the line it labels.
  const allTimeCategoryTotals = useMemo(
    () => totalsByKey(cube, chartStatuses),
    [cube, chartStatuses],
  )

  // Scoped to the chart's brush. Undated rows carry no date, so they can never fall inside
  // a window - they are reported separately rather than silently dropped.
  const metrics = useMemo(() => {
    const [from, to] = range || []
    const vehicles = windowSum(sumKeys(cube, granularity, catIdxs, statusIdxs), from, to)
    const destroyed = statusIdxs.includes(DESTROYED)
      ? windowSum(statusBuckets(cube, granularity, DESTROYED, catIdxs), from, to)
      : 0
    const captured = statusIdxs.includes(CAPTURED)
      ? windowSum(statusBuckets(cube, granularity, CAPTURED, catIdxs), from, to)
      : 0
    const undated = total(cube, catIdxs, statusIdxs) - total(cube, catIdxs, statusIdxs, true)
    const share = (n) => (vehicles ? Math.round((100 * n) / vehicles) + '%' : '—')
    const window = rangeLabel(cube.axes[granularity], granularity, from, to)
    return [
      { k: 'Vehicles in range', v: fmt(vehicles), unit: window || undefined },
      { k: 'Undated (excluded)', v: fmt(undated) },
      { k: 'Destroyed', v: fmt(destroyed), unit: share(destroyed) },
      { k: 'Captured', v: fmt(captured), unit: share(captured) },
      { k: 'Categories shown', v: String(catIdxs.length), unit: `of ${cube.nK}` },
    ]
  }, [cube, catIdxs, statusIdxs, granularity, range])

  const presentStatuses = useMemo(
    () =>
      cube.statuses.filter((_, s) => {
        let n = 0
        for (let k = 0; k < cube.nK; k++) n += cube.totalAll[k * cube.nS + s]
        return n > 0
      }),
    [cube],
  )

  // Only computed when a panel actually asks for the rows (the Warspotting map does).
  const filteredRows = useMemo(() => {
    if (typeof extras !== 'function') return EMPTY
    return db.rows.filter((r) => selectedCats.has(r.cat) && selectedStatuses.has(r.status))
  }, [extras, db, selectedCats, selectedStatuses])

  const allCats = useCallback(() => patch({ cats: new Set(db.orderedCats) }), [patch, db])
  const topCats = useCallback(
    () => patch({ cats: new Set((db.rankedCats || db.orderedCats).slice(0, MAX_SERIES)) }),
    [patch, db],
  )
  const noCats = useCallback(() => patch({ cats: new Set() }), [patch])
  const allStatuses = useCallback(() => patch({ statuses: new Set(STATUSES) }), [patch])

  return (
    <div className={'page' + (stale ? ' stale' : '')}>
      <Toolbar
        granularity={granularity}
        setGranularity={setGranularity}
        cumulative={cumulative}
        setCumulative={setCumulative}
        splitBy={splitBy}
        setSplitBy={setSplitBy}
        statuses={presentStatuses}
        selectedStatuses={selectedStatuses}
        toggleStatus={toggleStatus}
        allStatuses={allStatuses}
        onAllCats={allCats}
        onTopCats={topCats}
        onNoneCats={noCats}
        topCount={MAX_SERIES}
        onReset={reset}
        open={filtersOpen}
        setOpen={setFiltersOpen}
      />

      <div className="collapsible" data-open={filtersOpen}>
        <EntitySelector
          items={categoryTotals}
          selected={selectedCats}
          onToggle={toggleCat}
          styles={db.categoryStyles}
          emphasis={emphasis}
          onEmphasis={setEmphasis}
          label="Category visibility"
        />
      </div>

      <LossTimeline
        cube={cube}
        keyIdxs={chartCats}
        statusIdxs={chartStatuses}
        granularity={granularity}
        cumulative={cumulative}
        splitBy={splitBy}
        keyStyles={db.categoryStyles}
        keyNoun="category"
        onIsolate={isolate}
        emphasis={emphasis}
        onEmphasis={setEmphasis}
        onRangeChange={setRange}
        initialRange={range}
      />

      <MetricStrip metrics={metrics} />

      <div className="grid2">
        <CategoryTotalsBar
          categoryTotals={categoryTotals}
          selected={selectedCats}
          onIsolate={isolate}
          emphasis={emphasis}
          onEmphasis={setEmphasis}
          windowLabel={win.label}
        />
        <TopTypesBar typeTotals={typeTotals} windowLabel={win.label} />
      </div>

      <div className="grid2">
        <StatusDonut statusTotals={statusTotals} windowLabel={win.label} />
        <MonthlyStatusStack cube={cube} keyIdxs={chartCats} statusIdxs={chartStatuses} />
      </div>

      {typeof extras === 'function' ? extras({ rows: filteredRows }) : extras}

      <SmallMultiples
        cube={cube}
        statusIdxs={chartStatuses}
        granularity={granularity}
        cumulative={cumulative}
        categoryTotals={allTimeCategoryTotals}
        onOpenDetail={setDetailCat}
      />

      {detailCat && (
        <CategoryDetail
          cat={detailCat}
          rows={db.rowsByCat.get(detailCat) || EMPTY}
          domain={db.domain}
          initial={{ granularity, cumulative, splitBy, statuses: selectedStatuses }}
          onClose={() => setDetailCat(null)}
        />
      )}

      <p className="foot">
        {footNote || (
          <>
            Time charts cover the {fmt(db.coverage.datedVehicles)} of {fmt(db.coverage.vehicles)}{' '}
            vehicles carrying a date; totals and rankings include all of them. Counts are documented
            losses, a floor rather than an estimate. Dates are publication dates.{' '}
            Source: Oryx. Data scraped and processed by{' '}
            <a href="https://cracken.ai/platform" target="_blank" rel="noopener noreferrer">
              Cracken.ai
            </a>
            .
          </>
        )}
      </p>
    </div>
  )
}
