/**
 * Treble staff: fixed 5 lines (E4–F5), constant semitone spacing, per-note ledger lines.
 * Noteheads use continuous MIDI height; labels explain nearest natural + cents.
 */

const PC_CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const NATURAL_PC = new Set([0, 2, 4, 5, 7, 9, 11])

function isNaturalMidi(m: number): boolean {
  const pc = ((m % 12) + 12) % 12
  return NATURAL_PC.has(pc)
}

function naturalsBetween(lo: number, hi: number): number[] {
  const a = Math.floor(lo)
  const b = Math.ceil(hi)
  const out: number[] = []
  for (let m = a; m <= b; m++) {
    if (isNaturalMidi(m)) out.push(m)
  }
  return out
}

const TREBLE_ANCHOR_LINE_MIDI = 64

function naturalLineOrSpace(
  nMidi: number,
  naturalsOrdered: number[],
): { isLine: boolean; label: string } {
  let anchorIdx = naturalsOrdered.indexOf(TREBLE_ANCHOR_LINE_MIDI)
  if (anchorIdx < 0) {
    const j = naturalsOrdered.findIndex((m) => ((m % 12) + 12) % 12 === 4)
    anchorIdx = j >= 0 ? j : 0
  }
  const idx = naturalsOrdered.indexOf(nMidi)
  if (idx < 0) {
    return { isLine: true, label: 'line' }
  }
  const isLine = (idx - anchorIdx) % 2 === 0
  return { isLine, label: isLine ? 'line' : 'space' }
}

/** Wide natural list for line/space and “nearest natural” search. */
const CLASS_NATURALS = naturalsBetween(20, 110)

const ALL_LINE_MIDIS = CLASS_NATURALS.filter(
  (m) => naturalLineOrSpace(m, CLASS_NATURALS).isLine,
).sort((a, b) => a - b)

/** The five staff lines only (never move). */
const MAIN_STAFF_LINE_MIDIS = [64, 67, 71, 74, 77] as const

function naturalMidiToLetterOctave(m: number): string {
  const pc = ((m % 12) + 12) % 12
  const letters: Record<number, string> = {
    0: 'C',
    2: 'D',
    4: 'E',
    5: 'F',
    7: 'G',
    9: 'A',
    11: 'B',
  }
  const oct = Math.floor(m / 12) - 1
  return (letters[pc] ?? '?') + String(oct)
}

function chromaticNameFromMidiFloat(mf: number): string {
  const m = Math.round(mf)
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  return PC_CHROMATIC[pc] + String(oct)
}

function freqToMidiFloat(fHz: number): number {
  if (fHz <= 0 || !Number.isFinite(fHz)) return 69
  return 12 * Math.log2(fHz / 440) + 69
}

function etFreqForMidi(m: number): number {
  return 440 * 2 ** ((m - 69) / 12)
}

function centsBetweenFreqs(f: number, ref: number): number {
  if (f <= 0 || ref <= 0) return 0
  return 1200 * Math.log2(f / ref)
}

function nearestNaturalMidi(midiFloat: number): number {
  let best = 69
  let bestD = Infinity
  for (const n of CLASS_NATURALS) {
    const d = Math.abs(midiFloat - n)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

/** Y grows downward; higher pitch = smaller Y. E4 (64) sits on the bottom staff line. */
function yFromMidi(m: number, yE4: number, semiH: number): number {
  return yE4 - (m - 64) * semiH
}

/**
 * Short ledger segments for one note: every staff-line pitch outside the main 5-line block
 * that sits between the note and the staff body (same rules as conventional notation).
 */
function ledgerLineMidisForNote(mn: number): number[] {
  return ALL_LINE_MIDIS.filter((L) => {
    if (L >= 64 && L <= 77) return false
    /** Below E4: line pitches strictly between note (lower) and the staff. */
    if (mn < 64) return L < 64 && L > mn
    /** Above F5: line pitches strictly between top staff line and the note. */
    if (mn > 77) return L > 77 && L < mn
    return false
  })
}

export type StaffVoice = {
  label: string
  freqHz: number
  muted: boolean
}

export function drawChordStaff(canvas: HTMLCanvasElement, voices: StaffVoice[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const count = voices.length || 1
  const semiH = 6.5
  const yE4 = 168
  const staffLeft = 52
  const clefX = 6
  const marginX = 12
  const noteZoneLeft = staffLeft + 38
  /** Minimum column width so labels fit; never let total grid exceed canvas width. */
  const minCol = 92
  const minCanvasW = noteZoneLeft + count * minCol + marginX + 20
  const containerW = canvas.parentElement?.clientWidth ?? canvas.clientWidth ?? 720
  const Wcss = Math.max(400, containerW, minCanvasW)
  const Hcss = 320
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(Wcss * dpr)
  canvas.height = Math.floor(Hcss * dpr)
  canvas.style.width = `${Wcss}px`
  canvas.style.maxWidth = 'none'
  canvas.style.height = `${Hcss}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const W = Wcss
  const H = Hcss
  ctx.fillStyle = '#12131a'
  ctx.fillRect(0, 0, W, H)

  if (voices.length === 0) return

  const staffRight = W - 16
  const yTopLine = yFromMidi(77, yE4, semiH)
  const yBotLine = yFromMidi(64, yE4, semiH)
  const staffMidY = (yTopLine + yBotLine) / 2

  const labelTop = yBotLine + 28
  const noteZoneRight = staffRight - marginX
  const colW = (noteZoneRight - noteZoneLeft) / count
  const gridStart = noteZoneLeft
  const xs = voices.map((_, i) => gridStart + colW * i + colW / 2)

  ctx.strokeStyle = '#7a8299'
  ctx.lineWidth = 1.1
  for (const m of MAIN_STAFF_LINE_MIDIS) {
    const y = yFromMidi(m, yE4, semiH)
    ctx.beginPath()
    ctx.moveTo(staffLeft, y)
    ctx.lineTo(staffRight, y)
    ctx.stroke()
  }

  ctx.fillStyle = '#c9d0e0'
  ctx.font = 'bold 44px serif'
  ctx.fillText('𝄞', clefX, staffMidY + 14)

  ctx.fillStyle = '#8b92a8'
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillText('Fixed treble staff (E4–F5) · ledgers when needed · note height = exact pitch', staffLeft, 18)

  const midiFloats = voices.map((v) => freqToMidiFloat(v.freqHz))

  const analyses = voices.map((v, i) => {
    const mf = midiFloats[i]!
    const nNat = nearestNaturalMidi(mf)
    const fNat = etFreqForMidi(nNat)
    const centsNat = centsBetweenFreqs(v.freqHz, fNat)
    const mEt = Math.round(mf)
    const fEt = etFreqForMidi(mEt)
    const centsEt = centsBetweenFreqs(v.freqHz, fEt)
    const { label: lineOrSpace } = naturalLineOrSpace(nNat, CLASS_NATURALS)
    const natName = naturalMidiToLetterOctave(nNat)
    const hearName = chromaticNameFromMidiFloat(mf)
    return {
      mf,
      nNat,
      centsNat,
      centsEt,
      lineOrSpace,
      natName,
      hearName,
      x: xs[i]!,
      y: yFromMidi(mf, yE4, semiH),
      v,
    }
  })

  const ledgerHalf = Math.min(22, colW * 0.36)

  for (const a of analyses) {
    const alpha = a.v.muted ? 0.4 : 1
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#8e96ac'
    ctx.lineWidth = 1
    for (const L of ledgerLineMidisForNote(a.mf)) {
      const yL = yFromMidi(L, yE4, semiH)
      ctx.beginPath()
      ctx.moveTo(a.x - ledgerHalf, yL)
      ctx.lineTo(a.x + ledgerHalf, yL)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  for (const a of analyses) {
    const alpha = a.v.muted ? 0.35 : 1
    ctx.globalAlpha = alpha
    ctx.save()
    ctx.translate(a.x, a.y)
    ctx.rotate(-0.18)
    ctx.fillStyle = '#0d0e14'
    ctx.strokeStyle = a.v.muted ? '#4a5166' : '#b8c0d4'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(0, 0, 8.5, 6.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 1
  }

  const wrap = (text: string, maxW: number): string[] => {
    if (ctx.measureText(text).width <= maxW) return [text]
    const parts = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const p of parts) {
      const next = cur ? `${cur} ${p}` : p
      if (ctx.measureText(next).width <= maxW) cur = next
      else {
        if (cur) lines.push(cur)
        cur = p
      }
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : [text]
  }

  ctx.font = '8.5px ui-monospace, monospace'
  ctx.textAlign = 'left'
  const textPad = 4
  const maxTextW = colW - textPad * 2

  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i]!
    const colLeft = gridStart + i * colW + textPad
    const centsStr = `${a.centsNat >= 0 ? '+' : ''}${a.centsNat.toFixed(1)}¢`
    const centsEtStr = `${a.centsEt >= 0 ? '+' : ''}${a.centsEt.toFixed(1)}¢`
    const lines = [
      `${a.natName} (${a.lineOrSpace})`,
      `${centsStr} vs ${a.natName} ET`,
      `~${a.hearName} · ${centsEtStr} vs 12-TET semitone`,
      a.v.label,
    ]

    let yText = labelTop
    ctx.fillStyle = '#dfe4f2'
    for (const raw of lines.slice(0, 3)) {
      for (const row of wrap(raw, maxTextW)) {
        ctx.fillText(row, colLeft, yText)
        yText += 11
      }
    }
    ctx.fillStyle = '#8b92a8'
    ctx.font = '8px system-ui, sans-serif'
    for (const row of wrap(lines[3]!, maxTextW)) {
      ctx.fillText(row, colLeft, yText)
      yText += 10
    }
    ctx.font = '8.5px ui-monospace, monospace'
  }
}
