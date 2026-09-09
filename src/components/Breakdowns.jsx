import { memo, useMemo } from 'react'
import {
  Bar, BarChart, Cell, CartesianGrid, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { bucketLabel, fmt } from '../data/aggregate.js'
import { statusBuckets } from '../data/cube.js'
import { statusColor } from '../data/palette.js'
import { clip, shortCat } from '../data/labels.js'
import Panel from './Panel.jsx'
import Legend from './Legend.jsx'
import ChartTooltip from './ChartTooltip.jsx'
import { axisProps, gridProps } from './ui.jsx'

const pct = (v, total) => (total ? ((100 * v) / total).toFixed(1) + '%' : '0%')

// These panels follow the timeline's brush, so each one says which window it is counting.
// rangeLabel returns null for the full span, which is the common case and needs no date range.
const inWindow = (label) => (label ? `${label} · dated entries` : 'All dated entries')
const ROW = 22
const ROW_WRAPPED = 27 // category names can wrap to two lines

/** Value at the end of each bar, so magnitudes are readable without hovering. */
const endLabel = { position: 'right', fill: 'var(--text-subtle)', fontSize: 10.5, formatter: fmt }

/* --------------------------------------------------------- losses by category -- */
function CategoryTotals({ categoryTotals, selected, onIsolate, emphasis, onEmphasis, windowLabel }) {
  const data = useMemo(() => categoryTotals.filter((d) => d.value > 0), [categoryTotals])

  return (
    <Panel
      title="Losses by category"
      caption={`${inWindow(windowLabel)} · click a bar to isolate`}
      columns={['Category', 'Vehicles']}
      rows={categoryTotals.map((d) => [d.name, d.value])}
      tableLabel="losses by category"
    >
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * ROW_WRAPPED + 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 46, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={fmt} axisLine={false} height={20} />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            width={164}
            axisLine={false}
            interval={0}
            tickFormatter={(n) => clip(shortCat(n), 24)}
          />
          <Tooltip content={<ChartTooltip showTotal={false} />} cursor={{ fill: 'var(--grid)' }} isAnimationActive={false} />
          <Bar
            dataKey="value"
            name="Vehicles"
            radius={[0, 3, 3, 0]}
            barSize={11}
            isAnimationActive={false}
            onClick={(d) => onIsolate(d.name)}
            onMouseEnter={(d) => onEmphasis?.(d.name)}
            onMouseLeave={() => onEmphasis?.(null)}
            style={{ cursor: 'pointer' }}
          >
            {data.map((d) => (
              <Cell
                key={d.name}
                fill="var(--series-1)"
                fillOpacity={emphasis && emphasis !== d.name ? 0.25 : selected.has(d.name) ? 1 : 0.38}
              />
            ))}
            <LabelList dataKey="value" {...endLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="note" style={{ marginTop: 6 }}>
        Faded bars are outside the current selection.
      </p>
    </Panel>
  )
}

/* ----------------------------------------------------------- top equipment -- */
function TopTypes({ typeTotals, limit = 20, windowLabel }) {
  const data = useMemo(() => typeTotals.slice(0, limit), [typeTotals, limit])

  return (
    <Panel
      title="Top equipment types"
      caption={`${limit} most-lost of ${fmt(typeTotals.length)} types · ${inWindow(windowLabel)}`}
      columns={['Type', 'Vehicles']}
      rows={typeTotals.map((d) => [d.name, d.value])}
      tableLabel="top equipment types"
    >
      {!data.length ? (
        <div className="empty">Nothing matches the current filters.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * ROW + 32)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 46, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" {...axisProps} tickFormatter={fmt} axisLine={false} height={20} />
            <YAxis
              type="category"
              dataKey="name"
              {...axisProps}
              width={152}
              axisLine={false}
              interval={0}
              tickFormatter={(n) => clip(n, 24)}
            />
            <Tooltip content={<ChartTooltip showTotal={false} />} cursor={{ fill: 'var(--grid)' }} isAnimationActive={false} />
            <Bar dataKey="value" name="Vehicles" fill="var(--series-alt)" radius={[0, 3, 3, 0]} barSize={11} isAnimationActive={false}>
              <LabelList dataKey="value" {...endLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ outcome -- */
function Outcome({ statusTotals, windowLabel }) {
  // Fixed order, never value order: the colour sequence is only validated for these
  // adjacencies, so a filter must not reshuffle the ring.
  const data = useMemo(() => statusTotals.filter((d) => d.value > 0), [statusTotals])
  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data])

  return (
    <Panel
      title="Outcome"
      caption={`Share of documented vehicles · ${inWindow(windowLabel)}`}
      columns={['Outcome', 'Vehicles', 'Share']}
      rows={data.map((d) => [d.name, d.value, pct(d.value, total)])}
      tableLabel="outcome breakdown"
    >
      {!total ? (
        <div className="empty">Nothing matches the current filters.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={1.2}
                stroke="var(--panel)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={statusColor(d.name)} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip showTotal={false} />} isAnimationActive={false} />
            </PieChart>
          </ResponsiveContainer>
          <Legend
            isStatic
            items={data.map((d) => ({ key: d.name, label: d.name, color: statusColor(d.name), value: d.value }))}
          />
        </>
      )}
    </Panel>
  )
}

/* ------------------------------------------------ monthly composition by outcome -- */
function MonthlyStatus({ cube, keyIdxs, statusIdxs }) {
  const { names, data } = useMemo(() => {
    const axis = cube.axes.month
    const names = []
    const arrays = []
    cube.statuses.forEach((name, s) => {
      if (!statusIdxs.includes(s)) return
      const arr = statusBuckets(cube, 'month', s, keyIdxs)
      let any = 0
      for (let i = 0; i < arr.length; i++) any += arr[i]
      if (!any) return
      names.push(name)
      arrays.push(arr)
    })
    const data = axis.map((ts, i) => {
      const row = { label: bucketLabel(ts, 'month'), __total: 0 }
      for (let k = 0; k < names.length; k++) {
        row[names[k]] = arrays[k][i]
        row.__total += arrays[k][i]
      }
      return row
    })
    return { names, data }
  }, [cube, keyIdxs, statusIdxs])

  return (
    <Panel
      title="Monthly composition by outcome"
      caption="Dated entries only"
      columns={['Month', ...names, 'Total']}
      rows={data.map((row) => [row.label, ...names.map((s) => row[s]), row.__total])}
      tableLabel="monthly composition by outcome"
    >
      {!names.length ? (
        <div className="empty">Nothing matches the current filters.</div>
      ) : (
        <>
          <div className="scrollx">
            <div style={{ minWidth: 320 }}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={30} interval="preserveStartEnd" height={24} />
                  <YAxis {...axisProps} width={44} axisLine={false} tickFormatter={fmt} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--grid)' }} isAnimationActive={false} />
                  {names.map((s, i) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="a"
                      fill={statusColor(s)}
                      stroke="var(--panel)"
                      strokeWidth={1.5}
                      radius={i === names.length - 1 ? [2, 2, 0, 0] : 0}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Legend isStatic items={names.map((s) => ({ key: s, label: s, color: statusColor(s) }))} />
        </>
      )}
    </Panel>
  )
}

export const CategoryTotalsBar = memo(CategoryTotals)
export const TopTypesBar = memo(TopTypes)
export const StatusDonut = memo(Outcome)
export const MonthlyStatusStack = memo(MonthlyStatus)
