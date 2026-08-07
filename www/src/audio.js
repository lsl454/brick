// audio.js — 全部由 Web Audio API 实时合成，不依赖任何音频素材文件
(function (global) {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.musicOn = false;
      this.ready = false;
      this._musicTimer = null;
      this._step = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;

        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -16;
        this.comp.knee.value = 22;
        this.comp.ratio.value = 8;
        this.comp.attack.value = 0.003;
        this.comp.release.value = 0.22;

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 1;
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;

        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);

        this.noiseBuf = this._makeNoise(2.0);
        this.ready = true;
      } catch (e) { this.ctx = null; }
      return this.ctx;
    }

    _makeNoise(seconds) {
      const len = Math.floor(this.ctx.sampleRate * seconds);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    _ok() {
      if (this.muted) return false;
      if (!this.ctx) this.init();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }

    /** 单音：带包络的振荡器 */
    tone(opt) {
      if (!this._ok()) return;
      try {
        const c = this.ctx, t = c.currentTime + (opt.delay || 0);
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = opt.type || 'square';
        osc.frequency.setValueAtTime(opt.f0, t);
        if (opt.f1 !== undefined) {
          if (opt.exp === false) osc.frequency.linearRampToValueAtTime(opt.f1, t + opt.dur);
          else osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + opt.dur);
        }
        const vol = (opt.vol === undefined ? 0.12 : opt.vol);
        const atk = opt.atk === undefined ? 0.005 : opt.atk;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
        let node = osc;
        if (opt.filter) {
          const flt = c.createBiquadFilter();
          flt.type = opt.filter;
          flt.frequency.setValueAtTime(opt.fc0 || 1200, t);
          if (opt.fc1) flt.frequency.exponentialRampToValueAtTime(Math.max(40, opt.fc1), t + opt.dur);
          flt.Q.value = opt.q || 1;
          node.connect(flt); node = flt;
        }
        node.connect(g).connect(opt.bus || this.sfxBus);
        osc.start(t);
        osc.stop(t + opt.dur + 0.05);
      } catch (e) { /* 音频失败不应影响游戏 */ }
    }

    /** 噪声冲击：碎裂/爆炸/落地 */
    noise(opt) {
      if (!this._ok()) return;
      try {
        const c = this.ctx, t = c.currentTime + (opt.delay || 0);
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.playbackRate.value = opt.rate || 1;
        const flt = c.createBiquadFilter();
        flt.type = opt.filter || 'bandpass';
        flt.frequency.setValueAtTime(opt.fc0 || 900, t);
        flt.frequency.exponentialRampToValueAtTime(Math.max(40, opt.fc1 || 200), t + opt.dur);
        flt.Q.value = opt.q || 1.1;
        const g = c.createGain();
        const vol = opt.vol === undefined ? 0.2 : opt.vol;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
        src.connect(flt).connect(g).connect(this.sfxBus);
        src.start(t, Math.random() * 1.2);
        src.stop(t + opt.dur + 0.05);
      } catch (e) { /* ignore */ }
    }

    // ---------------- 具体音效 ----------------
    move()      { this.tone({ f0: 240, f1: 200, dur: 0.045, type: 'square', vol: 0.045 }); }
    rotate()    { this.tone({ f0: 380, f1: 520, dur: 0.06, type: 'square', vol: 0.06 }); }
    softDrop()  { this.tone({ f0: 150, f1: 120, dur: 0.03, type: 'square', vol: 0.035 }); }
    hold()      { this.tone({ f0: 300, f1: 460, dur: 0.09, type: 'triangle', vol: 0.09 }); }
    deny()      { this.tone({ f0: 130, f1: 90, dur: 0.10, type: 'sawtooth', vol: 0.07 }); }
    land()      {
      this.noise({ fc0: 700, fc1: 110, dur: 0.14, vol: 0.16, filter: 'lowpass', q: 0.8 });
      this.tone({ f0: 96, f1: 58, dur: 0.11, type: 'triangle', vol: 0.10 });
    }
    hardDrop()  {
      this.noise({ fc0: 1600, fc1: 90, dur: 0.20, vol: 0.26, filter: 'lowpass', q: 1.0 });
      this.tone({ f0: 150, f1: 44, dur: 0.18, type: 'sawtooth', vol: 0.14 });
    }
    warn()      { this.tone({ f0: 620, f1: 420, dur: 0.16, type: 'sine', vol: 0.09 }); }
    lineAlert() {
      this.tone({ f0: 900, f1: 1500, dur: 0.16, type: 'sine', vol: 0.10 });
      this.tone({ f0: 1350, f1: 2100, dur: 0.14, type: 'sine', vol: 0.06, delay: 0.06 });
    }
    crack(power) {
      const p = power || 1;
      this.noise({ fc0: 2600, fc1: 160, dur: 0.28 + p * 0.05, vol: 0.30, filter: 'lowpass', q: 1.3 });
      this.noise({ fc0: 5200, fc1: 900, dur: 0.13, vol: 0.16, filter: 'bandpass', q: 0.8, delay: 0.01 });
      this.tone({ f0: 130 * p, f1: 40, dur: 0.24, type: 'sawtooth', vol: 0.13 });
    }
    explode() {
      this.noise({ fc0: 3400, fc1: 70, dur: 0.5, vol: 0.36, filter: 'lowpass', q: 1.6 });
      this.tone({ f0: 180, f1: 32, dur: 0.42, type: 'sawtooth', vol: 0.20 });
    }
    laser() {
      this.tone({ f0: 2400, f1: 260, dur: 0.32, type: 'sawtooth', vol: 0.16, filter: 'bandpass', fc0: 3000, fc1: 400, q: 6 });
      this.noise({ fc0: 4200, fc1: 500, dur: 0.26, vol: 0.14, filter: 'bandpass', q: 2 });
    }
    star() {
      [0, 0.05, 0.1, 0.15, 0.2].forEach((d, i) => {
        this.tone({ f0: 700 + i * 260, dur: 0.20, type: 'triangle', vol: 0.11, delay: d });
      });
    }
    clearLines(n) {
      const base = [523, 587, 659, 784];
      for (let i = 0; i < Math.min(4, n + 1); i++) {
        this.tone({ f0: base[i], dur: 0.20, type: 'square', vol: 0.10, delay: i * 0.045 });
      }
    }
    combo(n) {
      const k = Math.min(10, n);
      for (let i = 0; i < 3; i++) {
        this.tone({ f0: 440 * Math.pow(1.0595, k * 2 + i * 4), dur: 0.20, type: 'triangle', vol: 0.13, delay: i * 0.05 });
      }
    }
    tetris() {
      [392, 523, 659, 784, 1046].forEach((f, i) => {
        this.tone({ f0: f, dur: 0.30, type: 'square', vol: 0.13, delay: i * 0.055 });
      });
    }
    tspin() {
      this.tone({ f0: 300, f1: 1200, dur: 0.26, type: 'sawtooth', vol: 0.13, filter: 'bandpass', fc0: 800, fc1: 2600, q: 4 });
    }
    perfectClear() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        this.tone({ f0: f, dur: 0.55, type: 'triangle', vol: 0.14, delay: i * 0.08 });
      });
    }
    levelUp() {
      [523, 659, 880].forEach((f, i) => this.tone({ f0: f, dur: 0.22, type: 'square', vol: 0.12, delay: i * 0.06 }));
    }
    gameOver() {
      [440, 349, 262, 196].forEach((f, i) => {
        this.tone({ f0: f, f1: f * 0.75, dur: 0.5, type: 'sawtooth', vol: 0.14, delay: i * 0.16 });
      });
      this.noise({ fc0: 900, fc1: 60, dur: 1.1, vol: 0.16, filter: 'lowpass', delay: 0.1 });
    }
    click() { this.tone({ f0: 520, f1: 660, dur: 0.05, type: 'square', vol: 0.08 }); }
    countdown(n) {
      if (n > 0) this.tone({ f0: 520, dur: 0.14, type: 'square', vol: 0.11 });
      else this.tone({ f0: 900, dur: 0.30, type: 'square', vol: 0.14 });
    }

    // ---------------- 氛围音乐（低调的程序化循环） ----------------
    toggleMusic() {
      this.musicOn = !this.musicOn;
      // 注意：这里不能用 _ok()，否则静音状态下切换音乐会被拦截，
      // 导致之后取消静音时音乐无法恢复
      if (!this.ctx) this.init();
      if (!this.ctx) return this.musicOn;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.musicOn) { this.musicBus.gain.setTargetAtTime(0.30, this.ctx.currentTime, 0.4); this._startMusic(); }
      else { this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); this._stopMusic(); }
      return this.musicOn;
    }
    setMusicTempo(level) { this._tempo = Math.max(190, 420 - level * 12); }
    _startMusic() {
      if (this._musicTimer) return;
      this._tempo = this._tempo || 400;
      const scale = [110, 130.8, 146.8, 174.6, 196, 220, 261.6];
      const tick = () => {
        if (!this.musicOn || !this.ctx) return;
        const s = this._step++;
        // 低音脉冲
        if (s % 2 === 0) {
          this.tone({ f0: 55, f1: 41, dur: 0.30, type: 'sine', vol: 0.5, bus: this.musicBus });
        }
        // 稀疏的旋律点缀
        if (s % 8 === 3 || s % 8 === 6) {
          const n = scale[(Math.random() * scale.length) | 0] * 2;
          this.tone({ f0: n, dur: 0.55, type: 'triangle', vol: 0.16, bus: this.musicBus, filter: 'lowpass', fc0: 1800, fc1: 500 });
        }
        if (s % 16 === 0) {
          this.tone({ f0: scale[0], dur: 1.6, type: 'sine', vol: 0.22, bus: this.musicBus });
        }
        this._musicTimer = setTimeout(tick, this._tempo);
      };
      tick();
    }
    _stopMusic() {
      if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
      }
      return this.muted;
    }
  }

  global.BFAudio = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
