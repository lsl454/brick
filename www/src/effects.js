// effects.js — 粒子池 / 冲击波 / 光束 / 飘字 / 屏幕震动 / 慢动作
(function (global) {
  'use strict';

  // 1400 个粒子槽位在移动端每帧要整体扫两遍（update + draw），大部分时间里
  // 九成以上槽位都是空的，纯粹在浪费帧时间。600 个对这款游戏的爆炸/消行特效
  // 已经绰绰有余，肉眼基本看不出区别，但每帧扫描量直接减半以上。
  const MAX_PARTICLES = 600;
  const G = 900;

  // 预生成不规则碎石多边形，比方块碎片自然得多
  const SHARDS = [];
  (function buildShards() {
    for (let s = 0; s < 6; s++) {
      const pts = [];
      const n = 4 + (s % 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (s * 0.7);
        const r = 0.55 + ((s * 37 + i * 91) % 100) / 220;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      SHARDS.push(pts);
    }
  })();

  class Effects {
    constructor() {
      this.pool = new Array(MAX_PARTICLES);
      for (let i = 0; i < MAX_PARTICLES; i++) this.pool[i] = { active: false };
      this.cursor = 0;
      this.waves = [];
      this.beams = [];
      this.texts = [];
      this.flash = 0;
      this.flashColor = '#fff';
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeAng = 0;
      this.timeScale = 1;
      this._tsTarget = 1;
      this.floorY = null;   // 碎片可以在此高度反弹
    }

    _alloc() {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const idx = (this.cursor + i) % MAX_PARTICLES;
        if (!this.pool[idx].active) { this.cursor = (idx + 1) % MAX_PARTICLES; return this.pool[idx]; }
      }
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      return p;
    }

    // ---------- 生成器 ----------
    debris(x, y, color, count, power) {
      count = count || 10; power = power || 1;
      for (let i = 0; i < count; i++) {
        const p = this._alloc();
        const a = Math.random() * Math.PI * 2;
        const sp = (50 + Math.random() * 230) * power;
        p.active = true; p.kind = 'debris';
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp - 130 * power;
        p.size = 2.5 + Math.random() * 6.5;
        p.rot = Math.random() * 6.28;
        p.vrot = (Math.random() - 0.5) * 16;
        p.color = color;
        p.shard = SHARDS[(Math.random() * SHARDS.length) | 0];
        p.bounced = 0;
        p.life = p.maxLife = 0.75 + Math.random() * 0.7;
        p.drag = 0.06;
      }
    }
    dust(x, y, count, power) {
      count = count || 6; power = power || 1;
      for (let i = 0; i < count; i++) {
        const p = this._alloc();
        p.active = true; p.kind = 'dust';
        p.x = x + (Math.random() - 0.5) * 26;
        p.y = y + (Math.random() - 0.5) * 8;
        p.vx = (Math.random() - 0.5) * 90 * power;
        p.vy = (-20 - Math.random() * 55) * power;
        p.size = 5 + Math.random() * 13 * power;
        p.grow = 22 + Math.random() * 34;
        p.rot = 0; p.vrot = 0;
        p.color = '#b9a98c';
        p.life = p.maxLife = 0.5 + Math.random() * 0.5;
        p.drag = 1.7;
      }
    }
    smoke(x, y, count) {
      count = count || 4;
      for (let i = 0; i < count; i++) {
        const p = this._alloc();
        p.active = true; p.kind = 'smoke';
        p.x = x + (Math.random() - 0.5) * 30;
        p.y = y + (Math.random() - 0.5) * 16;
        p.vx = (Math.random() - 0.5) * 40;
        p.vy = -30 - Math.random() * 50;
        p.size = 12 + Math.random() * 18;
        p.grow = 40 + Math.random() * 45;
        p.color = '#2b241c';
        p.life = p.maxLife = 0.9 + Math.random() * 0.7;
        p.drag = 1.1;
      }
    }
    sparks(x, y, count, power) {
      count = count || 10; power = power || 1;
      for (let i = 0; i < count; i++) {
        const p = this._alloc();
        const a = Math.random() * Math.PI * 2;
        const sp = (150 + Math.random() * 380) * power;
        p.active = true; p.kind = 'spark';
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.size = 1.2 + Math.random() * 2.2;
        p.color = Math.random() < 0.45 ? '#fff2c8' : (Math.random() < 0.6 ? '#ffb04a' : '#ff6a2a');
        p.life = p.maxLife = 0.22 + Math.random() * 0.34;
        p.drag = 0.9;
        p.px = p.x; p.py = p.y;
      }
    }
    embers(x, y, count) {
      count = count || 6;
      for (let i = 0; i < count; i++) {
        const p = this._alloc();
        p.active = true; p.kind = 'ember';
        p.x = x + (Math.random() - 0.5) * 30;
        p.y = y + (Math.random() - 0.5) * 12;
        p.vx = (Math.random() - 0.5) * 70;
        p.vy = -50 - Math.random() * 110;
        p.size = 1.4 + Math.random() * 2.6;
        p.color = Math.random() < 0.5 ? '#ffce6a' : '#ff7a33';
        p.life = p.maxLife = 0.8 + Math.random() * 1.0;
        p.drag = 0.5;
        p.phase = Math.random() * 6.28;
      }
    }

    shockwave(x, y, opt) {
      opt = opt || {};
      this.waves.push({
        x, y, r: opt.r0 || 6,
        rMax: opt.rMax || 190,
        life: 0, maxLife: opt.dur || 0.55,
        color: opt.color || '#ffd08a',
        width: opt.width || 5,
        squashY: opt.squashY || 1,
      });
    }
    /** 水平光束：pos = y，跨度 a→b 为 x */
    beam(pos, opt) {
      opt = opt || {};
      this.beams.push({
        pos, vertical: false, life: 0, maxLife: opt.dur || 0.45,
        h: opt.h || 30,
        color: opt.color || '#fff0c8',
        a: opt.a || 0, b: opt.b || 0,
      });
    }
    /** 垂直光束：pos = x，跨度 a→b 为 y */
    beamV(pos, opt) {
      opt = opt || {};
      this.beams.push({
        pos, vertical: true, life: 0, maxLife: opt.dur || 0.45,
        h: opt.h || 30,
        color: opt.color || '#cfefff',
        a: opt.a || 0, b: opt.b || 0,
      });
    }
    text(x, y, str, opt) {
      opt = opt || {};
      this.texts.push({
        x, y, str,
        life: 0, maxLife: opt.dur || 1.0,
        color: opt.color || '#ffd9a0',
        size: opt.size || 17,
        vy: opt.vy === undefined ? -52 : opt.vy,
        weight: opt.weight || 'bold',
        glow: opt.glow || 0,
        scalePop: opt.scalePop || 0,
      });
    }
    screenFlash(amount, color) {
      this.flash = Math.max(this.flash, amount);
      if (color) this.flashColor = color;
    }
    shake(mag) { this.shakeMag = Math.min(34, Math.max(this.shakeMag, mag)); }
    slowmo(scale, hold) {
      this.timeScale = scale;
      this._tsHold = hold || 0.1;
    }

    clear() {
      for (let i = 0; i < MAX_PARTICLES; i++) this.pool[i].active = false;
      this.waves.length = 0; this.beams.length = 0; this.texts.length = 0;
      this.flash = 0; this.shakeMag = 0; this.timeScale = 1;
    }

    // ---------- 更新 ----------
    update(dt) {
      // 慢动作恢复
      if (this._tsHold > 0) { this._tsHold -= dt; }
      else if (this.timeScale < 1) { this.timeScale = Math.min(1, this.timeScale + dt * 2.6); }

      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        if (p.kind === 'spark') { p.px = p.x; p.py = p.y; }

        const dragF = 1 - Math.min(1, (p.drag || 0) * dt);
        if (p.kind === 'debris') {
          p.vy += G * dt;
          p.vx *= dragF;
          p.rot += p.vrot * dt;
          if (this.floorY !== null && p.y > this.floorY && p.vy > 0 && p.bounced < 2) {
            p.y = this.floorY; p.vy *= -0.36; p.vx *= 0.6; p.vrot *= 0.5; p.bounced++;
          }
        } else if (p.kind === 'dust' || p.kind === 'smoke') {
          p.vy += G * 0.06 * dt;
          p.vx *= dragF; p.vy *= dragF;
          p.size += (p.grow || 0) * dt;
        } else if (p.kind === 'spark') {
          p.vy += G * 0.55 * dt;
          p.vx *= dragF; p.vy *= dragF;
        } else if (p.kind === 'ember') {
          p.vy += G * 0.10 * dt;
          p.vx *= dragF;
          p.phase += dt * 7;
          p.x += Math.sin(p.phase) * 16 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        w.life += dt;
        const t = w.life / w.maxLife;
        w.r = w.rMax * (1 - Math.pow(1 - t, 2.4));
        if (w.life >= w.maxLife) this.waves.splice(i, 1);
      }
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.life += dt;
        if (b.life >= b.maxLife) this.beams.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life += dt;
        t.y += t.vy * dt;
        t.vy *= (1 - Math.min(1, dt * 1.6));
        if (t.life >= t.maxLife) this.texts.splice(i, 1);
      }

      this.flash *= Math.pow(0.006, dt);
      if (this.flash < 0.004) this.flash = 0;

      if (this.shakeMag > 0.35) {
        const m = this.shakeMag;
        this.shakeX = (Math.random() - 0.5) * m * 2;
        this.shakeY = (Math.random() - 0.5) * m * 2;
        this.shakeAng = (Math.random() - 0.5) * m * 0.0035;
        this.shakeMag *= Math.pow(0.0016, dt);
      } else {
        this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0; this.shakeAng = 0;
      }
    }

    // ---------- 绘制 ----------
    drawParticles(ctx) {
      // 先画不透明碎石/烟尘
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        const t = Math.max(0, p.life / p.maxLife);
        if (p.kind === 'debris') {
          ctx.save();
          ctx.globalAlpha = Math.min(1, t * 1.9);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const s = p.size;
          ctx.moveTo(p.shard[0][0] * s, p.shard[0][1] * s);
          for (let k = 1; k < p.shard.length; k++) ctx.lineTo(p.shard[k][0] * s, p.shard[k][1] * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.moveTo(p.shard[0][0] * s, p.shard[0][1] * s);
          for (let k = 1; k < Math.ceil(p.shard.length / 2); k++) ctx.lineTo(p.shard[k][0] * s, p.shard[k][1] * s);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (p.kind === 'smoke') {
          ctx.save();
          ctx.globalAlpha = t * 0.34;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
          ctx.restore();
        } else if (p.kind === 'dust') {
          ctx.save();
          ctx.globalAlpha = t * 0.42;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
      }
      // 再画发光类（叠加混合）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        const t = Math.max(0, p.life / p.maxLife);
        if (p.kind === 'spark') {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else if (p.kind === 'ember') {
          ctx.globalAlpha = t * 0.9;
          const flick = 0.7 + 0.3 * Math.sin(p.phase * 2.1);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * flick, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = t * 0.22;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.4 * flick, 0, 6.2832); ctx.fill();
        }
      }
      ctx.restore();
    }

    drawWavesAndBeams(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.beams) {
        const t = b.life / b.maxLife;
        const a = Math.sin(Math.min(1, t * 1.4) * Math.PI);
        const h = b.h * (0.35 + (1 - t) * 0.9);
        const p0 = b.pos - h / 2, p1 = b.pos + h / 2;
        const grd = b.vertical
          ? ctx.createLinearGradient(p0, 0, p1, 0)
          : ctx.createLinearGradient(0, p0, 0, p1);
        grd.addColorStop(0, 'rgba(255,240,200,0)');
        grd.addColorStop(0.5, b.color);
        grd.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = grd;
        if (b.vertical) ctx.fillRect(p0, b.a, h, b.b - b.a);
        else ctx.fillRect(b.a, p0, b.b - b.a, h);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        if (b.vertical) ctx.fillRect(b.pos - 1.2, b.a, 2.4, b.b - b.a);
        else ctx.fillRect(b.a, b.pos - 1.2, b.b - b.a, 2.4);
      }
      for (const w of this.waves) {
        const t = w.life / w.maxLife;
        const a = (1 - t) * (1 - t);
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.width * (1 - t * 0.75) + 0.5;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.scale(1, w.squashY);
        ctx.beginPath();
        ctx.arc(0, 0, w.r, 0, 6.2832);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    drawTexts(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.life / t.maxLife;
        let alpha = 1;
        if (k < 0.1) alpha = k / 0.1;
        else if (k > 0.65) alpha = 1 - (k - 0.65) / 0.35;
        let scale = 1;
        if (t.scalePop) {
          scale = k < 0.18 ? 0.5 + 1.0 * (k / 0.18)
                : k < 0.32 ? 1.5 - 0.5 * ((k - 0.18) / 0.14)
                : 1;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(t.x, t.y);
        ctx.scale(scale, scale);
        ctx.font = t.weight + ' ' + t.size + 'px "Arial Black", "Microsoft YaHei", sans-serif';
        if (t.glow) {
          ctx.shadowColor = t.color;
          ctx.shadowBlur = t.glow;
        }
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(t.str, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    drawFlash(ctx, w, h) {
      if (this.flash <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.85, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  global.BFEffects = Effects;
})(typeof window !== 'undefined' ? window : globalThis);
