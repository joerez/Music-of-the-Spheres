import './style.css'
import { SphereAudio } from './audio.ts'
import { distancesToFrequencies } from './mapping.ts'
import { createSolarVis } from './solar-vis.ts'
import { drawChordStaff } from './staff-canvas.ts'
import {
  ADJACENT_PAIR_LABELS,
  JD_J2000,
  julianDayUtc,
  distancesAu,
  type SonifyMode,
} from './orbits.ts'

const audio = new SphereAudio()

/** JD (UT) to ISO string via Unix epoch; JD 2440587.5 = 1970-01-01T00:00:00.000Z. */
function jdToIsoUtc(jd: number): string {
  const JD_UNIX = 2440587.5
  const ms = (jd - JD_UNIX) * 86_400_000
  return new Date(ms).toISOString()
}

type RangePreset = 'century' | 'neptune' | 'millennium'

const RANGE_SPAN_DAYS: Record<RangePreset, number> = {
  century: 365.25 * 100,
  neptune: 365.25 * 165,
  millennium: 365.25 * 2000,
}

type AppState = {
  centerJd: number
  rangePreset: RangePreset
  mode: SonifyMode
  fold: boolean
  just: boolean
  invert: boolean
  alpha: number
  fRefHz: number
  dRefAu: number
  foldMinHz: number
  foldMaxHz: number
  droneHz: number
  muted: boolean[]
  /** When false, Web Audio stays silent (toggle with the sound button). */
  soundOn: boolean
  playing: boolean
  playDir: 1 | -1
  daysPerSecond: number
  timeline: number
  masterLinear: number
}

/** Preset labels for the days-per-second dropdown (value = stringified number). */
const DAYS_PER_SEC_PRESETS: { label: string; value: number }[] = [
  { label: '1 day / second', value: 1 },
  { label: '1 week / second', value: 7 },
  { label: '~1 month / second', value: 30.4375 },
  { label: '1 year / second', value: 365.25 },
  { label: '10 years / second', value: 3652.5 },
  { label: '100 years / second', value: 36525 },
]

function nearestPresetValue(dps: number): string {
  const eps = 1e-3
  for (const p of DAYS_PER_SEC_PRESETS) {
    if (Math.abs(p.value - dps) < eps) return String(p.value)
  }
  return ''
}

function syncSpeedSelect(sel: HTMLSelectElement, dps: number): void {
  sel.value = nearestPresetValue(dps)
}

function jdRange(state: AppState): { min: number; max: number } {
  const half = RANGE_SPAN_DAYS[state.rangePreset] / 2
  return { min: state.centerJd - half, max: state.centerJd + half }
}

function currentJd(state: AppState): number {
  const { min, max } = jdRange(state)
  return min + state.timeline * (max - min)
}

function voiceLabelsForMode(mode: SonifyMode): string[] {
  return mode === 'adjacent'
    ? [...ADJACENT_PAIR_LABELS]
    : ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']
}

/**
 * Rebuild voice rows only when mode or count changes so checkboxes are not destroyed every frame.
 */
function ensureVoiceRows(root: HTMLElement, state: AppState): void {
  const labels = voiceLabelsForMode(state.mode)
  const n = labels.length
  const key = `${state.mode}:${n}`
  if (root.dataset.voiceKey === key && root.querySelectorAll('.voice-row').length === n) {
    return
  }
  root.dataset.voiceKey = key
  root.innerHTML = ''
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div')
    row.className = 'voice-row'
    row.dataset.voiceIdx = String(i)
    const lab = document.createElement('label')
    lab.className = 'voice-label'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !state.muted[i]
    cb.addEventListener('change', () => {
      const idx = Number(row.dataset.voiceIdx)
      if (Number.isFinite(idx)) {
        state.muted[idx] = !cb.checked
        syncAudio(state)
      }
    })
    lab.appendChild(cb)
    lab.appendChild(document.createTextNode(` ${labels[i]}`))
    const meta = document.createElement('span')
    meta.className = 'voice-meta'
    row.appendChild(lab)
    row.appendChild(meta)
    root.appendChild(row)
  }
}

function updateVoiceMetas(root: HTMLElement, dists: number[], freqs: number[]): void {
  const rows = root.querySelectorAll('.voice-row')
  rows.forEach((row, i) => {
    const meta = row.querySelector('.voice-meta')
    if (!meta) return
    const d = dists[i] ?? 0
    const f = freqs[i] ?? 0
    meta.textContent = `${d.toFixed(4)} AU · ${f.toFixed(1)} Hz`
  })
}

function syncAudio(state: AppState): void {
  if (!state.soundOn) return
  const jd = currentJd(state)
  const dists = distancesAu(jd, state.mode)
  const freqs = distancesToFrequencies(dists, {
    fRefHz: state.fRefHz,
    dRefAu: state.dRefAu,
    alpha: state.alpha,
    invert: state.invert,
    fold: state.fold,
    foldMinHz: state.foldMinHz,
    foldMaxHz: state.foldMaxHz,
    just: state.just,
    droneHz: state.droneHz,
    clampLo: 40,
    clampHi: 2000,
  })
  audio.setVoiceCount(dists.length)
  audio.setMasterLinear(state.masterLinear)
  audio.updateFrequencies(freqs, state.muted)
}

function mount(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const nowJd = julianDayUtc(new Date())
  const initial: AppState = {
    centerJd: JD_J2000,
    rangePreset: 'neptune',
    mode: 'heliocentric',
    fold: true,
    just: true,
    invert: false,
    alpha: 1,
    fRefHz: 220,
    dRefAu: 1,
    foldMinHz: 100,
    foldMaxHz: 800,
    droneHz: 110,
    muted: Array.from({ length: 8 }, () => false),
    soundOn: false,
    playing: false,
    playDir: 1,
    daysPerSecond: 30.4375,
    timeline: 0.5,
    masterLinear: 0.2,
  }
  const state = initial

  app.innerHTML = `
    <div class="app">
      <header class="header">
        <h1>Music of the sphere</h1>
        <p class="tagline">Interactive distance sonification (modern mapping, not Kepler’s angular-speed harmony).</p>
      </header>

      <section class="panel viz-panel">
        <div class="viz-head">
          <h2>Solar system</h2>
          <p class="viz-hint">Drag to orbit · scroll to zoom · time playback moves the planets · Sun and planet sizes are symbolic (not to scale)</p>
        </div>
        <div id="solar-viz" class="viz-host" aria-label="Three.js solar system view"></div>
      </section>

      <section class="panel controls">
        <div class="row">
          <button type="button" id="btn-audio" class="primary">Sound on</button>
          <label class="inline">Master <input type="range" id="rng-master" min="0" max="1" step="0.01" value="0.2" /></label>
        </div>
        <div class="row">
          <label>Time <input type="range" id="rng-time" min="0" max="1" step="0.0001" value="0.5" class="grow" /></label>
        </div>
        <p class="mono date-readout" id="date-out"></p>
        <div class="row wrap">
          <span>Range:</span>
          <label><input type="radio" name="range" value="century" /> ±50 yr (100 yr)</label>
          <label><input type="radio" name="range" value="neptune" checked /> ±82.5 yr (~Neptune)</label>
          <label><input type="radio" name="range" value="millennium" /> ±1000 yr</label>
        </div>
        <div class="row wrap">
          <span>Center on:</span>
          <button type="button" id="btn-j2000">J2000</button>
          <button type="button" id="btn-now">Now</button>
        </div>
        <div class="row wrap">
          <span>Mode:</span>
          <label><input type="radio" name="mode" value="adjacent" /> Adjacent pairs</label>
          <label><input type="radio" name="mode" value="heliocentric" checked /> Heliocentric radius</label>
        </div>
        <div class="row wrap">
          <label class="inline full-row">
            <input type="checkbox" id="chk-autostart-time" checked />
            Auto-run time on load (independent of sound—you can watch the orbits in silence)
          </label>
        </div>
        <div class="row wrap playback-row">
          <button type="button" id="btn-play">Pause</button>
          <button type="button" id="btn-rev">Reverse direction</button>
          <label class="inline">
            Preset
            <select id="sel-dps" class="select-dps">
              <option value="">Custom</option>
              ${DAYS_PER_SEC_PRESETS.map(
                (p) => `<option value="${p.value}">${p.label}</option>`,
              ).join('')}
            </select>
          </label>
          <label class="inline">
            Days per second
            <input type="number" id="inp-speed" value="30.4375" step="any" min="0.001" class="num-wide" title="Simulation calendar days advanced per real-time second while playing" />
          </label>
        </div>
        <p class="control-hint">
          While playing, the time slider moves by itself: <strong>days per second</strong> sets how fast simulated time runs.
          When the slider reaches the end of your chosen range, it wraps to the start so playback can continue.
        </p>
        <div class="row wrap">
          <label><input type="checkbox" id="chk-fold" checked /> Fold octaves (100–800 Hz band)</label>
          <label><input type="checkbox" id="chk-just" checked /> Quantize to just ratios (vs drone)</label>
          <label><input type="checkbox" id="chk-invert" /> Invert mapping (wide → high pitch)</label>
        </div>
        <div class="row wrap knobs">
          <label>α <input type="range" id="rng-alpha" min="0.2" max="1.5" step="0.05" value="1" /></label>
          <label>f_ref Hz <input type="number" id="inp-fref" value="220" step="1" class="num-sm" /></label>
          <label>d_ref AU <input type="number" id="inp-dref" value="1" step="0.01" class="num-sm" /></label>
          <label>Drone Hz <input type="number" id="inp-drone" value="110" step="1" class="num-sm" /></label>
        </div>
      </section>

      <section class="panel staff-panel">
        <h2>Staff view</h2>
        <p class="staff-lede">
          The <strong>five horizontal rules are fixed</strong> (treble E4–F5). Noteheads use <strong>continuous</strong> pitch, so they can sit between lines.
          Short <strong>ledger lines</strong> appear per note only when the pitch is above or below that staff. Labels are in columns so they do not overlap.
        </p>
        <canvas id="staff-canvas" class="staff-canvas" width="720" height="320" aria-label="Staff notation for current frequencies"></canvas>
      </section>

      <section class="panel">
        <h2>Voices</h2>
        <div id="voices"></div>
      </section>

      <section class="panel help">
        <button type="button" class="linklike" id="btn-help-toggle" aria-expanded="false">What is this? (simple + history)</button>
        <div id="help-body" hidden>
          <details class="help-details" open>
            <summary>Simple explanation</summary>
            <div class="help-inner">
              <p>
                This page is a <strong>toy universe</strong>: it computes where the eight planets are on chosen dates, using simplified
                textbook orbits. It turns those positions into <strong>pitches</strong> so you can <em>hear</em> how distances change as time moves.
              </p>
              <p>
                <strong>Closer in space → higher note</strong> (by default): when two planets are near each other, or when a planet is closer to the Sun,
                the mapped frequency goes up. You can flip that with “invert” if you prefer the opposite mood.
              </p>
              <p>
                The <strong>3D view</strong> is only a picture: the Sun is drawn much smaller than it would be at this scale, otherwise Mercury and Venus
                would sit inside the Sun’s disc. Planet sizes are exaggerated too, so you can see them.
              </p>
              <p>
                <strong>Time playback:</strong> pick how many <em>simulated days</em> pass per <em>real</em> second. The time slider then moves on its own
                (press Pause to stop). Sound is optional—use “Enable sound” when you want to listen.
              </p>
            </div>
          </details>
          <details class="help-details">
            <summary>History, other methods, and what this project actually does</summary>
            <div class="help-inner">
              <p>
                <strong>“Music of the spheres” in antiquity and the Middle Ages</strong> was largely a metaphor: Pythagorean tradition linked
                pleasing musical intervals to simple whole-number <strong>ratios</strong> (for example 2:1 octave, 3:2 fifth). Some thinkers imagined
                the cosmos as layered with similar proportion. That is philosophy and numerology more than a literal speaker-in-the-sky.
              </p>
              <p>
                <strong>Kepler (1619, <em>Harmonices Mundi</em>)</strong> tried to make the idea physical. He found that raw <strong>spatial separations</strong>
                did not line up cleanly with musical intervals, but aspects of <strong>motion</strong> did: he compared how fast planets sweep along their
                ellipses (angular speed near perihelion vs aphelion) to small melodic steps, and he connected period relationships to his third law.
                So the serious historical “harmony” story is about <strong>motion and periods</strong>, not “each planet’s distance is a note on a keyboard.”
              </p>
              <p>
                <strong>Modern sonification</strong> can map almost any data to pitch, loudness, or timbre: stock prices, weather, particle detectors.
                There is no single correct mapping. Choices are aesthetic and pedagogical: what do you want a listener to notice?
              </p>
              <p>
                <strong>This project’s method (on purpose)</strong> is a <em>distance sonification</em>: at each instant we take either
                <strong>adjacent-planet separations</strong> or <strong>Sun–planet radii</strong> in astronomical units, then map them through
                <code>f = f_ref × (d_ref / d)<sup>α</sup></code> (optionally inverted, folded into an octave band, or snapped to just-intoned ratios
                against a drone). That is <strong>not</strong> a reproduction of Kepler’s angular-speed music; it is a separate experiment in
                “what if separations were pitch?”
              </p>
              <p>
                <strong>Physics fidelity:</strong> positions come from <strong>J2000 mean orbital elements</strong> and a two-body Kepler solver—fine for
                intuition and art, not for spacecraft navigation. Relativity, mutual perturbations, and precise ephemerides (JPL DE440, etc.) are not used.
              </p>
              <p>
                <strong>Graphics:</strong> Three.js shows the same Keplerian positions in a scaled 3D scene with <strong>OrbitControls</strong> (camera orbit,
                not planetary orbits). Orbit rings are ideal ellipses from those elements; planets still move on those ellipses as time changes.
              </p>
              <p class="mono small">Disclaimer: educational demo; not for scientific or navigational use.</p>
            </div>
          </details>
        </div>
      </section>
    </div>
  `

  const elTime = app.querySelector<HTMLInputElement>('#rng-time')!
  const elDate = app.querySelector<HTMLElement>('#date-out')!
  const elVoices = app.querySelector<HTMLElement>('#voices')!
  const elBtnAudio = app.querySelector<HTMLButtonElement>('#btn-audio')!
  const elMaster = app.querySelector<HTMLInputElement>('#rng-master')!
  const elHelpToggle = app.querySelector<HTMLButtonElement>('#btn-help-toggle')!
  const elHelpBody = app.querySelector<HTMLDivElement>('#help-body')!
  const elPlay = app.querySelector<HTMLButtonElement>('#btn-play')!
  const elRev = app.querySelector<HTMLButtonElement>('#btn-rev')!
  const elSpeed = app.querySelector<HTMLInputElement>('#inp-speed')!
  const elSelDps = app.querySelector<HTMLSelectElement>('#sel-dps')!
  const elAutoTime = app.querySelector<HTMLInputElement>('#chk-autostart-time')!
  const elViz = app.querySelector<HTMLElement>('#solar-viz')!
  const elStaff = app.querySelector<HTMLCanvasElement>('#staff-canvas')!
  createSolarVis(elViz, () => currentJd(state))

  state.playing = elAutoTime.checked
  elPlay.textContent = state.playing ? 'Pause' : 'Play'
  syncSpeedSelect(elSelDps, state.daysPerSecond)

  function refreshReadout(): void {
    const jd = currentJd(state)
    elDate.textContent = `JD ${jd.toFixed(4)} · ${jdToIsoUtc(jd)}`
    const dists = distancesAu(jd, state.mode)
    const freqs = distancesToFrequencies(dists, {
      fRefHz: state.fRefHz,
      dRefAu: state.dRefAu,
      alpha: state.alpha,
      invert: state.invert,
      fold: state.fold,
      foldMinHz: state.foldMinHz,
      foldMaxHz: state.foldMaxHz,
      just: state.just,
      droneHz: state.droneHz,
      clampLo: 40,
      clampHi: 2000,
    })
    ensureVoiceRows(elVoices, state)
    updateVoiceMetas(elVoices, dists, freqs)
    syncAudio(state)

    const staffLabels = voiceLabelsForMode(state.mode)
    drawChordStaff(
      elStaff,
      staffLabels.map((label, i) => ({
        label,
        freqHz: freqs[i] ?? 0,
        muted: state.muted[i] ?? false,
      })),
    )
  }

  elTime.addEventListener('input', () => {
    state.timeline = Number(elTime.value)
    refreshReadout()
  })

  app.querySelectorAll<HTMLInputElement>('input[name="range"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return
      state.rangePreset = r.value as RangePreset
      refreshReadout()
    })
  })

  app.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return
      state.mode = r.value as SonifyMode
      refreshReadout()
    })
  })

  app.querySelector<HTMLButtonElement>('#btn-j2000')!.addEventListener('click', () => {
    state.centerJd = JD_J2000
    refreshReadout()
  })
  app.querySelector<HTMLButtonElement>('#btn-now')!.addEventListener('click', () => {
    state.centerJd = nowJd
    refreshReadout()
  })

  elBtnAudio.addEventListener('click', async () => {
    if (state.soundOn) {
      state.soundOn = false
      audio.silenceAll()
      elBtnAudio.textContent = 'Sound on'
      return
    }
    await audio.ensureRunning()
    state.soundOn = true
    elBtnAudio.textContent = 'Sound off'
    refreshReadout()
  })

  elMaster.addEventListener('input', () => {
    state.masterLinear = Number(elMaster.value)
    audio.setMasterLinear(state.masterLinear)
  })

  app.querySelector<HTMLInputElement>('#chk-fold')!.addEventListener('change', (e) => {
    state.fold = (e.target as HTMLInputElement).checked
    refreshReadout()
  })
  app.querySelector<HTMLInputElement>('#chk-just')!.addEventListener('change', (e) => {
    state.just = (e.target as HTMLInputElement).checked
    refreshReadout()
  })
  app.querySelector<HTMLInputElement>('#chk-invert')!.addEventListener('change', (e) => {
    state.invert = (e.target as HTMLInputElement).checked
    refreshReadout()
  })

  app.querySelector<HTMLInputElement>('#rng-alpha')!.addEventListener('input', (e) => {
    state.alpha = Number((e.target as HTMLInputElement).value)
    refreshReadout()
  })
  app.querySelector<HTMLInputElement>('#inp-fref')!.addEventListener('input', (e) => {
    state.fRefHz = Number((e.target as HTMLInputElement).value) || 220
    refreshReadout()
  })
  app.querySelector<HTMLInputElement>('#inp-dref')!.addEventListener('input', (e) => {
    state.dRefAu = Number((e.target as HTMLInputElement).value) || 1
    refreshReadout()
  })
  app.querySelector<HTMLInputElement>('#inp-drone')!.addEventListener('input', (e) => {
    state.droneHz = Number((e.target as HTMLInputElement).value) || 110
    refreshReadout()
  })

  elHelpToggle.addEventListener('click', () => {
    const open = elHelpBody.hidden
    elHelpBody.hidden = !open
    elHelpToggle.setAttribute('aria-expanded', String(open))
  })

  let raf = 0
  let lastT = 0
  const tick = (tMs: number) => {
    if (!state.playing) return
    if (lastT === 0) lastT = tMs
    const dt = (tMs - lastT) / 1000
    lastT = tMs
    const { min, max } = jdRange(state)
    const span = max - min
    const delta = (state.daysPerSecond * state.playDir * dt) / span
    state.timeline += delta
    while (state.timeline > 1) state.timeline -= 1
    while (state.timeline < 0) state.timeline += 1
    elTime.value = String(state.timeline)
    refreshReadout()
    raf = requestAnimationFrame(tick)
  }

  elPlay.addEventListener('click', () => {
    state.playing = !state.playing
    elPlay.textContent = state.playing ? 'Pause' : 'Play'
    if (state.playing) {
      lastT = 0
      raf = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(raf)
      lastT = 0
    }
  })

  elSelDps.addEventListener('change', () => {
    const v = elSelDps.value
    if (v === '') return
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return
    state.daysPerSecond = n
    elSpeed.value = String(n)
  })

  elRev.addEventListener('click', () => {
    state.playDir = state.playDir === 1 ? -1 : 1
  })

  elSpeed.addEventListener('input', () => {
    const n = Number(elSpeed.value)
    state.daysPerSecond = Number.isFinite(n) && n > 0 ? n : 30.4375
    syncSpeedSelect(elSelDps, state.daysPerSecond)
  })

  elTime.value = String(state.timeline)
  elMaster.value = String(state.masterLinear)
  refreshReadout()

  if (state.playing) {
    lastT = 0
    raf = requestAnimationFrame(tick)
  }
}

mount()
