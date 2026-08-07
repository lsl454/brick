// render.js — 棋盘渲染：石质外框 / 凹陷棋盘 / 砖块 / 虚影 / 特殊砖图标 / 危险警示
(function (global) {
  'use strict';

  const T = global.BFTex;

  function buildFrame(w, h, frame, theme) {
    const cv = T.newCanvas(w, h);
    const g = cv.getContext('2d');
    const rnd = T.mulberry32(4242);

    // 外框主体
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, T.shade(theme.frame, 26));
    grd.addColorStop(0.5, theme.frame);
    grd.addColorStop(1, T.shade(theme.frame, -30));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // 框上的石块分块
    g.strokeStyle = 'rgba(0,0,0,0.42)';
    g.lineWidth = 2;
    const step = 46;
    for (let x = 0; x < w; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, frame); g.stroke();
      g.beginPath(); g.moveTo(x + step / 2, h - frame); g.lineTo(x + step / 2, h); g.stroke();
    }
    for (let y = 0; y < h; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(frame, y); g.stroke();
      g.beginPath(); g.moveTo(w - frame, y + step / 2); g.lineTo(w, y + step / 2); g.stroke();
    }

    // 噪点做旧
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h;
      if (x > frame && x < w - frame && y > frame && y < h - frame) continue;
      g.fillStyle = rnd() < 0.55 ? 'rgba(0,0,0,0.15)' : 'rgba(255,240,220,0.06)';
      g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    }

    // 外缘高光与阴影
    g.strokeStyle = 'rgba(255,235,210,0.16)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);

    // 挖空中间（棋盘区）：必须使用完全不透明的源进行擦除。
    // 原代码沿用了噪点的半透明 fillStyle，导致棋盘中央残留深色蒙版，砖块因此灰暗。
    g.save();
    g.globalAlpha = 1;
    g.fillStyle = '#000000';
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(frame, frame, w - frame * 2, h - frame * 2);
    g.restore();
    g.globalCompositeOperation = 'source-over';

    // 内缘斜面（做出厚重凹陷感）
    const iw = w - frame * 2, ih = h - frame * 2;
    g.save();
    g.beginPath();
    g.rect(frame - 7, frame - 7, iw + 14, ih + 14);
    g.rect(frame, frame, iw, ih);
    g.clip('evenodd');
    const inn = g.createLinearGradient(frame, frame - 7, frame, frame + ih + 7);
    inn.addColorStop(0, 'rgba(0,0,0,0.85)');
    inn.addColorStop(1, 'rgba(255,230,200,0.14)');
    g.fillStyle = inn;
    g.fillRect(frame - 7, frame - 7, iw + 14, ih + 14);
    g.restore();

    // 四角铆钉
    const studs = [[frame * 0.55, frame * 0.55], [w - frame * 0.55, frame * 0.55],
                   [frame * 0.55, h - frame * 0.55], [w - frame * 0.55, h - frame * 0.55]];
    studs.forEach(function (p) {
      const r = frame * 0.28;
      const sg = g.createRadialGradient(p[0] - r * 0.3, p[1] - r * 0.3, 0, p[0], p[1], r);
      sg.addColorStop(0, T.shade(theme.frame, 78));
      sg.addColorStop(1, T.shade(theme.frame, -56));
      g.fillStyle = sg;
      g.beginPath(); g.arc(p[0], p[1], r, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.4;
      g.stroke();
    });

    return cv;
  }

  class BoardRenderer {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cell = opts.cell;
      this.frame = opts.frame;
      this.cols = opts.cols;
      this.rows = opts.rows;
      this.playW = this.cols * this.cell;
      this.playH = this.rows * this.cell;
      this.w = this.playW + this.frame * 2;
      this.h = this.playH + this.frame * 2;
      this.tex = new T.TextureFactory(this.cell);
      this.theme = null;
      this.frameTex = null;
      this.time = 0;
      this._setupDpr();
    }
    _setupDpr() {
      // 砖块纹理本身已经 4 倍超采样烘焙好了，画布 dpr 封顶到 2 就已经足够清晰，
      // 但能显著减少高分屏手机（dpr=3）上每帧要填充的像素数量。
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      this.dpr = dpr;
      this.canvas.width = Math.floor(this.w * dpr);
      this.canvas.height = Math.floor(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
    setTheme(theme) {
      if (this.theme && this.theme.id === theme.id) return;
      this.theme = theme;
      this.frameTex = buildFrame(this.w, this.h, this.frame, theme);
    }
    px(col) { return this.frame + col * this.cell; }
    py(rowVisible) { return this.frame + rowVisible * this.cell; }

    clear() {
      this.ctx.globalAlpha = 1;
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.filter = 'none';
      this.ctx.shadowBlur = 0;
      this.ctx.clearRect(0, 0, this.w, this.h);
    }

    drawPlayfield(dangerLevel) {
      const ctx = this.ctx, th = this.theme;
      const x = this.frame, y = this.frame, w = this.playW, h = this.playH;

      // 纯黑背景，确保砖块颜色最清晰
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);

      // 极淡的内阴影（棋盘尺寸整局不变，缓存渐变对象，不用每帧重建）
      if (!this._innerShadowGrad) {
        const vs = ctx.createLinearGradient(x, y, x, y + h * 0.35);
        vs.addColorStop(0, 'rgba(0,0,0,0.2)');
        vs.addColorStop(1, 'rgba(0,0,0,0)');
        this._innerShadowGrad = vs;
      }
      ctx.fillStyle = this._innerShadowGrad;
      ctx.fillRect(x, y, w, h * 0.35);

      // 网格（极淡）
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < this.cols; c++) { ctx.moveTo(this.px(c) + 0.5, y); ctx.lineTo(this.px(c) + 0.5, y + h); }
      for (let r = 1; r < this.rows; r++) { ctx.moveTo(x, this.py(r) + 0.5); ctx.lineTo(x + w, this.py(r) + 0.5); }
      ctx.stroke();
      ctx.restore();

      // 危险区红光（堆得太高时）
      if (dangerLevel > 0) {
        const pulse = 0.45 + 0.55 * Math.sin(this.time * 7);
        const dg = ctx.createLinearGradient(x, y, x, y + h * 0.5);
        dg.addColorStop(0, 'rgba(255,42,32,' + (0.34 * dangerLevel * pulse).toFixed(3) + ')');
        dg.addColorStop(1, 'rgba(255,42,32,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(x, y, w, h * 0.5);
      }
    }

    /** 绘制单格砖块（含下落偏移与压缩形变） */
    _brick(cell, col, rowVisible, opts) {
      const ctx = this.ctx;
      const size = this.cell;
      const x = this.px(col);
      const y = this.py(rowVisible) - (cell.animOffset || 0);
      if (y < this.frame - size || y > this.frame + this.playH) return;
      const tex = this.tex.brick(this.theme.colors[cell.type], cell.seed | 0);
      const sq = cell.squash || 0;

      ctx.save();
      if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      if (sq > 0.002) {
        ctx.translate(x + size / 2, y + size);
        ctx.scale(1 + sq * 0.30, 1 - sq * 0.42);
        ctx.translate(-(x + size / 2), -(y + size));
      }
      // 纹理本身已经烘焙了阴影（见 textures.js），这里不再对每格实时算 shadowBlur。
      // 逐格 shadowBlur 是移动端最耗性能的 canvas 操作之一，棋盘越满、每帧要算的格子
      // 越多，这也是"玩着玩着就卡"的主因——改成直接贴图，观感几乎不变但帧时间大幅下降。
      ctx.drawImage(tex, x, y, size, size);

      // 像素级硬边高光，增强清晰度但保留石纹细节
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 3.5);
      ctx.lineTo(x + size - 5, y + 3.5);
      ctx.moveTo(x + 3.5, y + 4);
      ctx.lineTo(x + 3.5, y + size - 5);
      ctx.stroke();
      ctx.restore();

      if (cell.special) this._specialIcon(ctx, x, y, size, cell.special);

      // 消除前的白热发光
      if (opts && opts.glow > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = opts.glow * 0.85;
        ctx.fillStyle = '#fff3d0';
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        ctx.restore();
      }
      // 消除前的裂纹加深
      if (opts && opts.crack > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, opts.crack);
        ctx.strokeStyle = 'rgba(20,6,4,0.92)';
        ctx.lineWidth = 1.6 + opts.crack * 1.4;
        ctx.lineCap = 'round';
        const cx = x + size / 2, cy = y + size / 2;
        const k = Math.min(1, opts.crack) * size * 0.52;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * 6.2832 + (cell.seed % 1) * 3;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    _specialIcon(ctx, x, y, size, kind) {
      const cx = x + size / 2, cy = y + size / 2;
      const pulse = 0.72 + 0.28 * Math.sin(this.time * 5.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * pulse;
      const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.62);
      gl.addColorStop(0, kind === 'star' ? '#ffe9a8' : (kind === 'laser' ? '#9be8ff' : '#ffb060'));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const s = size * 0.30 * pulse;
      if (kind === 'bomb') {
        ctx.fillStyle = 'rgba(18,10,8,0.92)';
        ctx.beginPath(); ctx.arc(0, s * 0.18, s * 0.78, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = '#ffcf8a';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.5);
        ctx.quadraticCurveTo(s * 0.9, -s * 1.0, s * 0.55, -s * 1.5);
        ctx.stroke();
        ctx.fillStyle = '#fff0b0';
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 1.55, 2.3 * pulse, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.12, s * 0.20, 0, 6.2832); ctx.fill();
      } else if (kind === 'laser') {
        ctx.strokeStyle = '#d8f6ff';
        ctx.lineWidth = 2.6;
        ctx.shadowColor = '#6fd8ff'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.15); ctx.lineTo(0, s * 1.15);
        ctx.moveTo(-s * 0.5, -s * 0.62); ctx.lineTo(0, -s * 1.18); ctx.lineTo(s * 0.5, -s * 0.62);
        ctx.moveTo(-s * 0.5, s * 0.62); ctx.lineTo(0, s * 1.18); ctx.lineTo(s * 0.5, s * 0.62);
        ctx.stroke();
      } else if (kind === 'star') {
        ctx.fillStyle = '#fff3c4';
        ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 10;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 6.2832 - Math.PI / 2;
          const r = i % 2 === 0 ? s * 1.15 : s * 0.42;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    drawBoard(board, spawnRows, flashRows, flashGlow, crackAmt) {
      const flashSet = flashRows && flashRows.length ? new Set(flashRows) : null;
      for (let r = spawnRows; r < board.grid.length; r++) {
        const vr = r - spawnRows;
        const row = board.grid[r];
        for (let c = 0; c < this.cols; c++) {
          const cell = row[c];
          if (!cell) continue;
          const hot = flashSet && flashSet.has(r);
          this._brick(cell, c, vr, hot ? { glow: flashGlow, crack: crackAmt } : null);
        }
      }
    }

    drawPiece(piece, colors, spawnRows, alpha) {
      const ctx = this.ctx;
      const cells = piece.cells();
      const color = colors[piece.type];
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i][0], c = cells[i][1];
        const vr = r - spawnRows;
        if (vr < -1) continue;
        const x = this.px(c), y = this.py(vr);
        const tex = this.tex.brick(color, (r * 13 + c * 7 + i));
        ctx.save();
        const a = alpha !== undefined ? alpha : 1;
        ctx.globalAlpha = a;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.drawImage(tex, x, y, this.cell, this.cell);

        // 当前下落方块仅保留细边光，不覆盖砖块表面
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * 0.58;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(x + 3.5, y + 3.5, this.cell - 7, this.cell - 7);

        const sp = piece.specials && piece.specials[i];
        if (sp) this._specialIcon(ctx, x, y, this.cell, sp);
        ctx.restore();
      }
    }

    drawGhost(piece, dropDist, colors, spawnRows) {
      const ctx = this.ctx;
      const cells = piece.cells(piece.rot, piece.row + dropDist, piece.col);
      const color = colors[piece.type];
      const pulse = 0.55 + 0.35 * Math.sin(this.time * 4.4);  // 更强的脉动
      
      ctx.save();
      for (let i = 0; i < cells.length; i++) {
        const vr = cells[i][0] - spawnRows;
        if (vr < 0) continue;
        const x = this.px(cells[i][1]), y = this.py(vr);
        
        // 半透明彩色填充
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse * 0.25;
        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y + 2, this.cell - 4, this.cell - 4);
        
        // 彩色虚线框
        ctx.globalAlpha = pulse * 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /** 硬降拖影 */
    drawTrail(trail, colors, spawnRows) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const t of trail) {
        const a = t.life / t.maxLife;
        ctx.globalAlpha = a * 0.30;
        ctx.fillStyle = colors[t.type];
        for (const rc of t.cells) {
          const vr = rc[0] - spawnRows;
          if (vr < 0) continue;
          ctx.fillRect(this.px(rc[1]) + 2, this.py(vr) + 2, this.cell - 4, this.cell - 4);
        }
      }
      ctx.restore();
    }

    drawFrameOverlay(heat) {
      const ctx = this.ctx;
      if (this.frameTex) ctx.drawImage(this.frameTex, 0, 0);
      if (heat > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 4.2);
        ctx.globalAlpha = Math.min(0.9, heat * pulse);
        ctx.strokeStyle = this.theme.glow;
        ctx.lineWidth = 6;
        ctx.shadowColor = this.theme.glow;
        ctx.shadowBlur = 22 + heat * 26;
        ctx.strokeRect(this.frame - 3, this.frame - 3, this.playW + 6, this.playH + 6);
        ctx.restore();
      }
    }

    clipPlayfield(ctx) {
      ctx.beginPath();
      ctx.rect(this.frame, this.frame, this.playW, this.playH);
      ctx.clip();
    }

    drawNextPreview(canvas, type, colors, opts) {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(3, global.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || parseInt(canvas.style.width) || canvas.width;
      const cssH = canvas.clientHeight || parseInt(canvas.style.height) || canvas.height;
      if (canvas.width !== Math.floor(cssW * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, cssW, cssH);
      if (!type) return;
      const core = global.BFCore;
      const shape = core.PIECES[type].rotations[0];
      const rs = shape.map((s) => s[0]), cs = shape.map((s) => s[1]);
      const minR = Math.min.apply(null, rs), maxR = Math.max.apply(null, rs);
      const minC = Math.min.apply(null, cs), maxC = Math.max.apply(null, cs);
      const bw = maxC - minC + 1, bh = maxR - minR + 1;
      const pad = (opts && opts.pad) || 10;
      const cell = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh, this.cell);
      const offX = (cssW - bw * cell) / 2, offY = (cssH - bh * cell) / 2;
      const color = colors[type];
      ctx.save();
      if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      shape.forEach(function (rc, i) {
        const x = offX + (rc[1] - minC) * cell;
        const y = offY + (rc[0] - minR) * cell;
        ctx.drawImage(this.tex.brick(color, i * 3 + 1), x, y, cell, cell);
      }, this);
      ctx.restore();
    }
  }

  global.BFRender = { BoardRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
