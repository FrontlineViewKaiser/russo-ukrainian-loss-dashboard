/** Narrow row of compact metrics. Deliberately subordinate to the chart above it. */
export default function MetricStrip({ metrics }) {
  return (
    <div className="metrics">
      {metrics.map((m) => (
        <div className="metric" key={m.k}>
          <div className="k">{m.k}</div>
          <div className="v">
            {m.v}
            {m.unit && <span className="unit">{m.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
