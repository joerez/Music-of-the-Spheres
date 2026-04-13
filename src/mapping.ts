/** Map separation in AU to Hz: f = fRef * (dRef / d)^alpha. */
export function distanceToHz(
  dAu: number,
  fRefHz: number,
  dRefAu: number,
  alpha: number,
  invert: boolean,
): number {
  if (dAu <= 0 || !Number.isFinite(dAu)) return fRefHz
  const ratio = dRefAu / dAu
  const f = fRefHz * (invert ? 1 / ratio : ratio) ** alpha
  return f
}

/** Fold log2(f) into [log2(fMin), log2(fMax)] by wrapping modulo band width. */
export function foldOctaves(f: number, fMin: number, fMax: number): number {
  if (f <= 0 || fMin <= 0 || fMax <= fMin || !Number.isFinite(f)) return f
  const lo = Math.log2(fMin)
  const hi = Math.log2(fMax)
  const w = hi - lo
  let lf = Math.log2(f)
  lf = lo + ((((lf - lo) % w) + w) % w)
  return 2 ** lf
}

const JUST_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2] as const

/** Snap f to nearest just ratio × octave relative to drone Hz. */
export function quantizeJust(f: number, droneHz: number): number {
  if (f <= 0 || droneHz <= 0 || !Number.isFinite(f)) return f
  let best = f
  let bestErr = Infinity
  for (let k = -6; k <= 6; k++) {
    const oct = 2 ** k
    for (const r of JUST_RATIOS) {
      const cand = droneHz * r * oct
      const err = Math.abs(Math.log2(cand / f))
      if (err < bestErr) {
        bestErr = err
        best = cand
      }
    }
  }
  return best
}

export function clampHz(f: number, lo = 40, hi = 2000): number {
  if (!Number.isFinite(f)) return lo
  return Math.min(hi, Math.max(lo, f))
}

export function distancesToFrequencies(
  distancesAu: number[],
  options: {
    fRefHz: number
    dRefAu: number
    alpha: number
    invert: boolean
    fold: boolean
    foldMinHz: number
    foldMaxHz: number
    just: boolean
    droneHz: number
    clampLo: number
    clampHi: number
  },
): number[] {
  return distancesAu.map((d) => {
    let f = distanceToHz(d, options.fRefHz, options.dRefAu, options.alpha, options.invert)
    if (options.fold) f = foldOctaves(f, options.foldMinHz, options.foldMaxHz)
    if (options.just) f = quantizeJust(f, options.droneHz)
    return clampHz(f, options.clampLo, options.clampHi)
  })
}
