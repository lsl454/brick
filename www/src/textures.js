// textures.js — 程序化预渲染立体石砖纹理（离屏canvas缓存，避免每帧重绘细节）
(function (global) {
  'use strict';

  const SS = 4;            // 4倍超采样：缩放后仍保持清晰锐利
  const VARIANTS = 5;      // 每种颜色的纹理变体数量

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (clamp(r|0,0,255) << 16) + (clamp(g|0,0,255) << 8) + clamp(b|0,0,255)).toString(16).slice(1);
  }
  function shade(hex, amt) {
    const c = hexToRgb(hex);
    return rgbToHex(c.r + amt, c.g + amt, c.b + amt);
  }
  function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  // 确定性伪随机，保证同一变体的纹理稳定
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** 绘制高清立体石砖：清晰斜面、硬边高光、深色侧面与细微石纹 */
  function renderBrick(color, size, variant) {
    const S = size * SS;
    const cv = newCanvas(S, S);
    const g = cv.getContext('2d', { alpha: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';

    const rnd = mulberry32(variant * 7919 + 13);
    const gap = 1.15 * SS;
    const x0 = gap, y0 = gap;
    const w = S - gap * 2, h = S - gap * 2;
    const bevel = 4.8 * SS;
    const radius = 2.2 * SS;
    const tint = (rnd() - 0.5) * 8;
    const base = shade(color, tint);

    function roundRect(ctx, x, y, rw, rh, r) {
      const rr = Math.min(r, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + rw - rr, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + rr);
      ctx.lineTo(x + rw, y + rh - rr);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rr, y + rh);
      ctx.lineTo(x + rr, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }

    // 紧凑硬阴影：避免大范围模糊造成灰蒙感
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.92)';
    g.shadowBlur = 1.6 * SS;
    g.shadowOffsetX = 1.0 * SS;
    g.shadowOffsetY = 1.8 * SS;
    g.fillStyle = 'rgba(0,0,0,0.88)';
    roundRect(g, x0, y0, w, h, radius);
    g.fill();
    g.restore();

    // 主体基底
    const body = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
    body.addColorStop(0, shade(base, 42));
    body.addColorStop(0.28, shade(base, 18));
    body.addColorStop(0.58, base);
    body.addColorStop(1, shade(base, -42));
    g.fillStyle = body;
    roundRect(g, x0, y0, w, h, radius);
    g.fill();

    g.save();
    roundRect(g, x0, y0, w, h, radius);
    g.clip();

    // 顶部斜面：亮而不泛白
    const topGrad = g.createLinearGradient(0, y0, 0, y0 + bevel);
    topGrad.addColorStop(0, shade(base, 92));
    topGrad.addColorStop(1, shade(base, 34));
    g.fillStyle = topGrad;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + w, y0);
    g.lineTo(x0 + w - bevel, y0 + bevel);
    g.lineTo(x0 + bevel, y0 + bevel);
    g.closePath();
    g.fill();

    // 左侧亮面
    const leftGrad = g.createLinearGradient(x0, 0, x0 + bevel, 0);
    leftGrad.addColorStop(0, shade(base, 68));
    leftGrad.addColorStop(1, shade(base, 18));
    g.fillStyle = leftGrad;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + bevel, y0 + bevel);
    g.lineTo(x0 + bevel, y0 + h - bevel);
    g.lineTo(x0, y0 + h);
    g.closePath();
    g.fill();

    // 右侧深色侧面
    const rightGrad = g.createLinearGradient(x0 + w - bevel, 0, x0 + w, 0);
    rightGrad.addColorStop(0, shade(base, -30));
    rightGrad.addColorStop(1, shade(base, -92));
    g.fillStyle = rightGrad;
    g.beginPath();
    g.moveTo(x0 + w, y0);
    g.lineTo(x0 + w, y0 + h);
    g.lineTo(x0 + w - bevel, y0 + h - bevel);
    g.lineTo(x0 + w - bevel, y0 + bevel);
    g.closePath();
    g.fill();

    // 底部深色侧面
    const bottomGrad = g.createLinearGradient(0, y0 + h - bevel, 0, y0 + h);
    bottomGrad.addColorStop(0, shade(base, -32));
    bottomGrad.addColorStop(1, shade(base, -100));
    g.fillStyle = bottomGrad;
    g.beginPath();
    g.moveTo(x0, y0 + h);
    g.lineTo(x0 + w, y0 + h);
    g.lineTo(x0 + w - bevel, y0 + h - bevel);
    g.lineTo(x0 + bevel, y0 + h - bevel);
    g.closePath();
    g.fill();

    // 中间正面：局部高光，保持色彩饱和
    const faceX = x0 + bevel;
    const faceY = y0 + bevel;
    const faceW = w - bevel * 2;
    const faceH = h - bevel * 2;
    const face = g.createRadialGradient(
      faceX + faceW * 0.30, faceY + faceH * 0.22, 0,
      faceX + faceW * 0.48, faceY + faceH * 0.48, faceW * 0.95
    );
    face.addColorStop(0, shade(base, 34));
    face.addColorStop(0.48, shade(base, 8));
    face.addColorStop(1, shade(base, -26));
    g.fillStyle = face;
    g.fillRect(faceX, faceY, faceW, faceH);

    // 内框使正面与斜面分层更清楚
    g.strokeStyle = 'rgba(255,255,255,0.30)';
    g.lineWidth = 0.75 * SS;
    g.strokeRect(faceX + 0.45 * SS, faceY + 0.45 * SS,
                 faceW - 0.9 * SS, faceH - 0.9 * SS);
    g.strokeStyle = 'rgba(0,0,0,0.48)';
    g.lineWidth = 0.9 * SS;
    g.beginPath();
    g.moveTo(faceX, faceY + faceH);
    g.lineTo(faceX + faceW, faceY + faceH);
    g.lineTo(faceX + faceW, faceY);
    g.stroke();

    // 石材颗粒：少量、细小、清晰，不覆盖主体颜色
    for (let i = 0; i < 12; i++) {
      const px = faceX + rnd() * faceW;
      const py = faceY + rnd() * faceH;
      const rr = (0.18 + rnd() * 0.48) * SS;
      g.fillStyle = rnd() < 0.62 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';
      g.fillRect(px, py, rr, rr);
    }

    // 每个变体加入短裂纹，强化石砖质感
    const crackCount = 1 + (variant % 2);
    g.lineCap = 'round';
    for (let c = 0; c < crackCount; c++) {
      let px = faceX + faceW * (0.28 + rnd() * 0.44);
      let py = faceY + faceH * (0.26 + rnd() * 0.45);
      g.beginPath();
      g.moveTo(px, py);
      const segs = 2 + (rnd() * 2 | 0);
      for (let k = 0; k < segs; k++) {
        px += (rnd() - 0.5) * 3.4 * SS;
        py += (1.2 + rnd() * 2.0) * SS;
        g.lineTo(px, py);
      }
      g.strokeStyle = 'rgba(30,8,12,0.44)';
      g.lineWidth = 0.55 * SS;
      g.stroke();
      g.translate(-0.35 * SS, -0.35 * SS);
      g.strokeStyle = 'rgba(255,255,255,0.20)';
      g.lineWidth = 0.28 * SS;
      g.stroke();
      g.translate(0.35 * SS, 0.35 * SS);
    }

    // 细窄镜面高光
    const shine = g.createLinearGradient(faceX, faceY, faceX + faceW, faceY + faceH);
    shine.addColorStop(0, 'rgba(255,255,255,0.26)');
    shine.addColorStop(0.22, 'rgba(255,255,255,0.05)');
    shine.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(faceX, faceY, faceW, faceH);
    g.restore();

    // 双层硬边：外黑线分隔砖缝，内亮线提升锐度
    g.strokeStyle = 'rgba(0,0,0,0.98)';
    g.lineWidth = 1.15 * SS;
    roundRect(g, x0 + 0.45 * SS, y0 + 0.45 * SS,
              w - 0.9 * SS, h - 0.9 * SS, radius);
    g.stroke();

    g.strokeStyle = 'rgba(255,255,255,0.46)';
    g.lineWidth = 0.48 * SS;
    g.beginPath();
    g.moveTo(x0 + radius, y0 + 1.1 * SS);
    g.lineTo(x0 + w - radius, y0 + 1.1 * SS);
    g.moveTo(x0 + 1.1 * SS, y0 + radius);
    g.lineTo(x0 + 1.1 * SS, y0 + h - radius);
    g.stroke();

    return cv;
  }

  /** 幽灵（落点虚影）纹理 - 彩色发光虚线框 */
  function renderGhost(color, size) {
    const S = size * SS;
    const cv = newCanvas(S, S);
    const g = cv.getContext('2d');
    const gap = 2 * SS;
    
    // 内填：半透明原色
    g.fillStyle = rgba(color, 0.20);
    g.fillRect(gap, gap, S - gap * 2, S - gap * 2);
    
    // 虚线边框：用原色 + 更粗 + 发光效果
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = color;
    g.lineWidth = 2.4 * SS;
    g.setLineDash([5 * SS, 4 * SS]);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeRect(gap, gap, S - gap * 2, S - gap * 2);
    g.setLineDash([]);
    g.restore();
    
    // 外围辉光
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    g.strokeStyle = color;
    g.lineWidth = 3.8 * SS;
    g.strokeRect(gap - 1.2 * SS, gap - 1.2 * SS, S - gap * 2 + 2.4 * SS, S - gap * 2 + 2.4 * SS);
    g.restore();
    
    return cv;
  }

  class TextureFactory {
    constructor(size) {
      this.size = size;
      this.cache = new Map();
      this.ghostCache = new Map();
    }
    brick(color, variant) {
      const v = ((variant | 0) % VARIANTS + VARIANTS) % VARIANTS;
      const key = color + '|' + v;
      let tex = this.cache.get(key);
      if (!tex) { tex = renderBrick(color, this.size, v); this.cache.set(key, tex); }
      return tex;
    }
    ghost(color) {
      let tex = this.ghostCache.get(color);
      if (!tex) { tex = renderGhost(color, this.size); this.ghostCache.set(color, tex); }
      return tex;
    }
    /** 预热：提前生成全部纹理，避免游戏中途卡顿 */
    warmup(colors) {
      colors.forEach((c) => {
        for (let v = 0; v < VARIANTS; v++) this.brick(c, v);
        this.ghost(c);
      });
    }
  }

  global.BFTex = { TextureFactory, shade, mix, rgba, hexToRgb, rgbToHex, mulberry32, newCanvas, VARIANTS };
})(typeof window !== 'undefined' ? window : globalThis);
