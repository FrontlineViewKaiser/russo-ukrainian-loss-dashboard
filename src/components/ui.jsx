/** Shared primitives: swatch, segmented control, pill, and chart axis defaults. */

export function Swatch({ color, dash }) {
  if (dash === undefined) return <span className="swatch" style={{ background: color }} />
  return (
    <span
      className="swatch line"
      style={{ borderTopColor: color, borderTopStyle: dash ? 'dashed' : 'solid' }}
    />
  )
}

/** A single-choice group. `label` names it for screen readers as well as on screen. */
export function Segmented({ value, onChange, options, label, showLabel = true }) {
  return (
    <div className="group">
      {label && showLabel && <span className="lbl">{label}</span>}
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Two-state button. Pressed state is carried by aria-pressed, not colour alone. */
export function Toggle({ checked, onChange, children, title }) {
  return (
    <button type="button" className="btn" aria-pressed={checked} title={title} onClick={() => onChange(!checked)}>
      {children}
    </button>
  )
}

export function Pill({ pressed, onClick, children, title, ...rest }) {
  return (
    <button type="button" className="pill" aria-pressed={pressed} onClick={onClick} title={title} {...rest}>
      {children}
    </button>
  )
}

/** Recharts axis defaults - small, grey, no tick marks. */
export const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--text-subtle)', fontSize: 10.5 },
  tickLine: false,
}

export const gridProps = { stroke: 'var(--grid)' }
