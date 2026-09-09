import { useId, useRef, useState } from 'react'
import DataTable from './DataTable.jsx'
import { canCopyImages, copyBlob, downloadBlob, panelToPng, slug } from '../lib/exportChart.js'

/**
 * The shell every chart shares: compact title row, one-line caption, a Table toggle on
 * the right. The table is not a fallback - it is the accessible twin, so no value is
 * reachable only by hovering.
 */
export default function Panel({
  title, caption, actions, columns, rows, tableLabel, exportable = true, children,
}) {
  const [asTable, setAsTable] = useState(false)
  const [flash, setFlash] = useState('')
  const ref = useRef(null)
  const id = useId()

  // Declared by the caller rather than sniffed from the DOM: Recharts has not rendered its
  // SVG when the ref callback first fires, so counting surfaces there always saw zero.
  // The facet grids pass exportable={false}; panelToPng still guards as a backstop.
  const canExport = exportable

  const note = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 1800)
  }

  const exportPng = async (mode) => {
    try {
      const blob = await panelToPng(ref.current, { link: location.href })
      if (!blob) return note('nothing to export')
      if (mode === 'copy') {
        await copyBlob(blob)
        note('copied')
      } else {
        downloadBlob(blob, `${slug(title)}.png`)
        note('saved')
      }
    } catch (e) {
      note('export failed')
      console.error('chart export failed:', e)
    }
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`} ref={ref}>
      <header>
        <div style={{ minWidth: 0 }}>
          <h2 id={`${id}-t`}>{title}</h2>
          {caption && <p className="cap">{caption}</p>}
        </div>
        <div className="spacer" />
        {flash && (
          <span className="flash" role="status">
            {flash}
          </span>
        )}
        {actions}
        {canExport && !asTable && canCopyImages() && (
          <button type="button" className="btn" onClick={() => exportPng('copy')} title="Copy this chart as an image">
            Copy
          </button>
        )}
        {canExport && !asTable && (
          <button type="button" className="btn" onClick={() => exportPng('save')} title="Download this chart as a PNG">
            PNG
          </button>
        )}
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
