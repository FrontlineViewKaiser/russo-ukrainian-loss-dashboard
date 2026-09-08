import { useId, useState } from 'react'
import DataTable from './DataTable.jsx'

/**
 * The shell every chart shares: compact title row, one-line caption, a Table toggle on
 * the right. The table is not a fallback - it is the accessible twin, so no value is
 * reachable only by hovering.
 */
export default function Panel({ title, caption, actions, columns, rows, tableLabel, children }) {
  const [asTable, setAsTable] = useState(false)
  const id = useId()

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <header>
        <div style={{ minWidth: 0 }}>
          <h2 id={`${id}-t`}>{title}</h2>
          {caption && <p className="cap">{caption}</p>}
        </div>
        <div className="spacer" />
        {actions}
        {columns && (
          <button
            type="button"
            className="btn"
            aria-pressed={asTable}
            aria-label={asTable ? `Show ${tableLabel || title} as chart` : `Show ${tableLabel || title} as table`}
            onClick={() => setAsTable((v) => !v)}
          >
            Table
          </button>
        )}
      </header>
      {asTable ? (
        <DataTable columns={columns} rows={rows} caption={title} />
      ) : (
        <div className="plot">{children}</div>
      )}
    </section>
  )
}
