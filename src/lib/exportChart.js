/**
 * Turns one chart panel into a self-contained PNG, for copying or downloading.
 *
 * The awkward part is colour. Every mark is painted with a CSS custom property -
 * `stroke="var(--series-1)"`, `fill="var(--grid)"` and eleven others - and custom
 * properties only resolve against the document that defines them. Serialise the SVG out of
 * the page and every one of them resolves to nothing, so the export comes back blank. The
 * tokens are therefore read from the live document and substituted into the clone before it
 * is rasterised. It also means an export made in dark mode is correctly dark.
 *
 * No dependency: compose an SVG, rasterise it through an <img> onto a canvas, take a blob.
 */

const TOKENS = [
  'panel', 'bg', 'text', 'text-muted', 'text-subtle', 'border', 'grid', 'axis',
  'series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6',
  'series-other', 'series-alt', 'panel-sunken',
]

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const PAD = 18
const SCALE = 2 // rasterise at 2x so the result is sharp on a normal display

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Current values of every palette token, so var() references can be substituted. */
function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const out = {}
  for (const t of TOKENS) out[t] = cs.getPropertyValue(`--${t}`).trim() || '#000'
  return out
}

/** Replaces every var(--x) in the markup with the value it currently resolves to. */
const resolveVars = (markup, tokens) =>
  markup.replace(/var\(--([a-z0-9-]+)(?:\s*,\s*[^)]*)?\)/gi, (m, name) => tokens[name] ?? m)

/** Reads the panel's own legend out of the DOM rather than re-plumbing the data. */
function readLegend(panel) {
  return [...panel.querySelectorAll('.legend .legend-item')].map((el) => {
    const sw = el.querySelector('.swatch')
    let colour = '#888'
    if (sw) {
      const cs = getComputedStyle(sw)
      colour = cs.borderTopWidth !== '0px' ? cs.borderTopColor : cs.backgroundColor
    }
    const value = el.querySelector('.v')?.textContent.trim() || ''
    const label = el.textContent.replace(value, '').trim()
    return { label, value, colour }
  })
}

/**
 * @param {HTMLElement} panel a `.panel` element containing exactly one recharts SVG
 * @returns {Promise<Blob|null>} PNG blob, or null if the panel has no single chart
 */
export async function panelToPng(panel, { link } = {}) {
  const svgs = panel.querySelectorAll('svg.recharts-surface')
  if (svgs.length !== 1) return null // facet grids are handled by the drill-down instead
  const src = svgs[0]

  const tokens = readTokens()
  const rect = src.getBoundingClientRect()
  const w = Math.max(320, Math.round(rect.width))
  const chartH = Math.round(rect.height)

  const title = panel.querySelector('h2')?.textContent?.trim() || 'Chart'
  const caption = panel.querySelector('.cap')?.textContent?.trim() || ''
  const legend = readLegend(panel)

  // Flow the legend left to right, wrapping when the next item will not fit. Fixed columns
  // clipped the longer category names into each other.
  const CH = 6.15 // approximate advance width at 11.5px in the UI sans
  const itemW = (it) => 14 + (it.label.length + (it.value ? it.value.length + 2 : 0)) * CH + 20
  const layout = []
  let lx = PAD
  let lrow = 0
  for (const it of legend) {
    const iw = itemW(it)
    if (lx > PAD && lx + iw > w - PAD) {
      lrow += 1
      lx = PAD
    }
    layout.push({ ...it, x: lx, row: lrow })
    lx += iw
  }
  const legendRows = legend.length ? lrow + 1 : 0
  const headH = caption ? 44 : 28
  const legendH = legend.length ? legendRows * 18 + 14 : 0

  // Footer: source on the left, link on the right. On a narrow chart the two run into each
  // other, so fall back to stacking them - and shorten an over-long deep link to the page
  // it points at rather than letting it overflow the image.
  const CREDIT = 'Source: Oryx · scraped and processed by Cracken.ai'
  const FOOT_CH = 5.4
  const avail = w - PAD * 2
  let footLink = link || ''
  if (footLink && footLink.length * FOOT_CH > avail) {
    const qi = footLink.indexOf('?')
    if (qi !== -1) footLink = footLink.slice(0, qi)
  }
  if (footLink && footLink.length * FOOT_CH > avail) {
    footLink = footLink.slice(0, Math.max(8, Math.floor(avail / FOOT_CH) - 1)) + '…'
  }
  const footStacked =
    !!footLink && (CREDIT.length + footLink.length) * FOOT_CH + 24 > avail
  const footH = footStacked ? 50 : 34
  const h = PAD + headH + chartH + legendH + footH + PAD

  const clone = src.cloneNode(true)
  // Keep explicit dimensions. A nested <svg> without width/height defaults to 100% of its
  // parent, so the chart would stretch over the whole output and cover the legend.
  clone.setAttribute('width', String(rect.width))
  clone.setAttribute('height', String(rect.height))
  clone.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
  const chartMarkup = resolveVars(new XMLSerializer().serializeToString(clone), tokens)

  let y = PAD + 18
  const parts = [
    `<rect width="${w}" height="${h}" fill="${tokens.panel}"/>`,
    `<text x="${PAD}" y="${y}" font-family='${FONT}' font-size="15" font-weight="600" fill="${tokens.text}">${esc(title)}</text>`,
  ]
  if (caption) {
    y += 16
    parts.push(
      `<text x="${PAD}" y="${y}" font-family='${FONT}' font-size="11.5" fill="${tokens['text-subtle']}">${esc(caption)}</text>`,
    )
  }

  parts.push(`<g transform="translate(0 ${PAD + headH})">${chartMarkup}</g>`)

  const ly = PAD + headH + chartH + 16
  for (const it of layout) {
    const yy = ly + it.row * 18
    parts.push(`<rect x="${it.x}" y="${yy - 8}" width="9" height="9" rx="2" fill="${it.colour}"/>`)
    parts.push(
      `<text x="${it.x + 14}" y="${yy}" font-family='${FONT}' font-size="11.5" fill="${tokens['text-muted']}">${esc(it.label)}${it.value ? `  ${esc(it.value)}` : ''}</text>`,
    )
  }

  const footTop = h - PAD - footH + 12
  parts.push(
    `<line x1="${PAD}" y1="${footTop}" x2="${w - PAD}" y2="${footTop}" stroke="${tokens.grid}"/>`,
    `<text x="${PAD}" y="${footTop + 15}" font-family='${FONT}' font-size="10.5" fill="${tokens['text-subtle']}">${esc(CREDIT)}</text>`,
  )
  if (footLink) {
    parts.push(
      footStacked
        ? `<text x="${PAD}" y="${footTop + 31}" font-family='${FONT}' font-size="10.5" fill="${tokens['text-subtle']}">${esc(footLink)}</text>`
        : `<text x="${w - PAD}" y="${footTop + 15}" text-anchor="end" font-family='${FONT}' font-size="10.5" fill="${tokens['text-subtle']}">${esc(footLink)}</text>`,
    )
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`

  const img = new Image()
  img.decoding = 'sync'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('could not rasterise the chart'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })

  const canvas = document.createElement('canvas')
  canvas.width = w * SCALE
  canvas.height = h * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.drawImage(img, 0, 0)
  // The SVG pulls in no external resources, so the canvas is not tainted.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart'

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Writing images to the clipboard needs a secure context and is not universal. */
export const canCopyImages = () =>
  typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write && window.isSecureContext

export async function copyBlob(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
