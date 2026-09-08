import { fmt } from '../data/aggregate.js'
import { Swatch } from './ui.jsx'

/** Series sorted by value descending, with an optional total. */
export default function ChartTooltip({ active, payload, label, showTotal = true }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && p.value !== 0).sort((a, b) => b.value - a.value)
  if (!rows.length) return null
  const total = rows.reduce((a, p) => a + p.value, 0)

  return (
    <div className="tip">
      <div className="t">{label}</div>
      {rows.map((p) => (
        <div className="r" key={p.dataKey ?? p.name}>
          <Swatch color={p.color || p.payload?.fill} />
          <span className="l">{p.name}</span>
          <span className="n">{fmt(p.value)}</span>
        </div>
      ))}
      {showTotal && rows.length > 1 && (
        <div className="tot">
          <span className="l">Total</span>
          <span className="n">{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}
