/**
 * Keplerian heliocentric positions in the J2000 ecliptic frame, mean elements at J2000.0.
 * JD J2000 = 2451545.0 TT. Accurate enough for sonification, not for ephemeris work.
 */
export const JD_J2000 = 2451545.0

export const PLANET_NAMES = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
] as const

export type PlanetIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type OrbitalElements = {
  a: number
  e: number
  i: number
  Omega: number
  omega: number
  M0: number
}

const DEG = Math.PI / 180

/** J2000 mean elements: a (AU), e, angles (rad), M0 = mean anomaly at JD J2000. */
export const ELEMENTS: readonly OrbitalElements[] = [
  { a: 0.38709893, e: 0.20563069, i: 7.00487 * DEG, Omega: 48.33167 * DEG, omega: 77.45645 * DEG, M0: 174.7948 * DEG },
  { a: 0.72333566, e: 0.00677323, i: 3.39467 * DEG, Omega: 76.67992 * DEG, omega: 131.6026 * DEG, M0: 50.4161 * DEG },
  { a: 1.00000261, e: 0.01671123, i: 0.00005 * DEG, Omega: -11.26064 * DEG, omega: 102.94719 * DEG, M0: 357.5291 * DEG },
  { a: 1.52371034, e: 0.0933941, i: 1.85061 * DEG, Omega: 49.55854 * DEG, omega: 336.06084 * DEG, M0: 19.373 * DEG },
  { a: 5.202887, e: 0.04838624, i: 1.3047 * DEG, Omega: 100.4542 * DEG, omega: 14.331307 * DEG, M0: 20.02 * DEG },
  { a: 9.53667594, e: 0.05386179, i: 2.485992 * DEG, Omega: 113.71504 * DEG, omega: 92.43194 * DEG, M0: 317.0207 * DEG },
  { a: 19.18916464, e: 0.04725744, i: 0.772637 * DEG, Omega: 74.22988 * DEG, omega: 170.96424 * DEG, M0: 142.2386 * DEG },
  { a: 30.06992276, e: 0.00859048, i: 1.770043 * DEG, Omega: 131.72169 * DEG, omega: 44.417709 * DEG, M0: 260.2471 * DEG },
]

function periodDays(aAu: number): number {
  return 365.256363004 * aAu ** 1.5
}

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 32; k++) {
    const denom = 1 - e * Math.cos(E)
    if (Math.abs(denom) < 1e-14) break
    const dE = (E - e * Math.sin(E) - M) / denom
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

export function julianDayUtc(date: Date): number {
  const y = date.getUTCFullYear()
  const mo = date.getUTCMonth() + 1
  const d =
    date.getUTCDate() +
    (date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600 +
      date.getUTCMilliseconds() / 3_600_000) /
      24
  let Y = y
  let M = mo
  if (M <= 2) {
    Y -= 1
    M += 12
  }
  const A = Math.floor(Y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5
}

export type Vec3 = { x: number; y: number; z: number }

/** Heliocentric J2000 ecliptic (AU) for arbitrary mean anomaly on the planet’s ellipse. */
export function positionFromMeanAnomaly(el: OrbitalElements, M: number): Vec3 {
  const E = solveKepler(M, el.e)
  const sinE = Math.sin(E)
  const cosE = Math.cos(E)
  const r = el.a * (1 - el.e * cosE)
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * sinE, Math.sqrt(1 - el.e) * cosE)
  const u = el.omega + nu
  const cosu = Math.cos(u)
  const sinu = Math.sin(u)
  const cosO = Math.cos(el.Omega)
  const sinO = Math.sin(el.Omega)
  const cosi = Math.cos(el.i)
  const sini = Math.sin(el.i)

  const x = r * (cosO * cosu - sinO * sinu * cosi)
  const y = r * (sinO * cosu + cosO * sinu * cosi)
  const z = r * sinu * sini
  return { x, y, z }
}

/** Closed polyline (length `segments`) on the planet’s orbital ellipse, J2000 ecliptic AU. */
export function orbitPolylineAu(index: PlanetIndex, segments: number): Vec3[] {
  const el = ELEMENTS[index]!
  const pts: Vec3[] = []
  const n = Math.max(8, segments)
  for (let i = 0; i < n; i++) {
    const M = (i / n) * 2 * Math.PI
    pts.push(positionFromMeanAnomaly(el, M))
  }
  return pts
}

export function planetPositionAu(jd: number, index: PlanetIndex): Vec3 {
  const el = ELEMENTS[index]!
  const daysSince = jd - JD_J2000
  const T = periodDays(el.a)
  const n = (2 * Math.PI) / T
  let M = el.M0 + n * daysSince
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return positionFromMeanAnomaly(el, M)
}

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export const ADJACENT_PAIR_LABELS = [
  'Mercury–Venus',
  'Venus–Earth',
  'Earth–Mars',
  'Mars–Jupiter',
  'Jupiter–Saturn',
  'Saturn–Uranus',
  'Uranus–Neptune',
] as const

export type SonifyMode = 'adjacent' | 'heliocentric'

export function distancesAu(jd: number, mode: SonifyMode): number[] {
  const pos = PLANET_NAMES.map((_, i) => planetPositionAu(jd, i as PlanetIndex))
  if (mode === 'heliocentric') {
    return pos.map((p) => dist(p, { x: 0, y: 0, z: 0 }))
  }
  const out: number[] = []
  for (let i = 0; i < pos.length - 1; i++) {
    out.push(dist(pos[i]!, pos[i + 1]!))
  }
  return out
}
