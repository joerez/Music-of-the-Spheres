const MAX_VOICES = 8

export class SphereAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private oscillators: OscillatorNode[] = []
  private gains: GainNode[] = []
  private voiceCount = 0

  async ensureRunning(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.2
      this.master.connect(this.ctx.destination)
      for (let i = 0; i < MAX_VOICES; i++) {
        const g = this.ctx.createGain()
        g.gain.value = 0
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 220
        osc.connect(g)
        g.connect(this.master)
        osc.start()
        this.oscillators.push(osc)
        this.gains.push(g)
      }
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  setMasterLinear(level: number): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02)
    }
  }

  /** How many oscillators are active (7 adjacent pairs or 8 heliocentric). */
  setVoiceCount(n: number): void {
    this.voiceCount = Math.min(MAX_VOICES, Math.max(0, n))
  }

  /**
   * Update frequencies and per-voice mutes. Uses short exponential ramps for smooth motion.
   */
  updateFrequencies(
    freqsHz: number[],
    muted: boolean[],
    portamentoSeconds = 0.08,
  ): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const n = Math.min(this.voiceCount, freqsHz.length, muted.length, MAX_VOICES)
    for (let i = 0; i < MAX_VOICES; i++) {
      const g = this.gains[i]
      const o = this.oscillators[i]
      if (!g || !o) continue
      if (i < n && !muted[i]) {
        const f = freqsHz[i]!
        o.frequency.setTargetAtTime(f, t, portamentoSeconds)
        g.gain.setTargetAtTime(0.12, t, 0.03)
      } else {
        g.gain.setTargetAtTime(0.0001, t, 0.05)
      }
    }
  }

  silenceAll(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (let i = 0; i < MAX_VOICES; i++) {
      this.gains[i]?.gain.setTargetAtTime(0.0001, t, 0.05)
    }
  }
}
