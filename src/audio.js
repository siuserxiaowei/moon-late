/* ------------------------------------------------------------------ */
/* A tiny synthesized night soundscape. No external audio files.        */
/* ------------------------------------------------------------------ */

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.muted = false;
    this.noise = null;
    this.ambience = null;
    this.dragNodes = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      comp.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(comp);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.78, this.ctx.currentTime + 1.8);

      this.noise = this.makeNoise(3.2);
      this.startAmbience();
      this.enabled = true;
    } catch (err) {
      console.warn("audio unavailable", err?.message || err);
    }
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.1 + white * 0.13;
    }
    return buf;
  }

  loopNoise(source, filters, targetGain, lfos = []) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    let node = src;
    for (const f of filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.freq;
      filter.Q.value = f.q ?? 0.7;
      node.connect(filter);
      node = filter;
      for (const lfoDef of f.lfos || []) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = lfoDef.rate;
        lfoGain.gain.value = lfoDef.amount;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
      }
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 4);
    node.connect(gain);
    gain.connect(this.master);
    src.start();
    return { src, gain };
  }

  startAmbience() {
    const ctx = this.ctx;
    const wind = this.loopNoise(this.noise, [
      { type: "lowpass", freq: 340, q: 0.5, lfos: [{ rate: 0.061, amount: 140 }] },
    ], 0.075);
    const leaves = this.loopNoise(this.noise, [
      { type: "bandpass", freq: 1350, q: 0.7, lfos: [{ rate: 0.13, amount: 320 }] },
    ], 0.012);
    const water = this.loopNoise(this.noise, [
      { type: "bandpass", freq: 860, q: 0.55, lfos: [{ rate: 0.19, amount: 180 }] },
      { type: "lowpass", freq: 2400, q: 0.4 },
    ], 0.026);

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.gain.linearRampToValueAtTime(0.018, ctx.currentTime + 6);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 190;
    droneGain.connect(this.master);
    droneFilter.connect(droneGain);
    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = 82.5;
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.22;
    oscA.connect(droneFilter);
    oscB.connect(oscBGain);
    oscBGain.connect(droneFilter);
    oscA.start();
    oscB.start();

    this.ambience = { wind, leaves, water, droneGain };

    // Persistent continuous bronze-turn resonance + friction noise
    const dragSrc = ctx.createBufferSource();
    dragSrc.buffer = this.noise;
    dragSrc.loop = true;
    dragSrc.playbackRate.value = 1.45;
    const dragFilter = ctx.createBiquadFilter();
    dragFilter.type = "bandpass";
    dragFilter.frequency.value = 480;
    dragFilter.Q.value = 2.6;
    const dragGain = ctx.createGain();
    dragGain.gain.value = 0.0001;
    dragSrc.connect(dragFilter);
    dragFilter.connect(dragGain);
    dragGain.connect(this.master);
    dragSrc.start();

    const bronzeOsc = ctx.createOscillator();
    bronzeOsc.type = "triangle";
    bronzeOsc.frequency.value = 220;
    const bronzeFilter = ctx.createBiquadFilter();
    bronzeFilter.type = "bandpass";
    bronzeFilter.frequency.value = 440;
    bronzeFilter.Q.value = 4.0;
    const bronzeGain = ctx.createGain();
    bronzeGain.gain.value = 0.0001;
    bronzeOsc.connect(bronzeFilter);
    bronzeFilter.connect(bronzeGain);
    bronzeGain.connect(this.master);
    bronzeOsc.start();

    this.dragNodes = { dragFilter, dragGain, bronzeOsc, bronzeGain };
  }

  setDragVelocity(normSpeed) {
    if (!this.ctx || !this.dragNodes) return;
    const t = this.ctx.currentTime;
    const s = this.muted ? 0 : Math.max(0, Math.min(1, normSpeed));
    const targetGain = s > 0.01 ? 0.0001 + s * 0.032 : 0.0001;
    const targetFreq = 480 + s * 480;
    const targetBronze = s > 0.01 ? 0.0001 + s * 0.006 : 0.0001;
    this.dragNodes.dragGain.gain.setTargetAtTime(targetGain, t, 0.04);
    this.dragNodes.dragFilter.frequency.setTargetAtTime(targetFreq, t, 0.04);
    this.dragNodes.bronzeGain.gain.setTargetAtTime(targetBronze, t, 0.04);
    this.dragNodes.bronzeOsc.frequency.setTargetAtTime(210 + s * 65, t, 0.05);
  }

  setMuted(next) {
    this.muted = next;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(next ? 0.0001 : 0.78, t + 0.45);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tick() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1750 + Math.random() * 550, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  drag() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 620;
    filter.Q.value = 2.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.12);
  }

  bell(base = 392, gain = 0.12, when = 0, length = 3.8) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, when);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, t + length);
    out.connect(this.master);
    const partials = [
      [1, 1],
      [2.01, 0.44],
      [2.98, 0.25],
      [4.19, 0.16],
      [5.63, 0.08],
      [7.1, 0.035],
    ];
    for (const [ratio, amp] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * ratio;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + length + 0.1);
    }
  }

  solve(stage = 0) {
    if (!this.ctx || this.muted) return;
    const roots = [392.0, 440.0, 523.25];
    const base = roots[Math.min(stage, 2)];
    this.bell(base, 0.115);
    this.bell(base * 1.5, 0.035, this.ctx.currentTime + 0.14, 2.8);
    if (stage >= 2) this.bell(base * 0.5, 0.08, this.ctx.currentTime + 0.3, 6.5);
  }

  boat() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1.2);
    this.bell(196, 0.018, t + 0.45, 0.7);
  }

  ui() {
    if (!this.ctx || this.muted) return;
    this.bell(880, 0.025, this.ctx.currentTime, 0.55);
  }

  hint() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.bell(659.25, 0.028, t, 1.2);
    this.bell(880, 0.022, t + 0.18, 1.4);
  }

  finale() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = this.muted ? 0.0001 : 0.82;

    const drone = ctx.createGain();
    drone.gain.setValueAtTime(0.0001, t);
    drone.gain.exponentialRampToValueAtTime(0.055, t + 5.2);
    drone.gain.exponentialRampToValueAtTime(0.0001, t + 15);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 140;
    drone.connect(lp);
    lp.connect(this.master);
    [43.65, 65.41, 87.31].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? "triangle" : "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : i === 1 ? 0.32 : 0.15;
      o.connect(g);
      g.connect(drone);
      o.start(t);
      o.stop(t + 15.5);
    });

    const shimmer = ctx.createGain();
    shimmer.gain.setValueAtTime(0.0001, t);
    shimmer.gain.exponentialRampToValueAtTime(0.012, t + 4);
    shimmer.gain.exponentialRampToValueAtTime(0.0001, t + 13);
    shimmer.connect(this.master);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25 / (i + 1);
      const trem = ctx.createOscillator();
      const tg = ctx.createGain();
      trem.frequency.value = 0.11 + i * 0.035;
      tg.gain.value = 0.12 / (i + 1);
      trem.connect(tg);
      tg.connect(g.gain);
      trem.start(t);
      o.connect(g);
      g.connect(shimmer);
      o.start(t);
      o.stop(t + 13.5);
      trem.stop(t + 13.5);
    });

    [523.25, 659.25, 784, 1046.5].forEach((f, i) => {
      this.bell(f, i === 0 ? 0.085 : 0.035, t + i * 1.35, 6.5);
    });
  }
}
