import { fmt } from '../data/aggregate.js'

/**
 * Primary navigation. Semantic links so the browser handles Back, middle-click and
 * keyboard for us; the hash is the single source of truth for which page is showing.
 */
export default function Sidebar({ pages, current, counts }) {
  return (
    <nav className="sidebar" aria-label="Sections">
      <div className="brand">
        <span className="brand-title">Oryx</span>
        <span className="brand-sub">Loss visualizer</span>
      </div>
      <ul>
        {pages.map((p) => (
          <li key={p.id}>
            <a
              href={`#/${p.id}`}
              className={'navlink' + (current === p.id ? ' on' : '')}
              aria-current={current === p.id ? 'page' : undefined}
            >
              <span className="dot" style={{ background: p.color }} aria-hidden="true" />
              <span className="navlabel">{p.label}</span>
              {counts[p.id] != null && <span className="navcount">{fmt(counts[p.id])}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
