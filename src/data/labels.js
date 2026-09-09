/**
 * Short forms for axis ticks only. Several Oryx category names are long enough that
 * Recharts wraps them onto two lines and neighbouring ticks collide. Chips, tooltips
 * and table views keep the full name.
 */
const SHORT = {
  'Mine-Resistant Ambush Protected (MRAP) Vehicles': 'MRAP Vehicles',
  'Command Posts And Communications Stations': 'Command Posts & Comms',
  'Artillery and Missile Support Vehicles And Equipment': 'Artillery Support Vehicles',
  'Engineering Vehicles And Equipment': 'Engineering Vehicles',
  'Self-Propelled Anti-Tank Missile Systems': 'SP Anti-Tank Missiles',
  'Self-Propelled Anti-Aircraft Guns': 'SP Anti-Aircraft Guns',
  'Unmanned Combat Aerial Vehicles': 'Unmanned Combat Air Veh.',
  'Surface-To-Air Missile Systems': 'SAM Systems',
  'Jammers And Deception Systems': 'Jammers & Deception',
  // Kept distinct from 'Command Posts & Comms' so the two are not confused on an axis.
  'Radars And Communications Equipment': 'Radars & Comms Equip.',
  'Naval Ships and Submarines': 'Naval Ships & Subs',
  'Infantry Fighting Vehicles': 'Infantry Fighting Veh.',
  'Armoured Fighting Vehicles': 'Armoured Fighting Veh.',
  'Armoured Personnel Carriers': 'Armoured Pers. Carriers',
}

export const shortCat = (name) => SHORT[name] || name

/** Truncates anything still too wide for a tick, keeping the tooltip authoritative. */
export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
