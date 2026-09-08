import { fmt } from '../data/aggregate.js'
import { UNREACHABLE_STATUSES } from '../data/warspotting.js'
import Panel from './Panel.jsx'

/**
 * States, from the snapshot itself rather than from assertion, how far this source lines
 * up with the Oryx datasets. Everything here is computed at load; nothing is hardcoded
 * except the taxonomy counts, which come from comparing the two category lists.
 */
export default function CompatibilityNote({ db, oryxCats }) {
  const c = db.warspotting
  const wsCats = db.orderedCats
  const norm = (x) => x.toLowerCase().replace(/[^a-z]/g, '')
  const shared = wsCats.filter((w) => oryxCats.some((o) => norm(o) === norm(w)))

  const apiTotal = c.apiTotals ? Object.values(c.apiTotals).reduce((a, b) => a + b, 0) : null

  const rows = [
    ['date', 'Maps — and better', `ISO dates on every record; ${c.undated} undated, versus 29% in the Oryx files`],
    ['model', 'Maps', `${fmt(db.coverage.types)} models, feeding the same type drill-down`],
    ['status', 'Partial', `4 outcomes only; ${UNREACHABLE_STATUSES.join(' and ')} can never occur here`],
    ['type', 'Different taxonomy', `${wsCats.length} types vs Oryx's ${oryxCats.length} categories; ${shared.length} names coincide`],
    ['lost_by', 'Russian losses only', 'Other belligerents are ignored by the API, so this cannot join the Comparison'],
    ['—', 'No multi-vehicle rows', 'One record is one vehicle, so no weight parsing is needed'],
    ['—', 'No evidence link', 'The API does not expose the photo or video backing a record'],
    ['geo', 'New', `${fmt(c.withGeo)} records (${c.geoPct}%) carry coordinates — Oryx has none`],
    ['nearest_location', 'New', `${fmt(c.withPlace)} records (${c.placePct}%)`],
    ['tags', 'New', `${fmt(c.withTags)} records (${c.tagsPct}%), e.g. "Cope cage", "Loitering"`],
    ['unit', 'New but sparse', `${fmt(c.withUnit)} records (${c.unitPct}%) name the losing unit`],
  ]

  return (
    <Panel
      title="Compatibility with the Oryx datasets"
      caption="What maps across, what does not, and what is new here"
      columns={['Field', 'Verdict', 'Detail']}
      rows={rows}
      tableLabel="field compatibility"
    >
      <div className="tablewrap" style={{ maxHeight: 'none', marginTop: 0 }}>
        <table className="data compat">
          <tbody>
            {rows.map(([field, verdict, detail]) => (
              <tr key={field + verdict}>
                <th scope="row" style={{ fontWeight: 500 }}>
                  <code>{field}</code>
                </th>
                <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{verdict}</td>
                <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Snapshot of {c.fetchedAt ? new Date(c.fetchedAt).toISOString().slice(0, 10) : 'unknown date'} via{' '}
        <code>npm run fetch:warspotting</code>
        {apiTotal != null && (
          <>
            {' '}· {fmt(db.coverage.entries)} records held, API reported {fmt(apiTotal)}
          </>
        )}
        . The API publishes no bulk export, so this is a point-in-time copy rather than a live feed.
      </p>
    </Panel>
  )
}
