# Oryx Loss Visualizer

An interactive dashboard over documented equipment-loss catalogues from the Russo-Ukrainian war.

> The Oryx data in this repository was **scraped and processed by [Cracken.ai](https://cracken.ai/platform)**.

Four sections in the sidebar:

| Section | Data |
|---|---|
| **Russian Losses** | `oryx-ru.json` — the real Oryx list of visually-confirmed losses. 23,117 entries, **23,904 vehicles**, 23 categories, 602 types. |
| **Ukrainian Losses** | `oryx-ua.json` — the Oryx Ukrainian list. 11,881 entries, 11,936 vehicles, 23 categories. |
| **Comparison** | Both Oryx datasets, overlaid on one shared time axis. |
| **Warspotting** | `warspotting.json` — a snapshot of the [WarSpotting](https://ukr.warspotting.net/api/docs/) API, an independent catalogue of documented Russian losses. 23,631 records, 18 types, 707 models. |

The two loss pages are the same dashboard over different data, and each keeps its own
filters — set Quarter + Cumulative on one and the other is unaffected. The URL hash tracks
the section (`#/russia`, `#/ukraine`, `#/comparison`) so refresh and Back work.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # reconciles the parser against both datasets
npm run fetch:warspotting   # snapshots the WarSpotting API (~237 requests, ~7 min)
npm run build    # production bundle in dist/
```

**The repo root holds the canonical data.** `npm run sync:data` copies both JSON files into
`public/` (which is what Vite serves) and runs automatically before `dev`, `build` and
`check`. That is not ceremony: the two copies silently diverged once, leaving the app
serving a stale file while the check script read a different one. Edit the root files.

The JSON is fetched at runtime rather than imported, so the 4.7 MB file never enters the
bundle.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. The workflow runs `npm run build` (whose `prebuild` step
regenerates the gitignored `public/` copies from the datasets at the repo root) and then
`npm run check`, so a deploy fails rather than shipping data that no longer reconciles.

`vite.config.js` sets `base` to the repository path for builds **and for `vite preview`** —
preview reports the same `command` as the dev server, so matching only on `command` leaves
preview serving at `/` while the built HTML asks for `/<repo>/`, and every asset 404s.

A first visit transfers about **1.4 MB gzipped**: the three datasets are 12.3 MB raw but
compress roughly tenfold, which is why they can be loaded up front rather than lazily.

## Sharing a view

Every control writes into the URL, so the address bar always describes what is on screen and
a pasted link reopens it exactly — page, categories, bucket size, cumulative toggle, split
mode, outcome filters and the brushed time window. A **Copy link** button sits in the top bar.

Anything at its default is left out, so an untouched page is just `#/russia` and a link only
carries what differs; `cats=all` stands in for "everything selected" rather than listing 23
names. Categories and outcomes go in by name, not index, so a link keeps meaning if the source
ordering changes. The window is stored as bucket start dates rather than indices, so it still
resolves when the recipient's bucket size differs. Anything unrecognised is ignored and falls
back to the default.

## Exporting a chart

Each single-chart panel has **Copy** and **PNG** buttons. The image is self-contained: the
plot, its heading, the legend with values, and a footer crediting Oryx and Cracken.ai with the
deep link back to that exact view.

The awkward part is colour. Every mark is painted with a CSS custom property
(`stroke="var(--series-1)"` and sixteen others), and custom properties only resolve against the
document that defines them — serialise the SVG out of the page and the export comes back blank.
`src/lib/exportChart.js` therefore reads the token values from the live document and substitutes
them before rasterising. A consequence worth knowing: an export made in dark mode is dark.

The two facet grids are excluded, since each holds 23 separate charts; use the per-category
drill-down, whose chart exports like any other.

## Data sources and attribution

This repository contains data compiled by other people. It is included so the app runs from
a clone; the analysis code is mine, the underlying catalogues are not.

| File | Source | Notes |
|---|---|---|
| `oryx-ru.json`, `oryx-ua.json` | [Oryx](https://www.oryxspioenkop.com/) — *Attack On Europe: Documenting Russian Equipment Losses* and its Ukrainian counterpart | Visually-confirmed losses, compiled by Stijn Mitzer and Joost Oliemans. **Scraped and processed by [Cracken.ai](https://cracken.ai/platform).** The field structure is described below. |
| `warspotting.json` | [WarSpotting](https://ukr.warspotting.net/) via its [public API](https://ukr.warspotting.net/api/docs/) | © 2022-2026 WarSpotting, all rights reserved. Snapshot taken with `npm run fetch:warspotting`, which respects the published rate limit of 10 requests per 10 seconds. |

Both are documented-loss catalogues: they count what has been visually confirmed, which is a
**floor**, not an estimate of true losses. Neither project endorses or is affiliated with this
repository. If you are redistributing this data yourself, check each project's terms first.

## Comparison

One chart with two lines — Russia and Ukraine — summing whichever categories are selected,
with per-side toggles plus the usual bucket, cumulative and outcome controls. Below it, all
23 categories as mini charts with both sides overlaid.

Two implementation details make it correct rather than approximately right:

- **Both cubes are built on one shared bucket axis** (the union of the two date ranges).
  Overlaying series whose axes started at different instants would silently misalign them.
- **Categories are matched by name, never by index.** The two datasets rank their categories
  by their own sizes, so index `3` is not the same category in both.

## About `scripts/generate-ua.mjs`

Before the real Oryx Ukrainian list was wired in, this project used a **seeded synthetic**
stand-in so the second dashboard and the comparison view had something to render. That
generator is still in the repo because it documents the shape the parser expects, and it
deliberately reproduced the real files' quirks — ~29% undated entries, ~2.8% multi-vehicle
rows in Oryx's `(6 and 7, destroyed)` form, and the skewed outcome mix.

**It is no longer used, and running it would overwrite real data**, so it now refuses unless
given `--force`. `scripts/ua-manifest.json` records what it produced and is likewise historic.

## Warspotting, and how far it is compatible

A second, independent source. The API has **no bulk export** — 100 records per page keyed by
id, capped at 10 requests per 10 seconds — so `npm run fetch:warspotting` pages the whole
catalogue once into `warspotting.json` and the app reads that. Nothing calls the API at
runtime. (CORS is not the obstacle it first appears: the API does reflect `Origin` back.)

The snapshot embeds the API's own `/api/stats/russia` totals, which gives an independent
cross-check — `npm run check` confirms all four outcome counts and the record total match
exactly.

| Field | Verdict |
|---|---|
| `date` | **Better than Oryx.** ISO, and present on *every* record — 0 undated, against 29% in the Oryx files. |
| `model` | Maps directly onto `typeName`; 707 models feed the same drill-down. |
| `status` | **Partial.** Four outcomes only. `Damaged and abandoned` and `Damaged and captured` can never occur, so two of our six buckets stay empty. |
| `type` | **Different taxonomy.** 18 types against Oryx's 23 categories, with only 7 names in common. Deliberately *not* translated — `Transport` and `Other` have no honest equivalent. |
| `lost_by` | **Russian losses only**, so this dataset cannot join the Comparison page. |
| — | No evidence link, and no multi-vehicle rows: one record is one vehicle, so `weight` is always 1. |
| `geo` | **New** — 14,532 records (61%) carry coordinates. Oryx has none. Drives the *Where* panel. |
| `nearest_location`, `tags`, `unit` | **New** — 93%, 65% and 20% filled. |

Because the normaliser emits the same record shape as the Oryx files, the entire dashboard —
cube, timeline, drill-down, brush-scoped metrics, small multiples — is reused unchanged. The
only new components are the map and the compatibility panel.

One trap worth recording: in `/api/stats/russia`, the per-type `losses` figure **excludes
damaged**. Tanks reads 3,757 there but the true all-outcomes total is 4,087 = 3,757 + 330
damaged. Every per-type figure on the page reconciles against the API on that basis.

### The map

`LossMap` plots coordinates on an equirectangular projection (`x = lon · cos(meanLat)`) with
the container aspect set from the data range, so the shape is not stretched. No basemap, no
tile requests, no new dependency. Recharts will not draw 14,500 marks smoothly, so it takes a
deterministic stride sample capped at 2,500 and says so in the caption.

## What is on the page

A single toolbar scopes the whole page: time bucket, per-period/cumulative, split by
category or outcome, outcome filters, category presets, and Reset. Below 720px it collapses
behind a **Filters** button.

- **Losses over time** — the dominant panel. One line per selected category, with a
  drag-to-zoom brush. Hovering a legend item emphasises its line; clicking a legend item,
  a line, a category bar or a facet isolates that category across every chart.
- **Metric strip** — vehicles in range, undated, destroyed, captured, categories shown.
- **Losses by category** / **Top equipment types** — ranked bars with values at the bar end.
- **Outcome** / **Monthly composition by outcome** — donut and stacked bars, sharing one
  outcome colour scale.
- **Every category** — 23 small multiples, so the categories outside the main chart stay
  legible. **Clicking one opens the drill-down**: the same timeline again, keyed by
  equipment type instead of category, in an overlay with its own type selector. It opens
  with the dashboard's bucket, cumulative and outcome settings applied and never writes
  back, so closing returns you to exactly the view you left.

### The brush scopes the page

Dragging the timeline's window narrows the metric strip, the timeline's own legend and table,
**Losses by category**, **Top equipment types**, **Outcome**, and the category pills. A pill,
its bar, its share of the ring and the types inside it therefore always count the same
entries, and each of those panels names its window in its caption.

Two panels deliberately do not follow it, because they *are* the time axis: **Monthly
composition by outcome** and the **Every category** facet grid, whose totals label full-range
sparklines. The grid says so in its caption.

One consequence is worth stating plainly: a window can only contain dated entries, so every
windowed figure excludes the undated 27%, even when the window covers the whole axis. The
metric strip reports that count beside the others as *Undated (excluded)*, and the windowed
captions say *dated entries*.

Equipment types are the one figure that cannot come from the cube - it indexes
(category, outcome, bucket), and giving types their own time dimension would cost about
3.8 MB per dataset at week resolution to save roughly 2 ms. They are tallied with a single
filtered pass over the rows instead, which measures at 2.3 ms over 23,117 records. A brush
drag holds 60 fps (median frame gap 16.7 ms, p95 37.9 ms) because the aggregates ride a
`useDeferredValue` snapshot: the brush and the timeline stay live while the panels below
catch up.

Every panel has a **Table** button that swaps the chart for its data table, so no value is
reachable only by hovering.

## How the source data is interpreted

`src/data/normalize.js` holds all of it, as pure functions. `npm run check` runs that exact code
over the JSON and prints the reconciliation.

**Rows can mean more than one vehicle.** Oryx writes multi-vehicle entries as a leading index list,
inconsistently: `(6 and 7, destroyed)`, `154, 155, 156 and 157, destroyed`, `(71 and 72 destroyed)`.
The parser matches the numbers rather than the punctuation and gives each row a `weight`. Everything
in the app sums weight, never row count.

This is verifiable, because each type label carries Oryx's own total for that type (`363 T-72B(1)`),
which is an independent number. Summing weights reproduces it for **557 of 602 types**, against 506
if each row were counted as one vehicle. `T-72B(1)` is the pattern: 353 rows, 10 of which document a
second or third vehicle, totalling exactly the 363 Oryx prints.

**29% of entries have no date.** 6,759 rows carry an empty date, and a handful more are typos
(`.02`, `.33`). They are excluded from every time chart and from nothing else, which is why a
persistent banner states the count — the timeline legitimately totals ~30% below the KPI row.

**544 raw status strings collapse into 6 outcomes.** Matching is by keyword flags, not exact
strings, because the tail contains typos (`damagd`), qualifiers (`damaged on the ground`) and ship
names (`b-237 'rostov-na-donu', damaged beyond economical repair`). Compound outcomes resolve to the
final fate: `captured and later destroyed` counts as Destroyed. Zero rows fall through to `Other`.
`damaged beyond economical repair` is counted as Damaged, the literal reading.

**Dropped fields.** `country` is empty on all 23,117 rows, so there is no country filter.
`type` is split into a name and Oryx's own per-type total (`157 T-62M`).

## Performance

The 23,117 records are aggregated **once at load** into a counting cube
(`src/data/cube.js`): flat `Int32Array`s indexed by (category, status, bucket), about
190 KB, built in ~20 ms. Filtering is then a few thousand integer adds over contiguous
memory instead of re-scanning an object array once per chart per click.

The cube's first dimension is just "a key", not "a category". The dashboard builds one
keyed by category; the drill-down builds one keyed by equipment type from a single
category's rows (`buildTypeCube`), on demand — 1–4 ms even for the 6,253-row categories,
versus pre-aggregating all 602 types up front. Both then share every selector and the
*same* chart component, which is what makes the drill-down behave identically to the main
chart rather than being a parallel implementation that drifts.

Two further rules keep interaction cheap:

- **Every chart panel is `memo`ised and fed stable props.** The 23-panel small-multiples
  grid depends only on the outcome filter, so toggling a category does not re-render it
  at all (verified: zero DOM mutations in that panel during a category toggle).
- **Chart props are deferred** with `useDeferredValue`, as one snapshot rather than two
  values, so redrawing never blocks the click. Controls and the metric strip update
  immediately; the charts follow at lower priority, held at reduced opacity meanwhile.

Measured, category toggle: **740 ms blocking → control responds in ~70 ms**, with the
worst background task down from 555 ms to ~270 ms. The residue is Recharts drawing the
300+ rectangles of the monthly stacked chart; it is off the input path but still the most
expensive panel to redraw.

## Known limits of the source

- Counts are **documented** losses — a floor, not an estimate of true losses.
- `date` is when the evidence was published, which is not always when the vehicle was lost.
- 162 vehicles that Oryx numbers within a type are missing from the scrape entirely, so
  per-type totals here run ~0.7% below the published ones. `npm run check` lists the affected types.
- Data range: 2022-02-21 to 2026-05-22.

## Colour

Six hues in one fixed sequence, used for both category series and outcomes, validated
against the light and dark panel surfaces with the palette checker.

- **The sequence is load-bearing, not cosmetic.** On a white surface orange separates from
  almost nothing — orange/green is ΔE 3.2 under protanopia, orange/amber 13.7 to normal
  vision — so violet sits between orange and amber as a buffer. Reordering the six breaks
  the adjacent-pair checks. Pink and muted red can never be neighbours (ΔE 13.2, below the
  15 floor), which is why violet is in the set and muted red is not.
- **Outcomes render in a fixed order, never sorted by value**, so a filter cannot reshuffle
  the donut ring or the stack into an unvalidated adjacency.
- **Colour follows the entity.** A category takes its hue from its rank in the whole
  dataset, so toggling categories never repaints the survivors. Ranks past the sixth reuse
  a hue with a distinct line style.
- **At most six named series at once.** Extra selections fold into a neutral "Other"; the
  small multiples panel covers the rest. The same cap applies to equipment types in the
  drill-down, where the tail is longer — Engineering Vehicles has 77 types, so its chart
  reads "6 named + Other (71)" and the type selector is how you reach the rest.
- **The style cycle is six hues x six dash patterns = 36 stable slots.** Categories (23)
  never exhaust it. Two of the 77 engineering types whose ranks differ by exactly 36 would
  share a style, but only six series are ever drawn and the legend carries names and
  values, so the relief rule covers it.
- Light-mode amber and pink fall below 3:1 against white. The relief rule applies and is
  satisfied: every panel has value labels or a legend with values, plus a table twin.
