import { fmt } from '../data/aggregate.js'
import { Swatch } from './ui.jsx'

/**
 * Compact wrapping legend. Interactive by default: hovering an item emphasises its
 * series and mutes the rest, clicking isolates it. Pass `static` for charts where
 * there is nothing to isolate.
 */
export default function Legend({ items, emphasis, onEmphasis, onIsolate, isStatic }) {
  return (
    <div className={'legend' + (isStatic ? ' static' : '')}>
      {items.map((it) => {
        const muted = emphasis != null && emphasis !== it.key
        const cls = 'legend-item' + (muted ? ' muted' : '')
        if (isStatic) {
          return (
            <span key={it.key} className={cls}>
              <Swatch color={it.color} dash={it.dash} />
              {it.label}
              {it.value != null && <span className="v">{fmt(it.value)}</span>}
            </span>
          )
        }
        return (
          <button
            key={it.key}
            className={cls}
            type="button"
            title={`Show only ${it.label}`}
            onClick={() => onIsolate?.(it.key)}
            onMouseEnter={() => onEmphasis?.(it.key)}
            onMouseLeave={() => onEmphasis?.(null)}
            onFocus={() => onEmphasis?.(it.key)}
            onBlur={() => onEmphasis?.(null)}
          >
            <Swatch color={it.color} dash={it.dash} />
            {it.label}
            {it.value != null && <span className="v">{fmt(it.value)}</span>}
          </button>
        )
      })}
    </div>
  )
}
