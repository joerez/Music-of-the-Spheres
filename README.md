# Music of the spheres

**Turn the solar system into a living chord.**

A small browser app that computes where the eight planets are across time, maps those geometries to pitch, and lets you **hear** separations and radii change as the clock runs—while a **3D view** and a **treble staff** show the same moment from different angles.

This is not a scientific ephemeris. It *is* a serious toy: clear math, honest limits, and room to wonder why we ever linked **ratios**, **orbits**, and **ears** in the first place.

---

## Why this exists

For centuries, “music of the spheres” was a metaphor: cosmic order described with the same language as consonance—whole-number ratios, beauty, pattern. Kepler, in *Harmonices Mundi* (1619), pushed further and tied harmony to **how fast** planets sweep along their ellipses, not to a literal keyboard in the sky.

**This project picks a different experiment:** what if we treat **distance** (Sun–planet radius, or spacing between neighbors) as the thing that becomes pitch? The mapping is modern and arbitrary on purpose: you choose reference frequency, octave folding, and optional just-intoned quantization. The app says so upfront, and the in-app help contrasts that choice with Kepler’s approach.

If one person scrubs time, hears the chord drift, and asks *“what quantity am I actually listening to?”*—that’s the point.

---

## What you get

| Layer | What it does |
|--------|----------------|
| **Orbits** | J2000 mean elements, two-body Kepler solver, positions in the ecliptic frame (`orbits.ts`). |
| **Sonification** | \(f = f_{\mathrm{ref}} \cdot (d_{\mathrm{ref}}/d)^{\alpha}\), optional invert, octave fold (100–800 Hz band), snap to simple ratios vs a drone (`mapping.ts`). |
| **Audio** | Web Audio API: one sine voice per “row,” per-voice mute, master level, smooth portamento (`audio.ts`). |
| **3D** | Three.js: Sun, planets, orbit rings, OrbitControls—scaled for clarity, not physical Sun size (`solar-vis.ts`). |
| **Staff** | Fixed five-line treble (E4–F5), continuous notehead height, ledger lines when needed, cents vs ET for the nearest natural and vs the nearest semitone (`staff-canvas.ts`). |
| **Time** | Scrub a span around J2000 or “now,” presets from a century to two millennia, play forward/back at chosen **days per second** (default ~one month per real second). |

Sound is optional: time and graphics run without enabling audio.

---

## Quick start

```bash
git clone https://github.com/joerez/Music-of-the-Spheres.git
cd Music-of-the-Spheres
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Click **Sound on** when you want to listen.

```bash
npm run build   # production bundle in dist/
npm run preview # serve dist locally
```

**Stack:** TypeScript, Vite 8, Three.js (r175). No backend.

---

## Using it (short version)

1. **Time** — Drag the slider or press **Play**. Range and center (J2000 / now) shape what “one lap” of the slider means.
2. **Mode** — *Heliocentric*: one tone per planet’s distance from the Sun. *Adjacent pairs*: seven tones for Mercury–Venus, Venus–Earth, …
3. **Toggles** — Fold octaves and quantize to just ratios (on by default) keep things in a listenable band and highlight “almost harmonic” moments; invert flips bright/dark metaphor.
4. **Voices** — Checkboxes mute parts of the chord; rows update in place so clicks survive animation frames.
5. **Staff** — Read pitch against notation; scroll horizontally if the panel is narrow (eight columns need space).

---

## Project layout

```
src/
  main.ts        — UI, state, playback loop
  orbits.ts      — JD, elements, positions, distances
  mapping.ts     — Hz from distances
  audio.ts       — oscillators + gains
  solar-vis.ts   — Three.js scene
  staff-canvas.ts— 2D staff renderer
  style.css
```

---

## Limitations (read once, then play)

- **Elements** are mean, J2000-class; no JPL DE, no relativistic corrections, no moons or barycenters.
- **Staff** and **cents** readouts are pedagogical; continuous pitch does not imply a single “correct” spelling.
- **3D** sizes and Sun disc are symbolic so inner planets stay visible; lighting is tuned for readability, not albedo science.

---

## Contributing / license

Issues and PRs welcome: clearer copy, accessibility, tests on `orbits`/`mapping`, or a second sonification mode (e.g. angular-speed à la Kepler) would all fit the spirit of the project.

Add a `LICENSE` file in the repo root if you want GitHub to show terms explicitly.

---

## Credits

Created by **Joe Rezendes** in San Francisco · [www.joerezendes.com](https://www.joerezendes.com)

---

*“The universe is under no obligation to sound pretty. This page lets you decide how hard to try.”*
