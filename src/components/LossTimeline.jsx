import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, fmt, rangeLabel } from '../data/aggregate.js'
import { keyBuckets, runningTotal, statusBuckets } from '../data/cube.js'
import { MAX_SERIES, OTHER, statusColor } from '../data/palette.js'
import Panel from './Panel.jsx'
import Legend from './Legend.jsx'
import ChartTooltip from './ChartTooltip.jsx'
import { axisProps, gridProps } from './ui.jsx'

const UNIT = { week: 'week', month: 'month', quarter: 'quarter' }

/**
 * The dominant panel, and the drill-down chart.
 *
 * It knows nothing about categories: it plots whatever key dimension its cube carries,
 * so the dashboard renders it over categories and the overlay renders it over equipment
 * types with identical behaviour. Series come straight out of the pre-aggregated cube,
 * so a toggle is a few thousand integer adds rather than a rescan of the records.
 * Capped at MAX_SERIES because only six hues carry meaning at once; the remainder folds
 * into a neutral "Other".
 */
function LossTimeline({
  cube, keyIdxs, statusIdxs, granularity, cumulative, splitBy, keyStyles,
  keyNoun = 'category', title, onIsolate, emphasis, onEmphasis, onRangeChange, initialRange,
}) {
  const { seriesNames, values, displayName, styleOf, foldedCount } = useMemo(() => {
    const axisLen = cube.axes[granularity].length
    const add = (into, from) => {
      for (let i = 0; i < axisLen; i++) into[i] += from[i]
      return into
    }

    if (splitBy === 'outcome') {
      const names = []
      const vals = []
      cube.statuses.forEach((name, s) => {
        if (!statusIdxs.includes(s)) return
        const arr = statusBuckets(cube, granularity, s, keyIdxs)
        let any = 0
        for (let i = 0; i < axisLen; i++) any += arr[i]
        if (!any) return
        names.push(name)
        vals.push(arr)
      })
      return {
        seriesNames: names,
        values: vals,
        displayName: (n) => n,
        styleOf: (n) => ({ color: statusColor(n), dash: null }),
        foldedCount: 0,
      }
    }

    // Which series get a line of their own is a question of size, but they are drawn in
    // display order. Taking the first MAX_SERIES of keyIdxs instead would name whichever
    // categories happen to come first in Oryx's grouping and fold bigger ones into Other.
    const sizeOf = (k) => {
      let n = 0
      for (const s of statusIdxs) n += cube.totalAll[k * cube.nS + s]
      return n
    }
    const biggest = new Set(
      [...keyIdxs].sort((a, b) => sizeOf(b) - sizeOf(a)).slice(0, MAX_SERIES),
    )
    const named = keyIdxs.filter((k) => biggest.has(k))
    const folded = keyIdxs.filter((k) => !biggest.has(k))
    const names = named.map((k) => cube.keys[k])
    const vals = named.map((k) => keyBuckets(cube, granularity, k, statusIdxs))
    if (folded.length) {
      const other = new Float64Array(axisLen)
      for (const k of folded) add(other, keyBuckets(cube, granularity, k, statusIdxs))
      names.push(OTHER)
      vals.push(other)
    }
    return {
      seriesNames: names,
      values: vals,
      displayName: (n) => (n === OTHER ? `Other (${folded.length})` : n),
      styleOf: (n) => keyStyles.get(n) || { color: 'var(--series-other)', dash: null },
      foldedCount: folded.length,
    }
  }, [cube, keyIdxs, statusIdxs, granularity, splitBy, keyStyles])

  const series = useMemo(
    () => (cumulative ? values.map(runningTotal) : values),
    [values, cumulative],
  )

  const data = useMemo(() => {
    const axis = cube.axes[granularity]
    return axis.map((ts, i) => {
      const row = { label: bucketLabel(ts, granularity), __total: 0 }
      for (let k = 0; k < seriesNames.length; k++) {
        const v = series[k][i]
        row[seriesNames[k]] = v
        row.__total += v
      }
      return row
    })
  }, [cube, granularity, seriesNames, series])

  // The brush window is reported upward so the metric strip and the URL can follow it.
  // `initialRange` lets a shared link open on a narrowed window; without it the reset below
  // would wipe that window the moment the chart first measured its axis.
  const full = [0, Math.max(0, data.length - 1)]
  const [range, setRange] = useState(() =>
    initialRange && initialRange[1] < data.length ? initialRange : full,
  )
  const axisLenRef = useRef(data.length)
  useEffect(() => {
    // Only reset when the axis itself changed (a different bucket size), not on every render.
    if (axisLenRef.current !== data.length) {
      axisLenRef.current = data.length
      setRange([0, Math.max(0, data.length - 1)])
    }
  }, [data.length])
  useEffect(() => onRangeChange?.(range), [range, onRangeChange])

  // Scoped to the brush, because the chart is. In cumulative mode the value is the last
  // point still visible - the running total the line actually ends on - rather than the
  // window's own contribution, so the legend reads off the chart.
  const [wFrom, wTo] = useMemo(() => {
    const last = Math.max(0, data.length - 1)
    const a = Math.min(Math.max(0, range[0] ?? 0), last)
    return [a, Math.min(Math.max(a, range[1] ?? last), last)]
  }, [range, data.length])

  const totals = useMemo(
    () =>
      series.map((arr) => {
        if (!arr.length) return 0
        if (cumulative) return arr[wTo]
        let n = 0
        for (let i = wFrom; i <= wTo; i++) n += arr[i]
        return n
      }),
    [series, cumulative, wFrom, wTo],
  )

  const windowLabel = rangeLabel(cube.axes[granularity], granularity, wFrom, wTo)

  const legendItems = seriesNames.map((n, i) => ({
    key: n,
    label: displayName(n),
    value: totals[i],
    color: styleOf(n).color,
    dash: styleOf(n).dash,
  }))

  const columns = ['Period', ...seriesNames.map(displayName), 'Total']
  const tableRows = data
    .slice(wFrom, wTo + 1)
    .map((row) => [row.label, ...seriesNames.map((n) => row[n]), row.__total])

  const isolate = (key) => {
    if (splitBy === 'key' && key !== OTHER) onIsolate?.(key)
  }

  return (
    <Panel
      title={title || (cumulative ? 'Cumulative losses over time' : 'Losses over time')}
      caption={
        `Documented vehicles per ${UNIT[granularity]}` +
        (windowLabel ? ` · ${windowLabel}` : '') +
        (foldedCount ? ` · ${foldedCount} smaller ${keyNoun === 'type' ? 'types' : 'categories'} in Other` : '')
      }
      columns={columns}
      rows={tableRows}
      tableLabel="losses over time"
    >
      {seriesNames.length === 0 ? (
        <div className="empty">No {keyNoun === 'type' ? 'types' : 'categories'} selected.</div>
      ) : (
        <>
          <div className="scrollx">
            <div style={{ minWidth: 320 }}>
              {/* Taller than the plot alone needs: the extra room is the brush, which is
                  now a control rather than a hairline, so the chart keeps its size. */}
              <ResponsiveContainer width="100%" height={404}>
                <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={30} interval="preserveStartEnd" height={24} />
                  <YAxis {...axisProps} width={48} axisLine={false} tickFormatter={fmt} allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  {seriesNames.map((n) => {
                    const st = styleOf(n)
                    const muted = emphasis != null && emphasis !== n
                    return (
                      <Line
                        key={n}
                        type="monotone"
                        dataKey={n}
                        name={displayName(n)}
                        stroke={st.color}
                        strokeWidth={emphasis === n ? 2.75 : 2}
                        strokeDasharray={st.dash || undefined}
                        strokeOpacity={muted ? 0.18 : 1}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--panel)' }}
                        isAnimationActive={false}
                        onClick={() => isolate(n)}
                        style={{ cursor: splitBy === 'key' ? 'pointer' : 'default' }}
                      />
                    )
                  })}
                  {/* Sized for the mouse and for touch: this window scopes the metric
                      strip and four panels below, so it has to look draggable. Colours
                      come from CSS, which overrides these presentation attributes. */}
                  <Brush
                    dataKey="label"
                    height={40}
                    travellerWidth={13}
                    stroke="var(--brush-handle)"
                    fill="var(--brush-track)"
                    startIndex={range[0]}
                    endIndex={range[1]}
                    onChange={(r) => setRange([r.startIndex, r.endIndex])}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Legend
            items={legendItems}
            emphasis={emphasis}
            onEmphasis={onEmphasis}
            onIsolate={isolate}
            isStatic={splitBy === 'outcome'}
          />
        </>
      )}
    </Panel>
  )
}

export default memo(LossTimeline)
