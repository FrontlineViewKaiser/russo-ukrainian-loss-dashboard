import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { STATUSES } from '../data/normalize.js'
import { MAX_SERIES } from '../data/palette.js'
import {
  statusBuckets, sumKeys, total, totalsByKey, totalsByStatus, totalsByType, windowSum,
} from '../data/cube.js'
import { fmt, rangeLabel } from '../data/aggregate.js'
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
  cats: new Set(db.orderedCats.slice(0, MAX_SERIES)),
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
  // The brush window of the chart above, reported by LossTimeline.
  const [range, setRange] = useState(null)

  const { granularity, cumulative, splitBy, cats: selectedCats, statuses: selectedStatuses } = filters
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

  // Deferred as one object, not two values: two independently deferred values can settle
  // in separate passes, rendering the charts twice per click.
  const selection = useMemo(() => ({ catIdxs, statusIdxs }), [catIdxs, statusIdxs])
  const chartSel = useDeferredValue(selection)
  const { catIdxs: chartCats, statusIdxs: chartStatuses } = chartSel
  const stale = chartSel !== selection

  const categoryTotals = useMemo(() => totalsByKey(cube, statusIdxs), [cube, statusIdxs])
  const chartCategoryTotals = useMemo(() => totalsByKey(cube, chartStatuses), [cube, chartStatuses])
  const statusTotals = useMemo(() => totalsByStatus(cube, chartCats), [cube, chartCats])
  const typeTotals = useMemo(
    () => totalsByType(cube, chartCats, chartStatuses),
    [cube, chartCats, chartStatuses],
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
    () => patch({ cats: new Set(db.orderedCats.slice(0, MAX_SERIES)) }),
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
      />

      <MetricStrip metrics={metrics} />

      <div className="grid2">
        <CategoryTotalsBar
          categoryTotals={chartCategoryTotals}
          selected={selectedCats}
          onIsolate={isolate}
          emphasis={emphasis}
          onEmphasis={setEmphasis}
        />
        <TopTypesBar typeTotals={typeTotals} />
      </div>

      <div className="grid2">
        <StatusDonut statusTotals={statusTotals} />
        <MonthlyStatusStack cube={cube} keyIdxs={chartCats} statusIdxs={chartStatuses} />
      </div>

      {typeof extras === 'function' ? extras({ rows: filteredRows }) : extras}

      <SmallMultiples
        cube={cube}
        statusIdxs={chartStatuses}
        granularity={granularity}
        cumulative={cumulative}
        categoryTotals={chartCategoryTotals}
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
            Source: Oryx.
          </>
        )}
      </p>
    </div>
  )
}
