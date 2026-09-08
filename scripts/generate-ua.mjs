/**
 * Generates oryx-ua.json — synthetic Ukrainian loss data in the exact schema of the real
 * Oryx scrape. Run: npm run gen:ua
 *
 * Deterministic (seeded LCG, no dependencies), so regenerating produces an identical file
 * and the numbers in the app are stable. It also writes scripts/ua-manifest.json holding
 * the ground truth it intended to produce; `npm run check` then verifies that parsing the
 * file back reproduces those totals exactly.
 *
 * That manifest matters: the real file used to carry Oryx's own per-type totals in the
 * `type` field ("11 T-55A"), which gave an independent cross-check on the multi-vehicle
 * weight logic. That field has since been stripped, so this is the replacement.
 *
 * The quirks of the real data are reproduced on purpose, because they are what exercise
 * the parser: ~29% of entries carry no date, ~2.8% document two or more vehicles in one
 * entry using Oryx's "(6 and 7, destroyed)" form, and the outcome mix is heavily skewed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')

// oryx-ua.json holds the REAL Oryx Ukrainian list. This script writes synthetic sample
// data and was only needed before that list was available, so overwriting would destroy
// real data. Require an explicit --force.
const TARGET = path.join(ROOT, 'oryx-ua.json')
if (fs.existsSync(TARGET) && !process.argv.includes('--force')) {
  console.error(
    'refusing to overwrite oryx-ua.json - it holds the real Oryx Ukrainian dataset.' + 
      String.fromCharCode(10) + 'Re-run with --force if you really mean to replace it with synthetic data.',
  )
  process.exit(1)
}

/* ----------------------------------------------------------------- randomness -- */
let seed = 0x5eed1917
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))

/* ------------------------------------------------------------------- shape ---- */
// Outcome mix mirrors the real file: 79.0 / 10.9 / 4.2 / 3.1 / 1.9 / 1.0.
const OUTCOMES = [
  ['destroyed', 0.79],
  ['captured', 0.109],
  ['damaged', 0.042],
  ['damaged and abandoned', 0.031],
  ['abandoned', 0.019],
  ['damaged and captured', 0.01],
]
const outcome = () => {
  let r = rnd()
  for (const [name, p] of OUTCOMES) {
    if ((r -= p) <= 0) return name
  }
  return 'destroyed'
}

const UNDATED_RATE = 0.292 // real file: 29.2%
const MULTI_RATE = 0.028 // real file: 2.81% of entries document 2+ vehicles

// Losses ramp up through 2022-2023, peak in 2024, taper through 2025-26 - the same broad
// shape as the real series, so the comparison page shows two plausible curves.
const MONTHS = []
for (let y = 2022, m = 1; y < 2026 || (y === 2026 && m <= 5); m++) {
  if (m > 12) {
    m = 1
    y++
  }
  if (y === 2022 && m < 2) continue
  MONTHS.push([y, m])
}
const monthWeight = (i) => {
  const t = i / (MONTHS.length - 1)
  return 0.35 + 2.6 * Math.exp(-Math.pow((t - 0.55) / 0.3, 2)) + 0.5 * Math.sin(i / 3.1)
}

/**
 * Ukrainian inventory: Soviet-legacy plus Western donations. Weights are relative shares
 * within a category. The category totals below deliberately differ in mix from the Russian
 * file - proportionally more towed artillery and APCs (donated), fewer tanks.
 */
const CATALOGUE = {
  'Infantry Fighting Vehicles': [1580, [
    ['BMP-2', 34], ['BMP-1', 22], ['BMP-1AK', 6], ['M2A2 Bradley ODS-SA', 11], ['CV9040C', 5],
    ['BMD-2', 4], ['Marder 1A3', 5], ['BMP-2K', 4], ['YPR-765 PRI', 4], ['Unknown BMP', 5],
  ]],
  Tanks: [980, [
    ['T-64BV', 41], ['T-72AMT', 12], ['T-80BV', 10], ['T-64BM Bulat', 6], ['Leopard 2A4', 6],
    ['Leopard 2A6', 3], ['T-72AV', 5], ['Challenger 2', 1], ['T-64BV Obr. 2017', 8],
    ['M-55S', 3], ['PT-91 Twardy', 3], ['Unknown T-64', 2],
  ]],
  'Trucks and similar vehicles': [1120, [
    ['KrAZ-6322', 18], ['Ural-4320', 16], ['GAZ-66', 12], ['KamAZ 6x6', 10], ['ZIL-131', 9],
    ['MAN KAT1', 8], ['Iveco Daily', 6], ['Ford Ranger', 7], ['(Unknown) truck', 14],
  ]],
  'Armoured Fighting Vehicles': [560, [
    ['MT-LB', 38], ['BRDM-2', 14], ['BRM-1K', 9], ['MT-LBu', 8], ['BTR-D', 6],
    ['Bushmaster PMV', 7], ['Unknown AFV', 18],
  ]],
  'Armoured Personnel Carriers': [430, [
    ['BTR-80', 22], ['M113A2', 24], ['BTR-70', 14], ['YPR-765', 10], ['BTR-4E', 12],
    ['M577', 6], ['Saxon AT105', 5], ['MT-LB APC', 7],
  ]],
  'Towed Artillery': [395, [
    ['122mm D-30 howitzer', 27], ['152mm 2A65 Msta-B', 14], ['155mm M777', 18],
    ['155mm FH70', 9], ['155mm TRF1', 5], ['152mm D-20', 12], ['105mm L119', 8],
    ['155mm M101', 7],
  ]],
  'Self-Propelled Artillery': [340, [
    ['122mm 2S1 Gvozdika', 30], ['152mm 2S3 Akatsiya', 20], ['155mm PzH 2000', 10],
    ['155mm CAESAR', 9], ['152mm 2S19 Msta-S', 8], ['155mm AHS Krab', 9],
    ['155mm M109A3', 8], ['203mm 2S7 Pion', 6],
  ]],
  'Engineering Vehicles And Equipment': [225, [
    ['MT-LB engineering variant', 16], ['BREM-1', 14], ['IMR-2', 9], ['MTU-20 bridge layer', 8],
    ['UR-77 mine clearing vehicle', 10], ['BAT-2', 7], ['PTS-2 amphibious transport', 9],
    ['Wisent 1 ARV', 6], ['Unknown engineering vehicle', 21],
  ]],
  'Infantry Mobility Vehicles': [265, [
    ['HMMWV', 30], ['Kozak-2', 14], ['Novator', 10], ['Senator APC', 9], ['Varta', 8],
    ['Bushmaster', 7], ['Roshel Senator', 12], ['Dozor-B', 10],
  ]],
  'Rocket and Missile Artillery': [190, [
    ['122mm BM-21 Grad', 44], ['220mm BM-27 Uragan', 16], ['300mm BM-30 Smerch', 8],
    ['M142 HIMARS', 6], ['M270 MLRS', 5], ['122mm RM-70', 12], ['Bureviy MLRS', 9],
  ]],
  'Surface-To-Air Missile Systems': [175, [
    ['9K33 Osa', 26], ['Buk-M1', 20], ['S-300PS', 14], ['9K35 Strela-10', 16],
    ['NASAMS', 6], ['IRIS-T SLM', 5], ['S-125 Neva', 13],
  ]],
  'Mine-Resistant Ambush Protected (MRAP) Vehicles': [150, [
    ['MaxxPro', 34], ['Cougar', 14], ['Kirpi', 16], ['Mastiff', 10], ['Wolfhound', 8],
    ['Panthera T6', 9], ['Otokar Cobra', 9],
  ]],
  'Command Posts And Communications Stations': [120, [
    ['R-142NM command post', 22], ['MT-LBu command vehicle', 20], ['R-149MA1', 14],
    ['BTR-70 command variant', 12], ['Unknown command post', 32],
  ]],
  'Artillery and Missile Support Vehicles And Equipment': [95, [
    ['1V13 artillery command vehicle', 24], ['PRP-4 artillery observation vehicle', 20],
    ['9T452 transporter-loader', 18], ['SNAR-10 battlefield radar', 16],
    ['Unknown support vehicle', 22],
  ]],
  Aircraft: [88, [
    ['MiG-29', 34], ['Su-25', 26], ['Su-27', 16], ['Su-24M', 14], ['L-39 Albatros', 6],
    ['F-16AM', 4],
  ]],
  Helicopters: [72, [
    ['Mi-8', 40], ['Mi-24', 30], ['Mi-2', 12], ['Mi-14', 8], ['Mi-17', 10],
  ]],
  Radars: [64, [
    ['P-18 radar', 24], ['36D6 radar', 20], ['AN/TPQ-36 counter-battery radar', 16],
    ['1L219 Zoopark-1', 14], ['79K6 Pelikan', 12], ['Unknown radar', 14],
  ]],
  'Anti-Aircraft Guns': [48, [
    ['ZU-23-2', 46], ['S-60 57mm', 20], ['ZU-23 on truck', 22], ['Bofors L70', 12],
  ]],
  'Self-Propelled Anti-Aircraft Guns': [36, [
    ['ZSU-23-4 Shilka', 52], ['Gepard', 30], ['2K22 Tunguska', 18],
  ]],
  'Jammers And Deception Systems': [42, [
    ['Bukovel-AD jammer', 34], ['R-330Zh Zhitel', 22], ['Anklav-N', 20],
    ['Unknown jammer', 24],
  ]],
  'Self-Propelled Anti-Tank Missile Systems': [30, [
    ['9P149 Shturm-S', 42], ['9P148 Konkurs', 34], ['BRDM-2 with Malyutka', 24],
  ]],
  'Unmanned Combat Aerial Vehicles': [58, [
    ['Bayraktar TB2', 48], ['Leleka-100', 22], ['PD-2', 16], ['Furia', 14],
  ]],
  'Naval Ships and Submarines': [16, [
    ['Gyurza-M class gunboat', 32], ['Matka class missile boat', 20],
    ['Zhuk class patrol boat', 24], ['Polnocny class landing ship', 24],
  ]],
}

/* ------------------------------------------------------------------- build ---- */
const IMG_HOSTS = ['https://postimg.cc/', 'https://i.postimg.cc/', 'https://x.com/i/status/']
const token = (n) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < n; i++) out += chars[Math.floor(rnd() * chars.length)]
  return out
}
const imgUrl = () => {
  const host = pick(IMG_HOSTS)
  return host.includes('x.com') ? host + String(int(1500000000000000000, 1899999999999999999)) : host + token(8)
}
const dd = (n) => String(n).padStart(2, '0')

const Losses = {}
const manifest = { entries: 0, vehicles: 0, byCategory: {}, byOutcome: {}, undated: 0, multiRows: 0 }

for (const [cat, [targetVehicles, mix]] of Object.entries(CATALOGUE)) {
  const mixTotal = mix.reduce((a, [, w]) => a + w, 0)
  const entries = []
  let vehicles = 0
  let idx = 0 // running vehicle index within the category, for the "(6 and 7, ...)" form

  for (const [typeName, share] of mix) {
    const want = Math.max(1, Math.round((targetVehicles * share) / mixTotal))
    let made = 0
    while (made < want) {
      // A minority of entries document several vehicles at once.
      const multi = rnd() < MULTI_RATE && want - made >= 2 ? (rnd() < 0.85 ? 2 : 3) : 1
      const base = outcome()
      const indices = []
      for (let i = 0; i < multi; i++) indices.push(++idx)
      const status =
        multi === 1
          ? base
          : `(${indices.slice(0, -1).join(', ')} and ${indices.at(-1)}, ${base})`

      let date = ''
      if (rnd() >= UNDATED_RATE) {
        // Weighted month choice, then a day inside it.
        const weights = MONTHS.map((_, i) => monthWeight(i))
        const totalW = weights.reduce((a, b) => a + b, 0)
        let r = rnd() * totalW
        let mi = 0
        while (mi < weights.length - 1 && (r -= weights[mi]) > 0) mi++
        const [y, m] = MONTHS[mi]
        const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
        date = `${dd(int(1, maxDay))}.${dd(m)}.${String(y).slice(2)}`
      }

      entries.push({
        id: entries.length + 1,
        status,
        type: typeName,
        country: '',
        img: imgUrl(),
        date,
      })
      made += multi
      vehicles += multi
      manifest.byOutcome[base] = (manifest.byOutcome[base] || 0) + multi
      if (!date) manifest.undated += 1
      if (multi > 1) manifest.multiRows += 1
    }
  }

  Losses[cat] = entries
  manifest.byCategory[cat] = vehicles
  manifest.entries += entries.length
  manifest.vehicles += vehicles
}

// Order categories largest-first, matching how the real file reads.
const ordered = Object.fromEntries(
  Object.entries(Losses).sort((a, b) => manifest.byCategory[b[0]] - manifest.byCategory[a[0]]),
)

fs.writeFileSync(path.join(ROOT, 'oryx-ua.json'), JSON.stringify({ Losses: ordered }, null, 2))
fs.writeFileSync(path.join(HERE, 'ua-manifest.json'), JSON.stringify(manifest, null, 2))

console.log('oryx-ua.json written')
console.log('  entries        ', manifest.entries)
console.log('  vehicles       ', manifest.vehicles)
console.log('  categories     ', Object.keys(ordered).length)
console.log('  types          ', new Set(Object.values(ordered).flat().map((e) => e.type)).size)
console.log('  undated        ', manifest.undated, `(${((100 * manifest.undated) / manifest.entries).toFixed(1)}%)`)
console.log('  multi-veh rows ', manifest.multiRows, `(${((100 * manifest.multiRows) / manifest.entries).toFixed(2)}%)`)
console.log('  outcome mix    ', Object.entries(manifest.byOutcome).map(([k, v]) => `${k} ${((100 * v) / manifest.vehicles).toFixed(1)}%`).join(', '))
