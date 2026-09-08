import { fmt } from '../data/aggregate.js'

/** Screen-reader friendly twin of a chart. Scrolls rather than overflowing the viewport. */
export default function DataTable({ columns, rows, caption }) {
  return (
    <div className="tablewrap scrollx">
      <table className="data">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" style={{ fontWeight: 400 }}>
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{typeof cell === 'number' ? fmt(cell) : cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
