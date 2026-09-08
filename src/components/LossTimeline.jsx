import { memo, useEffect, useMemo, useState } from 'react'
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, fmt } from '../data/aggregate.js'
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
  keyNoun = 'category', title, onIsolate, emphasis, onEmphasis, onRangeChange,
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

    const named = keyIdxs.slice(0, MAX_SERIES)
    const folded = keyIdxs.slice(MAX_SERIES)
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

  // The brush window is reported upward so the metric strip can scope itself to it.
  // Changing the bucket size rebuilds the axis, so the window resets to the full span.
  const [range, setRange] = useState([0, Math.max(0, data.length - 1)])
  useEffect(() => setRange([0, Math.max(0, data.length - 1)]), [data.length])
  useEffect(() => onRangeChange?.(range), [range, onRangeChange])

  const totals = useMemo(
    () =>
      series.map((arr) => {
        if (cumulative) return arr.length ? arr[arr.length - 1] : 0
        let n = 0
        for (let i = 0; i < arr.length; i++) n += arr[i]
        return n
      }),
    [series, cumulative],
  )

  const legendItems = seriesNames.map((n, i) => ({
    key: n,
    label: displayName(n),
    value: totals[i],
    color: styleOf(n).color,
    dash: styleOf(n).dash,
  }))

  const columns = ['Period', ...seriesNames.map(displayName), 'Total']
  const tableRows = data.map((row) => [row.label, ...seriesNames.map((n) => row[n]), row.__total])

  const isolate = (key) => {
    if (splitBy === 'key' && key !== OTHER) onIsolate?.(key)
  }

  return (
    <Panel
      title={title || (cumulative ? 'Cumulative losses over time' : 'Losses over time')}
      caption={
        `Documented vehicles per ${UNIT[granularity]}` +
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
