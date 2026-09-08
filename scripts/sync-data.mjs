/**
 * Copies the canonical datasets at the repo root into public/, which is what Vite serves.
 * Wired to predev / prebuild / precheck so the two can never drift again - they already
 * did once, leaving the app serving a stale file for hours.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['oryx-ru.json', 'oryx-ua.json', 'warspotting.json']

fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true })
for (const f of FILES) {
  const src = path.join(ROOT, f)
  if (!fs.existsSync(src)) {
    console.warn(`sync-data: ${f} missing at root, skipped`)
    continue
  }
  const dest = path.join(ROOT, 'public', f)
  const a = fs.readFileSync(src)
  const same = fs.existsSync(dest) && Buffer.compare(a, fs.readFileSync(dest)) === 0
  if (!same) {
    fs.writeFileSync(dest, a)
    console.log(`sync-data: ${f} -> public/ (${(a.length / 1048576).toFixed(1)} MB)`)
  }
}
