import { useRef } from 'react'
import { fmt } from '../data/aggregate.js'
import { Pill, Swatch } from './ui.jsx'

/**
 * Compact selector over a named dimension - categories on the dashboards, equipment types
 * in the drill-down, categories again on the comparison page.
 *
 * Two modes. The default is multi-select: clicking toggles, and isolation lives on the
 * bars, lines, legend and facets, so this stays usable as a visibility control alongside
 * the presets. `mode="single"` is a true radio group - exactly one item is always active,
 * which is what the comparison chart needs, since summing an arbitrary subset of
 * categories is not a meaningful quantity.
 *
 * The list is height-bounded and scrolls on desktop, and becomes a single horizontally
 * scrolling row on narrow screens, so it never becomes a wall of chips.
 */
export default function EntitySelector({
  items, selected, onToggle, styles, emphasis, onEmphasis, label,
  mode = 'multi', value, onSelect,
}) {
  if (mode === 'single') {
    return <SingleSelect items={items} value={value} onSelect={onSelect} label={label} />
  }

  return (
    <div className="panel">
      <div className="catbrowser">
        <span className="lbl" style={{ paddingTop: 8 }}>
          {selected.size}/{items.length}
        </span>
        <div className="catlist" role="group" aria-label={label || 'Visibility'}>
          {items.map((c) => {
            const st = styles.get(c.name) || {}
            const on = selected.has(c.name)
            return (
              <Pill
                key={c.name}
                pressed={on}
                onClick={() => onToggle(c.name)}
                title={`${c.name} — ${fmt(c.value)} vehicles`}
                onMouseEnter={() => on && onEmphasis?.(c.name)}
                onMouseLeave={() => onEmphasis?.(null)}
                style={emphasis && emphasis !== c.name && on ? { opacity: 0.45 } : undefined}
              >
                <Swatch color={st.color} dash={st.dash} />
                {c.name}
                <span className="n">{fmt(c.value)}</span>
              </Pill>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Radio group: roving tabindex so the whole strip is one tab stop, arrows move and select,
 * Home/End jump to the ends. Selecting is never undone by clicking the active item - there
 * is no valid "nothing selected" state here.
 */
function SingleSelect({ items, value, onSelect, label }) {
  const listRef = useRef(null)

  const move = (from, delta) => {
    if (!items.length) return
    const next = (from + delta + items.length) % items.length
    onSelect(items[next].name)
    listRef.current?.querySelectorAll('[role="radio"]')[next]?.focus()
  }

  const onKeyDown = (e, i) => {
    const keys = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    }
    if (e.key in keys) {
      e.preventDefault()
      move(i, keys[e.key])
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0, 0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(items.length - 1, 0)
    }
  }

  const activeIndex = Math.max(0, items.findIndex((c) => c.name === value))

  return (
    <div className="panel">
      <div className="catbrowser">
        <span className="lbl" style={{ paddingTop: 8 }}>
          Category
        </span>
        <div className="catlist" role="radiogroup" aria-label={label || 'Category'} ref={listRef}>
          {items.map((c, i) => {
            const on = c.name === value
            return (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={i === activeIndex ? 0 : -1}
                className="pill"
                title={`${c.name} — ${fmt(c.value)} vehicles`}
                onClick={() => onSelect(c.name)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {c.name}
                <span className="n">{fmt(c.value)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
