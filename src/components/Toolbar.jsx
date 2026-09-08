import { GRANULARITIES } from '../data/aggregate.js'
import { statusColor } from '../data/palette.js'
import { Pill, Segmented, Swatch } from './ui.jsx'

const SPLITS = [
  { id: 'key', label: 'Category' },
  { id: 'outcome', label: 'Outcome' },
]
const TYPE_SPLITS = [
  { id: 'key', label: 'Type' },
  { id: 'outcome', label: 'Outcome' },
]

/**
 * Every control in one bar. Nothing here is per-chart: one filter set scopes the whole
 * page. Below 720px the groups collapse behind the Filters button.
 */
export default function Toolbar({
  granularity, setGranularity,
  cumulative, setCumulative,
  splitBy, setSplitBy,
  statuses, selectedStatuses, toggleStatus, allStatuses,
  onAllCats, onTopCats, onNoneCats, topCount,
  onReset, open, setOpen,
  keyLabel = 'Categories', keyNoun = 'category',
}) {
  const allOutcomes = statuses.every((s) => selectedStatuses.has(s))

  return (
    <div className="panel">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button
          type="button"
          className="btn only-narrow"
          aria-expanded={open}
          aria-controls="toolbar-controls"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide filters' : 'Filters'}
        </button>

        <div className="toolbar collapsible" id="toolbar-controls" data-open={open} style={{ flex: '1 1 auto' }}>
          <Segmented label="Bucket" value={granularity} onChange={setGranularity} options={GRANULARITIES} />

          <Segmented
            label="Total"
            value={cumulative ? 'cumulative' : 'period'}
            onChange={(v) => setCumulative(v === 'cumulative')}
            options={[
              { id: 'period', label: 'Per period' },
              { id: 'cumulative', label: 'Cumulative' },
            ]}
          />

          <Segmented
            label="Split"
            value={splitBy}
            onChange={setSplitBy}
            options={keyNoun === 'type' ? TYPE_SPLITS : SPLITS}
          />

          <div className="divider" aria-hidden="true" />

          <div className="group" style={{ alignItems: 'flex-start' }}>
            <span className="lbl" style={{ paddingTop: 7 }}>
              Outcome
            </span>
            <div className="wrapgroup" role="group" aria-label="Outcome filters">
              {statuses.map((s) => (
                <Pill
                  key={s}
                  pressed={selectedStatuses.has(s)}
                  onClick={() => toggleStatus(s)}
                  title={`Toggle ${s}`}
                >
                  <Swatch color={statusColor(s)} />
                  {s}
                </Pill>
              ))}
              <Pill pressed={allOutcomes} onClick={allStatuses} title="Select every outcome">
                All
              </Pill>
            </div>
          </div>

          <div className="divider" aria-hidden="true" />

          <div className="group">
            <span className="lbl">{keyLabel}</span>
            <div className="seg" role="group" aria-label={`${keyLabel} visibility presets`}>
              <button type="button" className="btn" onClick={onAllCats}>
                All
              </button>
              <button type="button" className="btn" onClick={onTopCats}>
                Top {topCount}
              </button>
              <button type="button" className="btn" onClick={onNoneCats}>
                None
              </button>
            </div>
          </div>

          <div className="spacer" style={{ flex: '1 1 auto' }} />

          <button type="button" className="btn" onClick={onReset} title="Restore the default selection">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
