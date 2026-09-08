import { memo, useMemo } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { statusColor } from '../data/palette.js'
import { fmt } from '../data/aggregate.js'
import Panel from './Panel.jsx'
import Legend from './Legend.jsx'
import { axisProps, gridProps } from './ui.jsx'

/** Recharts slows badly past a few thousand marks, so cap what is drawn. */
const MAX_POINTS = 2500
const DEG = Math.PI / 180

/**
 * Where the losses were recorded. WarSpotting is the only source here with coordinates.
 *
 * Deliberately not a slippy map: the points are plotted on an equirectangular projection
 * (x = lon * cos(meanLat)) so the shape is not stretched, with no basemap and no tile
 * requests. It shows the front line clearly enough without another dependency.
 */
function LossMap({ rows }) {
  const view = useMemo(() => {
    const withGeo = rows.filter((r) => r.geo)
    if (!withGeo.length) return { series: [], located: 0, shown: 0, farField: 0, aspect: 2 }

    // Clip to where the fighting is. A handful of losses are 2,000 km away - Tu-95s at
    // Olenya airbase at 68 N, Tu-22M3s in Irkutsk oblast at 103 E - and they are real, but
    // plotting them squeezes the entire front into a corner. Clip to the 1-99th percentile
    // and say how many fell outside rather than dropping them silently.
    const pick = (arr, p) => arr[Math.floor((arr.length - 1) * p)]
    const lats = withGeo.map((r) => r.geo[0]).sort((a, b) => a - b)
    const lons = withGeo.map((r) => r.geo[1]).sort((a, b) => a - b)
    const clip = withGeo.length >= 100
    const box = clip
      ? { s: pick(lats, 0.01), n: pick(lats, 0.99), w: pick(lons, 0.01), e: pick(lons, 0.99) }
      : { s: lats[0], n: lats[lats.length - 1], w: lons[0], e: lons[lons.length - 1] }

    const inside = withGeo.filter(
      (r) => r.geo[0] >= box.s && r.geo[0] <= box.n && r.geo[1] >= box.w && r.geo[1] <= box.e,
    )
    const farField = withGeo.length - inside.length

    // Recharts will not draw 14,500 marks smoothly; deterministic stride keeps it stable.
    const stride = Math.ceil(inside.length / MAX_POINTS)
    const sampled = stride > 1 ? inside.filter((_, i) => i % stride === 0) : inside

    const k = Math.cos(((box.s + box.n) / 2) * DEG)
    const byStatus = new Map()
    for (const r of sampled) {
      const [lat, lon] = r.geo
      let arr = byStatus.get(r.status)
      if (!arr) byStatus.set(r.status, (arr = []))
      arr.push({ x: lon * k, y: lat, lat, lon, model: r.typeName, date: r.ym, place: r.place, status: r.status })
    }

    const w = Math.max(0.25, (box.e - box.w) * k)
    const h = Math.max(0.25, box.n - box.s)
    return {
      series: [...byStatus.entries()].map(([status, points]) => ({ status, points })),
      located: withGeo.length,
      shown: sampled.length,
      farField,
      // Equal degrees per pixel on both axes once longitude is scaled by cos(lat).
      aspect: Math.min(3.2, Math.max(0.9, w / h)),
      domain: { x: [box.w * k, box.e * k], y: [box.s, box.n] },
    }
  }, [rows])

  const { series, located, shown, farField, aspect, domain } = view
  const noGeo = rows.length - located

  return (
    <Panel
      title="Where"
      caption={
        located
          ? `${fmt(shown)} of ${fmt(located)} located losses plotted · ${fmt(noGeo)} have no coordinates` +
            (farField ? ` · ${fmt(farField)} far-field losses outside this view` : '')
          : 'No coordinates in the current selection'
      }
      columns={['Model', 'Outcome', 'Month', 'Latitude', 'Longitude', 'Place']}
      rows={series
        .flatMap((s) => s.points)
        .slice(0, 500)
        .map((p) => [p.model, p.status, p.date, p.lat.toFixed(4), p.lon.toFixed(4), p.place || '—'])}
      tableLabel="located losses"
    >
      {!located ? (
        <div className="empty">Nothing in this selection carries coordinates.</div>
      ) : (
        <>
          {/* aspect-ratio on the wrapper keeps the projection true at any width. */}
          <div style={{ aspectRatio: String(aspect), maxWidth: 420 * aspect, margin: '0 auto', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis type="number" dataKey="x" domain={domain.x} {...axisProps} axisLine={false} tick={false} height={6} />
                <YAxis type="number" dataKey="y" domain={domain.y} {...axisProps} axisLine={false} tick={false} width={6} />
                <ZAxis range={[8, 8]} />
                <Tooltip content={<MapTooltip />} isAnimationActive={false} cursor={false} />
                {series.map((s) => (
                  <Scatter
                    key={s.status}
                    name={s.status}
                    data={s.points}
                    fill={statusColor(s.status)}
                    fillOpacity={0.5}
                    isAnimationActive={false}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <Legend
            isStatic
            items={series.map((s) => ({ key: s.status, label: s.status, color: statusColor(s.status), value: s.points.length }))}
          />
          <p className="note" style={{ marginTop: 6 }}>
            Equirectangular plot, no basemap. Scaled by cos(latitude) so the shape is not stretched.
          </p>
        </>
      )}
    </Panel>
  )
}

function MapTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tip">
      <div className="t">{p.model}</div>
      <div className="r">
        <span className="l">{p.status}</span>
        <span className="n">{p.date}</span>
      </div>
      {p.place && (
        <div className="r">
          <span className="l">{p.place}</span>
        </div>
      )}
      <div className="r">
        <span className="l" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
        </span>
      </div>
    </div>
  )
}

export default memo(LossMap)
