/**
 * audio.js — efeitos sonoros e música de fundo.
 *
 * Por padrão, todos os sons são SINTETIZADOS com Web Audio (nenhum arquivo é necessário).
 * Para usar arquivos próprios, coloque-os em assets/sounds/ e informe o caminho em
 * data/audio.json, ex.: { "music": "assets/sounds/musica.mp3", "sfx": { "match": "assets/sounds/match.wav" } }.
 */
import { assetUrl } from './utils.js';

const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

export class AudioManager {
  constructor(store) {
    this.store = store;
    this.ctx = null;
    this.buffers = {};
    this.manifest = { music: '', sfx: {} };
    this.musicEl = null;
    this.musicTimer = null;
    this.musicWanted = false;
    this.lastPlay = {};
  }

  get settings() {
    return this.store.settings;
  }

  async loadManifest(url = 'data/audio.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) this.manifest = { music: '', sfx: {}, ...(await res.json()) };
    } catch {
      /* manifesto opcional */
    }
  }

  /** Deve ser chamado num gesto do usuário (toque/clique) — exigência dos navegadores. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 4;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      // Eco suave usado pela música.
      this.delay = this.ctx.createDelay(1);
      this.delay.delayTime.value = 0.36;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      this.delayWet = this.ctx.createGain();
      this.delayWet.gain.value = 0.3;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(this.delayWet).connect(this.musicGain);
      // Barramento do arpejo: som direto + eco.
      this.arpBus = this.ctx.createGain();
      this.arpBus.connect(this.musicGain);
      this.arpBus.connect(this.delay);
      this.applyVolumes();
      this.loadSfxFiles();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicWanted) this.startMusic();
  }

  async loadSfxFiles() {
    for (const [name, path] of Object.entries(this.manifest.sfx || {})) {
      if (!path) continue;
      try {
        const res = await fetch(assetUrl(path));
        if (!res.ok) continue;
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        console.warn('[Match dos Santos] Som não carregado:', path, err);
      }
    }
  }

  applyVolumes() {
    const s = this.settings;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.setTargetAtTime(s.sfx ? s.sfxVolume * 0.9 : 0, t, 0.03);
      this.musicGain.gain.setTargetAtTime(s.music ? s.musicVolume * 0.55 : 0, t, 0.2);
    }
    if (this.musicEl) this.musicEl.volume = s.music ? s.musicVolume : 0;
  }

  setSetting(key, value) {
    this.store.update((d) => {
      d.settings[key] = value;
    });
    this.applyVolumes();
    if (key === 'music') value ? this.startMusic() : this.stopMusic(true);
  }

  // ------------------------------------------------------------------ síntese
  tone(freq, { type = 'sine', at = 0, dur = 0.2, attack = 0.005, gain = 0.2, glide = null, dest = null, detune = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.value = detune;
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  bell(freq, { at = 0, dur = 0.9, gain = 0.16, dest = null } = {}) {
    [
      [1, 1],
      [2.01, 0.45],
      [3.0, 0.22],
      [4.2, 0.12],
    ].forEach(([ratio, amp]) =>
      this.tone(freq * ratio, { at, dur: dur / Math.sqrt(ratio), gain: gain * amp, attack: 0.004, dest }),
    );
  }

  noise({ at = 0, dur = 0.15, gain = 0.12, from = 600, to = 2400, q = 1.2 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  /**
   * Toca um efeito sonoro.
   * Nomes: select, swap, invalid, match, cascade, special, line, area, combo,
   *        win, lose, stage, reflection, star, click, shuffle
   */
  play(name, opts = {}) {
    if (!this.ctx || !this.settings.sfx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < 40) return; // evita empilhar o mesmo som
    this.lastPlay[name] = now;

    if (this.buffers[name]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.sfxGain);
      src.start();
      return;
    }
    const step = Math.max(1, opts.step || 1);
    switch (name) {
      case 'click':
        this.tone(1200, { dur: 0.05, gain: 0.08, type: 'triangle' });
        break;
      case 'select':
        this.tone(660, { dur: 0.1, gain: 0.14, glide: 990 });
        this.tone(1320, { dur: 0.08, gain: 0.04, type: 'triangle', at: 0.01 });
        break;
      case 'swap':
        this.noise({ dur: 0.13, gain: 0.07, from: 700, to: 2600 });
        break;
      case 'invalid':
        this.tone(240, { dur: 0.1, gain: 0.08, type: 'square' });
        this.tone(200, { dur: 0.14, gain: 0.08, type: 'square', at: 0.09 });
        break;
      case 'match': {
        const f = SCALE[Math.min(SCALE.length - 1, step - 1)];
        this.bell(f, { dur: 0.7, gain: 0.13 });
        this.tone(f * 2, { dur: 0.12, gain: 0.04, type: 'triangle', at: 0.03 });
        break;
      }
      case 'cascade': {
        const base = Math.min(SCALE.length - 3, step);
        [0, 1, 2].forEach((i) => this.bell(SCALE[base + i], { at: i * 0.06, dur: 0.5, gain: 0.09 }));
        break;
      }
      case 'special':
        this.bell(1318.5, { dur: 1.1, gain: 0.12 });
        this.bell(1975.5, { at: 0.07, dur: 1.0, gain: 0.08 });
        this.noise({ dur: 0.35, gain: 0.04, from: 3000, to: 8000, q: 3 });
        break;
      case 'line':
        this.noise({ dur: 0.3, gain: 0.12, from: 400, to: 5000, q: 0.8 });
        this.tone(880, { dur: 0.3, gain: 0.06, glide: 1760, type: 'triangle' });
        break;
      case 'area':
      case 'combo':
        this.tone(140, { dur: 0.45, gain: 0.25, glide: 50 });
        this.noise({ dur: 0.45, gain: 0.1, from: 2000, to: 300, q: 0.7 });
        this.bell(1046.5, { at: 0.05, dur: 1.2, gain: 0.08 });
        break;
      case 'shuffle':
        [0, 1, 2, 3].forEach((i) => this.noise({ at: i * 0.07, dur: 0.1, gain: 0.05, from: 900 + i * 300, to: 2400 }));
        break;
      case 'reflection':
        this.bell(783.99, { dur: 1.4, gain: 0.07 });
        this.bell(1174.66, { at: 0.12, dur: 1.4, gain: 0.05 });
        break;
      case 'star':
        this.bell(SCALE[4 + Math.min(3, step)], { dur: 0.9, gain: 0.14 });
        break;
      case 'stage':
        [0, 2, 4, 5].forEach((n, i) => this.bell(SCALE[n], { at: i * 0.09, dur: 0.8, gain: 0.11 }));
        break;
      case 'win':
        [0, 2, 4, 5].forEach((n, i) => this.bell(SCALE[n], { at: i * 0.12, dur: 1.0, gain: 0.13 }));
        [SCALE[5], SCALE[7], SCALE[9]].forEach((f) => this.bell(f, { at: 0.55, dur: 1.8, gain: 0.08 }));
        break;
      case 'lose':
        [440, 392, 349.23, 293.66].forEach((f, i) => this.tone(f, { at: i * 0.2, dur: 0.5, gain: 0.09, type: 'triangle' }));
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ música
  startMusic() {
    this.musicWanted = true;
    if (!this.settings.music) return;
    if (this.manifest.music) {
      if (!this.musicEl) {
        this.musicEl = new Audio(assetUrl(this.manifest.music));
        this.musicEl.loop = true;
      }
      this.musicEl.volume = this.settings.musicVolume;
      this.musicEl.play().catch(() => {});
      return;
    }
    if (!this.ctx || this.musicTimer) return;
    this.applyVolumes();
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic(keepWanted = false) {
    if (!keepWanted) this.musicWanted = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicEl) this.musicEl.pause();
  }

  /** Música ambiente gerativa: pad + baixo + arpejo suave (Ré maior, ~76 bpm). */
  scheduleMusic() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const eighth = 60 / 76 / 2;
    // Se a aba ficou em segundo plano, não "despeja" as notas atrasadas de uma vez.
    if (this.nextNoteTime < this.ctx.currentTime - 0.2) this.nextNoteTime = this.ctx.currentTime + 0.05;
    // Acordes (frequências): Dmaj7, Bm7, Gmaj7, Asus4→A
    const chords = [
      { bass: 73.42, notes: [293.66, 369.99, 440.0, 554.37] },
      { bass: 61.74, notes: [246.94, 293.66, 369.99, 440.0] },
      { bass: 49.0, notes: [196.0, 246.94, 293.66, 369.99] },
      { bass: 55.0, notes: [220.0, 293.66, 329.63, 440.0] },
    ];
    while (this.nextNoteTime < this.ctx.currentTime + 0.5) {
      const step = this.musicStep;
      const at = this.nextNoteTime - this.ctx.currentTime;
      const chord = chords[Math.floor(step / 16) % chords.length];
      const dest = this.musicGain;
      if (step % 16 === 0) {
        // pad de 2 compassos
        chord.notes.forEach((f, i) =>
          this.tone(f, { at, dur: eighth * 16 + 1.2, attack: 1.4, gain: 0.035, type: i % 2 ? 'triangle' : 'sine', dest, detune: i * 3 - 4 }),
        );
        this.tone(chord.bass, { at, dur: eighth * 8, attack: 0.3, gain: 0.09, dest });
      }
      if (step % 16 === 8) this.tone(chord.bass * 1.5, { at, dur: eighth * 8, attack: 0.3, gain: 0.05, dest });
      // arpejo leve
      if (step % 2 === 0 && Math.random() < 0.72) {
        const f = chord.notes[Math.floor(Math.random() * chord.notes.length)] * (Math.random() < 0.5 ? 2 : 4);
        this.tone(f, { at, dur: 1.1, attack: 0.01, gain: 0.03, type: 'triangle', dest: this.arpBus });
      }
      this.nextNoteTime += eighth;
      this.musicStep = (step + 1) % 64;
    }
  }

  /** Pausa a música quando a aba fica oculta. */
  handleVisibility(hidden) {
    if (!this.ctx) return;
    if (hidden) {
      this.ctx.suspend().catch(() => {});
      if (this.musicEl) this.musicEl.pause();
    } else {
      this.ctx.resume().catch(() => {});
      if (this.musicWanted && this.settings.music && this.musicEl) this.musicEl.play().catch(() => {});
    }
  }
}
