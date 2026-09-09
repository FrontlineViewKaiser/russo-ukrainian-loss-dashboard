import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildTypeCube, statusBuckets, sumKeys, total, totalsByKeyWindow, windowSum,
} from '../data/cube.js'
import { STATUSES } from '../data/normalize.js'
import { MAX_SERIES } from '../data/palette.js'
import { fmt, rangeLabel } from '../data/aggregate.js'
import Toolbar from './Toolbar.jsx'
import EntitySelector from './EntitySelector.jsx'
import MetricStrip from './MetricStrip.jsx'
import LossTimeline from './LossTimeline.jsx'

const DESTROYED = STATUSES.indexOf('Destroyed')
const CAPTURED = STATUSES.indexOf('Captured')
const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The per-category drill-down: the same timeline as the dashboard, keyed by equipment
 * type instead of category.
 *
 * State is seeded from the dashboard and then owned entirely here - changing the bucket
 * or the outcome filter inside the overlay never writes back, so closing it returns the
 * user to exactly the view they left.
 */
export default function CategoryDetail({ cat, rows, domain, initial, onClose }) {
  const dialogRef = useRef(null)
  const restoreRef = useRef(null)

  const [granularity, setGranularity] = useState(initial.granularity)
  const [cumulative, setCumulative] = useState(initial.cumulative)
  const [splitBy, setSplitBy] = useState(initial.splitBy)
  const [selectedStatuses, setStatuses] = useState(() => new Set(initial.statuses))
  const [emphasis, setEmphasis] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [range, setRange] = useState(null)

  // Built on demand for this one category: a few ms even for the 6,253-row categories,
  // and far cheaper than pre-aggregating all 602 types up front.
  const { cube, types, styles } = useMemo(() => buildTypeCube(rows, domain), [rows, domain])

  const [selectedTypes, setTypes] = useState(() => new Set(types.slice(0, MAX_SERIES)))

  const statusIdxs = useMemo(
    () => STATUSES.map((s, i) => i).filter((i) => selectedStatuses.has(STATUSES[i])),
    [selectedStatuses],
  )
  const keyIdxs = useMemo(
    () => types.map((t, i) => i).filter((i) => selectedTypes.has(types[i])),
    [types, selectedTypes],
  )

  // The type pills follow this overlay's own brush, exactly as the category pills follow
  // the dashboard's: a pill and the line it switches on always count the same entries.
  const typeTotals = useMemo(() => {
    const last = cube.axes[granularity].length - 1
    const [a, b] = Array.isArray(range) && range.length === 2 ? range : [0, last]
    const from = Math.min(Math.max(0, a), last)
    return totalsByKeyWindow(cube, granularity, statusIdxs, from, Math.min(Math.max(from, b), last))
  }, [cube, granularity, statusIdxs, range])
  const presentStatuses = useMemo(
    () =>
      cube.statuses.filter((_, s) => {
        let n = 0
        for (let k = 0; k < cube.nK; k++) n += cube.totalAll[k * cube.nS + s]
        return n > 0
      }),
    [cube],
  )

  // Same rule as the dashboards: scoped to the brush, undated reported separately.
  const metrics = useMemo(() => {
    const [from, to] = range || []
    const vehicles = windowSum(sumKeys(cube, granularity, keyIdxs, statusIdxs), from, to)
    const destroyed = statusIdxs.includes(DESTROYED)
      ? windowSum(statusBuckets(cube, granularity, DESTROYED, keyIdxs), from, to)
      : 0
    const captured = statusIdxs.includes(CAPTURED)
      ? windowSum(statusBuckets(cube, granularity, CAPTURED, keyIdxs), from, to)
      : 0
    const undated = total(cube, keyIdxs, statusIdxs) - total(cube, keyIdxs, statusIdxs, true)
    const share = (n) => (vehicles ? Math.round((100 * n) / vehicles) + '%' : '—')
    const window = rangeLabel(cube.axes[granularity], granularity, from, to)
    return [
      { k: 'Vehicles in range', v: fmt(vehicles), unit: window || undefined },
      { k: 'Undated (excluded)', v: fmt(undated) },
      { k: 'Destroyed', v: fmt(destroyed), unit: share(destroyed) },
      { k: 'Captured', v: fmt(captured), unit: share(captured) },
      { k: 'Types shown', v: String(keyIdxs.length), unit: `of ${types.length}` },
    ]
  }, [cube, keyIdxs, statusIdxs, types.length, granularity, range])

  const catTotal = useMemo(() => total(cube, [...types.keys()], statusIdxs), [cube, types, statusIdxs])

  const toggleType = useCallback((t) => {
    setTypes((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }, [])

  const toggleStatus = useCallback((s) => {
    setStatuses((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }, [])

  const isolate = useCallback((name) => {
    setTypes(new Set([name]))
    setEmphasis(null)
  }, [])

  const reset = useCallback(() => {
    setGranularity(initial.granularity)
    setCumulative(initial.cumulative)
    setSplitBy(initial.splitBy)
    setStatuses(new Set(initial.statuses))
    setTypes(new Set(types.slice(0, MAX_SERIES)))
    setEmphasis(null)
  }, [initial, types])

  // --- dialog behaviour: Esc, focus trap, focus restore, background scroll lock ------
  useEffect(() => {
    restoreRef.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector(FOCUSABLE)?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])].filter(
        (el) => el.offsetParent !== null,
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        ref={dialogRef}
      >
        <header className="dialog-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="detail-title">{cat}</h2>
            <p className="cap">
              Losses by type · {fmt(catTotal)} vehicles · {types.length} types
            </p>
          </div>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose} aria-label="Close detail view">
            Close
          </button>
        </header>

        <div className="dialog-body">
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
            allStatuses={() => setStatuses(new Set(STATUSES))}
            onAllCats={() => setTypes(new Set(types))}
            onTopCats={() => setTypes(new Set(types.slice(0, MAX_SERIES)))}
            onNoneCats={() => setTypes(new Set())}
            topCount={MAX_SERIES}
            onReset={reset}
            open={filtersOpen}
            setOpen={setFiltersOpen}
            keyLabel="Types"
            keyNoun="type"
          />

          <div className="collapsible" data-open={filtersOpen}>
            <EntitySelector
              items={typeTotals}
              selected={selectedTypes}
              onToggle={toggleType}
              styles={styles}
              emphasis={emphasis}
              onEmphasis={setEmphasis}
              label="Type visibility"
            />
          </div>

          <LossTimeline
            cube={cube}
            keyIdxs={keyIdxs}
            statusIdxs={statusIdxs}
            granularity={granularity}
            cumulative={cumulative}
            splitBy={splitBy}
            keyStyles={styles}
            keyNoun="type"
            title={
              `${cat} — ${cumulative ? 'cumulative losses' : 'losses'} by ` +
              (splitBy === 'outcome' ? 'outcome' : 'type')
            }
            onIsolate={isolate}
            emphasis={emphasis}
            onEmphasis={setEmphasis}
            onRangeChange={setRange}
          />

          <MetricStrip metrics={metrics} />
        </div>
      </div>
    </div>
  )
}
