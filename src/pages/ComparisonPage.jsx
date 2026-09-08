import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { STATUSES } from '../data/normalize.js'
import { runningTotal, sumKeys, total, totalsByKey, windowSum } from '../data/cube.js'
import { bucketLabel, fmt, GRANULARITIES, rangeLabel } from '../data/aggregate.js'
import Panel from '../components/Panel.jsx'
import Legend from '../components/Legend.jsx'
import ChartTooltip from '../components/ChartTooltip.jsx'
import MetricStrip from '../components/MetricStrip.jsx'
import EntitySelector from '../components/EntitySelector.jsx'
import { Pill, Segmented, Swatch, axisProps, gridProps } from '../components/ui.jsx'

/**
 * Only two hues are ever on screen here, so identity is unambiguous: the sides are the
 * series. Blue and orange are slots 1 and 2 of the validated sequence.
 */
const SIDE_COLOR = { russia: 'var(--series-1)', ukraine: 'var(--series-2)' }

const EMPTY = []

/** Categories present in either dataset, ranked by combined size. Matched BY NAME - the
 *  two datasets order their categories differently, so indices are not interchangeable. */
function useCombinedCategories(sides, statusIdxs) {
  return useMemo(() => {
    const acc = new Map()
    for (const db of sides) {
      for (const { name, value } of totalsByKey(db.cube, statusIdxs)) {
        acc.set(name, (acc.get(name) || 0) + value)
      }
    }
    return [...acc.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [sides, statusIdxs])
}

/** Bucket series for one side over the named categories. */
function sideSeries(db, granularity, names, statusIdxs) {
  const idxs = []
  for (const n of names) {
    const i = db.cube.keyIdx.get(n)
    if (i !== undefined) idxs.push(i)
  }
  return sumKeys(db.cube, granularity, idxs, statusIdxs)
}

export default function ComparisonPage({ data, filters, setFilters }) {
  const sides = useMemo(() => data.order.map((id) => data.byId[id]), [data])
  const { granularity, cumulative, cat, statuses: selectedStatuses, shown } = filters
  // Brush window of the chart below, so the metric strip can scope itself to it.
  const [range, setRange] = useState(null)

  const patch = useCallback((p) => setFilters((f) => ({ ...f, ...p })), [setFilters])

  const statusIdxs = useMemo(
    () => STATUSES.map((s, i) => i).filter((i) => selectedStatuses.has(STATUSES[i])),
    [selectedStatuses],
  )
  const categories = useCombinedCategories(sides, statusIdxs)

  // Exactly one category at a time: summing an arbitrary subset answers no question, and
  // hides the per-category shape this page exists to show.
  const names = useMemo(() => (cat ? [cat] : []), [cat])
  const selectCat = useCallback((name) => patch({ cat: name }), [patch])

  const deferred = useDeferredValue(useMemo(() => ({ names, statusIdxs }), [names, statusIdxs]))
  const stale = deferred.names !== names || deferred.statusIdxs !== statusIdxs

  const visibleSides = useMemo(() => sides.filter((s) => shown.has(s.id)), [sides, shown])

  const toggleSide = useCallback(
    (id) =>
      setFilters((f) => {
        const next = new Set(f.shown)
        next.has(id) ? next.delete(id) : next.add(id)
        return { ...f, shown: next }
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

  // Scoped to the brush, like the dashboards. Undated rows have no date and so can never
  // fall inside a window; they are reported separately rather than silently dropped.
  const metrics = useMemo(() => {
    const [from, to] = range || []
    const idxsFor = (db) => {
      const idxs = []
      for (const n of names) {
        const i = db.cube.keyIdx.get(n)
        if (i !== undefined) idxs.push(i)
      }
      return idxs
    }
    const inRange = sides.map((db) =>
      windowSum(sumKeys(db.cube, granularity, idxsFor(db), statusIdxs), from, to),
    )
    const undated = sides.reduce((a, db) => {
      const idxs = idxsFor(db)
      return a + total(db.cube, idxs, statusIdxs) - total(db.cube, idxs, statusIdxs, true)
    }, 0)
    const window = sides.length
      ? rangeLabel(sides[0].cube.axes[granularity], granularity, from, to)
      : null

    const out = sides.map((db, i) => ({
      k: `${db.short} — in range`,
      v: fmt(inRange[i]),
      unit: i === 0 ? window || undefined : undefined,
    }))
    const [ru, ua] = inRange
    out.push({ k: 'Ratio', v: ua ? (ru / ua).toFixed(2) : '—', unit: 'RU : UA' })
    out.push({ k: 'Undated (excluded)', v: fmt(undated) })
    return out
  }, [sides, names, statusIdxs, granularity, range])

  const presentStatuses = useMemo(
    () =>
      STATUSES.filter((_, s) =>
        sides.some((db) => {
          let n = 0
          for (let k = 0; k < db.cube.nK; k++) n += db.cube.totalAll[k * db.cube.nS + s]
          return n > 0
        }),
      ),
    [sides],
  )

  return (
    <div className={'page' + (stale ? ' stale' : '')}>
      <div className="panel">
        <div className="toolbar">
          <div className="group">
            <span className="lbl">Show</span>
            <div className="wrapgroup" role="group" aria-label="Sides shown">
              {sides.map((db) => (
                <Pill key={db.id} pressed={shown.has(db.id)} onClick={() => toggleSide(db.id)}>
                  <Swatch color={SIDE_COLOR[db.id]} />
                  {db.short}
                </Pill>
              ))}
            </div>
          </div>

          <div className="divider" aria-hidden="true" />

          <Segmented
            label="Bucket"
            value={granularity}
            onChange={(v) => patch({ granularity: v })}
            options={GRANULARITIES}
          />
          <Segmented
            label="Total"
            value={cumulative ? 'cumulative' : 'period'}
            onChange={(v) => patch({ cumulative: v === 'cumulative' })}
            options={[
              { id: 'period', label: 'Per period' },
              { id: 'cumulative', label: 'Cumulative' },
            ]}
          />

          <div className="divider" aria-hidden="true" />

          <div className="group" style={{ alignItems: 'flex-start' }}>
            <span className="lbl" style={{ paddingTop: 7 }}>
              Outcome
            </span>
            <div className="wrapgroup" role="group" aria-label="Outcome filters">
              {presentStatuses.map((s) => (
                <Pill key={s} pressed={selectedStatuses.has(s)} onClick={() => toggleStatus(s)}>
                  {s}
                </Pill>
              ))}
            </div>
          </div>

        </div>
      </div>

      <EntitySelector
        mode="single"
        items={categories}
        value={cat}
        onSelect={selectCat}
        label="Category"
      />

      <ComparisonTimeline
        sides={visibleSides}
        granularity={granularity}
        cumulative={cumulative}
        names={deferred.names}
        statusIdxs={deferred.statusIdxs}
        cat={cat}
        onRangeChange={setRange}
      />

      <MetricStrip metrics={metrics} />

      <ComparisonFacets
        sides={visibleSides}
        allSides={sides}
        granularity={granularity}
        cumulative={cumulative}
        statusIdxs={deferred.statusIdxs}
        categories={categories}
        active={cat}
        onSelect={selectCat}
      />

      <p className="foot">
        Both sides are aggregated on one shared time axis and matched by category name. Only
        dated entries appear in these charts. Ukrainian figures are synthetic sample data.
      </p>
    </div>
  )
}

/* ------------------------------------------------------- the overlay chart -- */
const ComparisonTimeline = memo(function ComparisonTimeline({
  sides, granularity, cumulative, names, statusIdxs, cat, onRangeChange,
}) {
  const { data, totals } = useMemo(() => {
    if (!sides.length) return { data: EMPTY, totals: {} }
    const axis = sides[0].cube.axes[granularity]
    const series = sides.map((db) => {
      const arr = sideSeries(db, granularity, names, statusIdxs)
      return cumulative ? runningTotal(arr) : arr
    })
    const totals = {}
    sides.forEach((db, i) => {
      const arr = series[i]
      totals[db.id] = cumulative
        ? arr[arr.length - 1] || 0
        : arr.reduce((a, v) => a + v, 0)
    })
    const data = axis.map((ts, i) => {
      const row = { label: bucketLabel(ts, granularity) }
      sides.forEach((db, k) => (row[db.short] = series[k][i]))
      return row
    })
    return { data, totals }
  }, [sides, granularity, cumulative, names, statusIdxs])

  // Same contract as LossTimeline: reset when the axis is rebuilt, report upward.
  const [range, setRange] = useState([0, Math.max(0, data.length - 1)])
  useEffect(() => setRange([0, Math.max(0, data.length - 1)]), [data.length])
  useEffect(() => onRangeChange?.(range), [range, onRangeChange])

  const columns = ['Period', ...sides.map((s) => s.short), 'Difference']
  const rows = data.map((row) => {
    const vals = sides.map((s) => row[s.short])
    return [row.label, ...vals, sides.length === 2 ? vals[0] - vals[1] : '—']
  })

  return (
    <Panel
      title={`${cat || 'Losses'} — ${cumulative ? 'cumulative, ' : ''}Russia vs Ukraine`}
      caption={`Documented vehicles per ${granularity}`}
      columns={columns}
      rows={rows}
      tableLabel="Russia versus Ukraine over time"
    >
      {!sides.length || !names.length ? (
        <div className="empty">
          {!sides.length ? 'Both sides are hidden.' : 'No categories selected.'}
        </div>
      ) : (
        <>
          <div className="scrollx">
            <div style={{ minWidth: 320 }}>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={30} interval="preserveStartEnd" height={24} />
                  <YAxis {...axisProps} width={48} axisLine={false} tickFormatter={fmt} allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  {sides.map((db) => (
                    <Line
                      key={db.id}
                      type="monotone"
                      dataKey={db.short}
                      name={db.short}
                      stroke={SIDE_COLOR[db.id]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--panel)' }}
                      isAnimationActive={false}
                    />
                  ))}
                  <Brush
                    dataKey="label"
                    height={22}
                    travellerWidth={8}
                    stroke="var(--axis)"
                    fill="var(--panel-sunken)"
                    startIndex={range[0]}
                    endIndex={range[1]}
                    onChange={(r) => setRange([r.startIndex, r.endIndex])}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Legend
            isStatic
            items={sides.map((db) => ({
              key: db.id,
              label: db.short,
              color: SIDE_COLOR[db.id],
              value: totals[db.id] || 0,
            }))}
          />
        </>
      )}
    </Panel>
  )
})

/* --------------------------------------------- one mini chart per category -- */
const ComparisonFacets = memo(function ComparisonFacets({
  sides, allSides, granularity, cumulative, statusIdxs, categories, active, onSelect,
}) {
  const { data, totalsByCat } = useMemo(() => {
    if (!allSides.length) return { data: EMPTY, totalsByCat: {} }
    const axis = allSides[0].cube.axes[granularity]
    const rows = axis.map((ts) => ({ label: bucketLabel(ts, granularity) }))
    const totalsByCat = {}

    for (const c of categories) {
      totalsByCat[c.name] = {}
      for (const db of allSides) {
        const arr0 = sideSeries(db, granularity, [c.name], statusIdxs)
        const arr = cumulative ? runningTotal(arr0) : arr0
        const key = `${c.name}|${db.id}`
        for (let i = 0; i < rows.length; i++) rows[i][key] = arr[i]
        totalsByCat[c.name][db.id] = arr0.reduce((a, v) => a + v, 0)
      }
    }
    return { data: rows, totalsByCat }
  }, [allSides, granularity, cumulative, statusIdxs, categories])

  const tableRows = categories.map((c) => [
    c.name,
    ...allSides.map((db) => totalsByCat[c.name]?.[db.id] || 0),
  ])

  return (
    <Panel
      title="Every category, both sides"
      caption="Click a panel to chart it above" 
      columns={['Category', ...allSides.map((s) => s.short)]}
      rows={tableRows}
      tableLabel="every category, both sides"
    >
      {!sides.length ? (
        <div className="empty">Both sides are hidden.</div>
      ) : (
        <div className="facets">
          {categories.map((c) => (
            <button
              type="button"
              key={c.name}
              className={'facet' + (c.name === active ? ' on' : '')}
              aria-pressed={c.name === active}
              onClick={() => onSelect(c.name)}
              title={`Chart ${c.name} above`}
            >
              <div className="ft">{c.name}</div>
              <div className="fv">
                {allSides
                  .map((db) => `${db.abbr} ${fmt(totalsByCat[c.name]?.[db.id] || 0)}`)
                  .join(' · ')}
              </div>
              <ResponsiveContainer width="100%" height={56}>
                <LineChart data={data} margin={{ top: 3, right: 1, bottom: 0, left: 1 }}>
                  <YAxis hide />
                  <Tooltip
                    content={<ChartTooltip showTotal={false} />}
                    cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  {sides.map((db) => (
                    <Line
                      key={db.id}
                      type="monotone"
                      dataKey={`${c.name}|${db.id}`}
                      name={`${c.name} — ${db.short}`}
                      stroke={SIDE_COLOR[db.id]}
                      strokeWidth={1.25}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 1.5, stroke: 'var(--panel)' }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
})
