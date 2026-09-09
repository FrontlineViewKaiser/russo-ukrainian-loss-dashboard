import { memo, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { bucketLabel, fmt } from '../data/aggregate.js'
import { keyBuckets, runningTotal } from '../data/cube.js'
import Panel from './Panel.jsx'
import ChartTooltip from './ChartTooltip.jsx'
import { Toggle } from './ui.jsx'

/**
 * Where the categories outside the main chart stay legible. Each panel is a single
 * series, so none needs a hue to be identified - the title does that.
 *
 * This deliberately does NOT depend on the category selection: it always shows all 23.
 * Combined with memo, that means toggling a category never re-renders these 23 charts,
 * which is what made toggling slow.
 */
function SmallMultiples({ cube, statusIdxs, granularity, cumulative, categoryTotals, onOpenDetail }) {
  const [shared, setShared] = useState(false)

  const { data, peaks, globalPeak } = useMemo(() => {
    const axis = cube.axes[granularity]
    const names = cube.keys
    const arrays = names.map((_, c) => {
      const arr = keyBuckets(cube, granularity, c, statusIdxs)
      return cumulative ? runningTotal(arr) : arr
    })
    const peaks = {}
    names.forEach((n, c) => {
      let m = 0
      for (let i = 0; i < arrays[c].length; i++) if (arrays[c][i] > m) m = arrays[c][i]
      peaks[n] = m
    })
    const data = axis.map((ts, i) => {
      const row = { label: bucketLabel(ts, granularity) }
      names.forEach((n, c) => (row[n] = arrays[c][i]))
      return row
    })
    return { data, peaks, globalPeak: Math.max(1, ...Object.values(peaks)) }
  }, [cube, statusIdxs, granularity, cumulative])

  return (
    <Panel
      exportable={false}
      title="Every category"
      caption="Click a panel for its breakdown by type"
      actions={
        <Toggle checked={shared} onChange={setShared} title="Use one y-scale across all panels">
          Shared scale
        </Toggle>
      }
      columns={['Category', 'Peak', 'Total']}
      rows={categoryTotals.map((c) => [c.name, peaks[c.name] || 0, c.value])}
      tableLabel="every category"
    >
      <div className="facets">
        {categoryTotals.map((c) => (
          <button
            key={c.name}
            type="button"
            className="facet"
            onClick={(e) => onOpenDetail(c.name, e.currentTarget)}
            title={`${c.name} — losses by type`}
          >
            <div className="ft">{c.name}</div>
            <div className="fv">
              {fmt(c.value)} · peak {fmt(peaks[c.name] || 0)}
            </div>
            <ResponsiveContainer width="100%" height={56}>
              <AreaChart data={data} margin={{ top: 3, right: 1, bottom: 0, left: 1 }}>
                <YAxis hide domain={[0, shared ? globalPeak : 'auto']} />
                <Tooltip
                  content={<ChartTooltip showTotal={false} />}
                  cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Area
                  dataKey={c.name}
                  name={c.name}
                  stroke="var(--series-1)"
                  strokeWidth={1.25}
                  fill="var(--series-1)"
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1.5, stroke: 'var(--panel)' }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </button>
        ))}
      </div>
    </Panel>
  )
}

export default memo(SmallMultiples)
