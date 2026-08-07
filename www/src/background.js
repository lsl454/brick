// background.js — 全屏动态背景：石墙纹理 + 浮尘 + 氛围辉光 + 余烬 + 暗角
(function (global) {
  'use strict';

  const T = global.BFTex;

  function buildWallTile(size, theme) {
    const cv = T.newCanvas(size, size);
    const g = cv.getContext('2d');
    const rnd = T.mulberry32(20260806);

    g.fillStyle = theme.wallBase;
    g.fillRect(0, 0, size, size);

    // 粗糙水泥噪点
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 26;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    g.putImageData(img, 0, 0);

    // 石块砌缝
    const bh = 34, bw = 78;
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.lineWidth = 2;
    for (let y = 0; y <= size; y += bh) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.030)';
      g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(size, y + 2.5); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.30)';
      const off = ((y / bh) % 2) * (bw / 2);
      for (let x = off; x <= size; x += bw) {
        g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + bh); g.stroke();
      }
    }
    // 污渍
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size, y = rnd() * size, r = 18 + rnd() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,' + (0.05 + rnd() * 0.09).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    return cv;
  }

  class Background {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.motes = [];
      this.embers = [];
      this.heat = 0;         // 0..1 由连锁/危险度驱动
      this.targetHeat = 0;
      this.theme = null;
      this.tile = null;
      this.tileSize = 256;
      this.time = 0;
      this.focus = { x: 0.5, y: 0.5 };
      this.resize();
      for (let i = 0; i < 70; i++) this.motes.push(this._newMote(true));
    }
    _newMote(anywhere) {
      return {
        x: Math.random() * this.w,
        y: anywhere ? Math.random() * this.h : this.h + 12,
        r: 0.6 + Math.random() * 2.3,
        vy: -6 - Math.random() * 20,
        vx: (Math.random() - 0.5) * 12,
        a: 0.06 + Math.random() * 0.22,
        ph: Math.random() * 6.28,
      };
    }
    setTheme(theme) {
      if (this.theme && this.theme.id === theme.id) return;
      this.theme = theme;
      this.tile = buildWallTile(this.tileSize, theme);
    }
    resize() {
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      this.w = global.innerWidth;
      this.h = global.innerHeight;
      this.canvas.width = Math.floor(this.w * dpr);
      this.canvas.height = Math.floor(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._vignette = null;
    }
    setFocus(px, py) { this.focus.x = px; this.focus.y = py; }
    pulse(amount) { this.targetHeat = Math.min(1, this.targetHeat + amount); }
    setBaseHeat(v) { this._base = v; }

    update(dt) {
      this.time += dt;
      const base = this._base || 0;
      this.targetHeat = Math.max(base, this.targetHeat - dt * 0.55);
      this.heat += (this.targetHeat - this.heat) * Math.min(1, dt * 5);

      for (const m of this.motes) {
        m.y += m.vy * dt;
        m.x += (m.vx + Math.sin(this.time * 0.6 + m.ph) * 8) * dt;
        if (m.y < -12) { const n = this._newMote(false); Object.assign(m, n); }
      }
      // 余烬随热度生成
      if (this.heat > 0.18 && Math.random() < this.heat * dt * 34) {
        this.embers.push({
          x: this.w * (0.5 + (Math.random() - 0.5) * 0.7),
          y: this.h + 10,
          vy: -30 - Math.random() * 70,
          vx: (Math.random() - 0.5) * 26,
          r: 1 + Math.random() * 2.4,
          life: 0, maxLife: 2.4 + Math.random() * 2,
          ph: Math.random() * 6.28,
        });
      }
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        e.life += dt;
        e.y += e.vy * dt;
        e.x += (e.vx + Math.sin(this.time * 1.6 + e.ph) * 18) * dt;
        if (e.life > e.maxLife || e.y < -20) this.embers.splice(i, 1);
      }
    }

    draw() {
      const ctx = this.ctx, w = this.w, h = this.h;
      const th = this.theme;
      ctx.clearRect(0, 0, w, h);

      // 底色
      ctx.fillStyle = th.bgDeep;
      ctx.fillRect(0, 0, w, h);

      // 石墙平铺（带极缓慢视差漂移）
      if (this.tile) {
        const drift = (this.time * 3) % this.tileSize;
        const pat = ctx.createPattern(this.tile, 'repeat');
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(0, -drift * 0.15);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h + this.tileSize);
        ctx.restore();
      }

      // 顶部环境光
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      top.addColorStop(0, T.rgba(th.ambient, 0.30));
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.75);

      // 棋盘后方的氛围辉光（随热度增强）
      const cx = w * this.focus.x, cy = h * this.focus.y;
      const rad = Math.max(w, h) * (0.30 + this.heat * 0.22);
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.2);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      glow.addColorStop(0, T.rgba(th.glow, 0.14 + this.heat * 0.34 * pulse));
      glow.addColorStop(0.55, T.rgba(th.glow, 0.05 + this.heat * 0.12));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 浮尘
      ctx.save();
      for (const m of this.motes) {
        ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(this.time * 1.4 + m.ph));
        ctx.fillStyle = th.mote;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.2832); ctx.fill();
      }
      ctx.restore();

      // 余烬
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.embers) {
        const t = 1 - e.life / e.maxLife;
        ctx.globalAlpha = t * 0.75;
        ctx.fillStyle = th.ember;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = t * 0.16;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 4.5, 0, 6.2832); ctx.fill();
      }
      ctx.restore();

      // 暗角
      if (!this._vignette || this._vw !== w || this._vh !== h) {
        this._vw = w; this._vh = h;
        const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.78);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.78)');
        this._vignette = v;
      }
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, w, h);
    }
  }

  global.BFBackground = Background;
})(typeof window !== 'undefined' ? window : globalThis);
