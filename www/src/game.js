// game.js — 主控制器
(function () {
  'use strict';

  const core = window.BFCore;
  const Themes = window.BFThemes;

  const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const IS_MOBILE = IS_TOUCH || window.innerWidth <= 720;
  const FRAME = IS_MOBILE ? 10 : 26;
  function calculateCellSize() {
    if (!IS_MOBILE) return 32;
    const vw = Math.max(280, window.visualViewport ? window.visualViewport.width : window.innerWidth);
    const vh = Math.max(520, window.visualViewport ? window.visualViewport.height : window.innerHeight);
    const byWidth = Math.floor((vw - 14 - FRAME * 2) / core.COLS);
    const byHeight = Math.floor((vh - 150 - FRAME * 2) / core.ROWS);
    return Math.max(22, Math.min(40, byWidth, byHeight));
  }
  const CELL = calculateCellSize();
  const HS_KEY = 'brickfall2_best';

  // 手感参数
  const DAS = 150, ARR = 30, SOFT_ARR = 34;
  const LOCK_DELAY = 0.5, MAX_LOCK_RESET = 15;
  const FLASH_TIME = 0.34;      // 满行发光/裂纹时长
  const SETTLE_TIME = 0.10;     // 全部落稳后的缓冲
  const CELL_GRAV = 2400;       // 砖块独立下落加速度 px/s²

  const LINES_PER_LEVEL = 12;
  const MAX_LEVEL = 20;
  const LINE_SCORE = { 1: 100, 2: 300, 3: 500, 4: 800 };
  const TSPIN_SCORE = { 0: 400, 1: 800, 2: 1200, 3: 1600 };
  const TSPIN_MINI_SCORE = { 0: 100, 1: 200, 2: 400, 3: 400 };

  function chainMult(n) { return n <= 1 ? 1 : n === 2 ? 1.5 : n === 3 ? 2 : 3; }
  function chainLabel(n) {
    return n <= 1 ? 'CLEAR' : n === 2 ? 'COMBO 2' : n === 3 ? 'COMBO 3' : 'AMAZING COMBO';
  }
  function loadBest() {
    try { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor() {
      this.bg = new window.BFBackground($('bgCanvas'));
      this.rd = new window.BFRender.BoardRenderer($('boardCanvas'), {
        cell: CELL, frame: FRAME, cols: core.COLS, rows: core.ROWS,
      });
      this.fx = new window.BFEffects();
      this.fx.floorY = FRAME + core.ROWS * CELL - 2;
      this.audio = new window.BFAudio();

      this.best = loadBest();
      this.state = 'menu';           // menu | how | countdown | playing | paused | over
      this.phase = 'falling';        // falling | flash | gravity | settle
      this.theme = Themes.themeForLevel(1);
      this.rd.setTheme(this.theme);
      this.bg.setTheme(this.theme);
      this.rd.tex.warmup(Object.keys(this.theme.colors).map((k) => this.theme.colors[k]));

      this.board = new core.Board();
      this.queue = [];
      this.piece = null;
      this.holdType = null;
      this.holdUsed = false;
      this.trail = [];

      this.keys = {};
      this.dasTimer = { left: 0, right: 0, down: 0 };
      this.displayScore = 0;
      this.dangerLevel = 0;
      this.warnTimer = 0;

      this.resetRun();
      this.bindUI();
      this.bindKeys();
      this.bindTouchControls();
      this.bindPanel();
      this.syncUI(true);
      this.showOverlay('ovMenu');
      this.fit();
      window.addEventListener('resize', () => { this.bg.resize(); this.fit(); });
      window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(true); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause(true);
      });

      this.last = 0;
      requestAnimationFrame((t) => this.loop(t));
    }

    // ---------------- 布局自适应 ----------------
    fit() {
      const st = $('stage');
      st.style.transform = 'none';
      st.style.transformOrigin = 'top center';
      document.body.style.height = '';
      const wrap = $('boardWrap').getBoundingClientRect();
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      this.bg.setFocus((wrap.left + wrap.width / 2) / vw,
                       (wrap.top + wrap.height / 2) / vh);
    }

    // ---------------- 运行状态 ----------------
    resetRun() {
      this.board = new core.Board();
      this.queue = [];
      this.piece = null;
      this.holdType = null;
      this.holdUsed = false;
      this.trail.length = 0;
      this.score = 0;
      this.displayScore = 0;
      this.lines = 0;
      this.level = 1;
      this.chain = 0;
      this.combo = 0;
      this.b2b = 0;
      this.maxChain = 0;
      this.maxCombo = 0;
      this.stat = { pieces: 0, tetris: 0, tspin: 0, special: 0, perfect: 0 };
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.flashRows = [];
      this.pendingClear = null;
      this.sinceSpecial = 0;
      this.lastActionRotate = false;
      this.dangerLevel = 0;
      this.fx.clear();
      this.applyTheme(1);
    }

    applyTheme(level) {
      const th = Themes.themeForLevel(level);
      if (th.id === this.theme.id) return;
      this.theme = th;
      this.rd.setTheme(th);
      this.bg.setTheme(th);
      this.rd.tex.warmup(Object.keys(th.colors).map((k) => th.colors[k]));
      document.documentElement.style.setProperty('--accent', th.accent);
      document.documentElement.style.setProperty('--accent-2', th.accentSoft);
      this.toast('进入 ' + th.name, th.accentSoft, 22);
    }

    get dropInterval() { return Math.max(0.10, 0.95 * Math.pow(0.87, this.level - 1)); }

    // ---------------- UI 绑定 ----------------
    bindUI() {
      const on = (id, fn) => { const e = $(id); if (e) e.addEventListener("click", () => { this.audio.click(); fn(); }); };
      on("btnStart", () => this.start());
      on("btnHow", () => { this.state = "how"; this.showOverlay("ovHow"); });
      on("btnHowBack", () => { this.state = "menu"; this.showOverlay("ovMenu"); });
      on("btnResume", () => this.pause(false));
      on("btnRestartPause", () => this.start());
      on("btnHomePause", () => this.home());
      on("btnAgain", () => this.start());
      on("btnHomeOver", () => this.home());
      on("btnRestartSide", () => { if (this.state !== "menu" && this.state !== "how") this.start(); });
      $("btnPause").addEventListener("click", () => this.pause());
      $("btnSfx").addEventListener("click", () => this.toggleSfx());
      $("btnMusic").addEventListener("click", () => this.toggleMusic());
    }

    bindPanel() {
      const open = $("btnPanel");
      const close = $("btnClosePanel");
      const panel = $("sidePanel");
      const backdrop = $("panelBackdrop");
      if (!open || !close || !panel || !backdrop) return;

      const closePanel = () => {
        panel.hidden = true;
        backdrop.hidden = true;
        document.body.classList.remove("panel-open");
        if (this.state === "panel-frozen" && this.panelFrozenState) {
          this.state = this.panelFrozenState;
        }
        this.panelFrozenState = null;
      };

      const openPanel = () => {
        if (this.state === "playing" || this.state === "countdown") {
          this.panelFrozenState = this.state;
          this.state = "panel-frozen";
        }
        panel.hidden = false;
        backdrop.hidden = false;
        document.body.classList.add("panel-open");
      };

      this.openPanel = openPanel;
      this.closePanel = closePanel;
      open.addEventListener("click", () => {
        this.audio.click();
        panel.hidden ? openPanel() : closePanel();
      });
      close.addEventListener("click", () => { this.audio.click(); closePanel(); });
      backdrop.addEventListener("click", closePanel);
    }

    setPanelIcon(id, value) {
      const button = $(id);
      if (!button) return;
      const icon = button.querySelector("span");
      if (icon) icon.textContent = value;
      else button.textContent = value;
    }

    toggleSfx() {
      const m = this.audio.toggleMute();
      this.setPanelIcon('btnSfx', m ? '🔇' : '🔊');
      $('btnSfx').classList.toggle('off', m);
      if (!m) this.audio.click();
    }
    toggleMusic() {
      const on = this.audio.toggleMusic();
      $('btnMusic').classList.toggle('off', !on);
    }

    showOverlay(id) {
      ['ovMenu', 'ovHow', 'ovPause', 'ovOver'].forEach((k) => { $(k).hidden = (k !== id); });
    }
    hideOverlays() { ['ovMenu', 'ovHow', 'ovPause', 'ovOver'].forEach((k) => { $(k).hidden = true; }); }

    // ---------------- 输入 ----------------
    bindKeys() {
      const blocked = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space',
        'KeyA','KeyD','KeyS','KeyW','KeyZ','KeyQ','KeyC','KeyP','KeyR','KeyM','KeyN','Escape','ShiftLeft']);
      window.addEventListener('keydown', (e) => {
        if (blocked.has(e.code)) e.preventDefault();
        if (e.repeat) return;
        this.keys[e.code] = true;
        this.onKey(e.code);
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }


    bindTouchControls() {
      const vibrate = (ms) => {
        try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
      };

      const bindContinuous = (id, code) => {
        const el = $(id);
        if (!el) return;
        let pointerId = null;
        const release = (e) => {
          if (pointerId !== null && e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
          this.keys[code] = false;
          el.classList.remove('pressed');
          pointerId = null;
        };
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (pointerId !== null) return;
          pointerId = e.pointerId;
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
          el.classList.add('pressed');
          this.keys[code] = true;
          this.onKey(code);
          vibrate(7);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => {
          el.addEventListener(name, release);
        });
      };

      const bindAction = (id, fn) => {
        const el = $(id);
        if (!el) return;
        const release = () => el.classList.remove('pressed');
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
          el.classList.add('pressed');
          fn();
          vibrate(9);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => {
          el.addEventListener(name, release);
        });
      };

      bindContinuous('touchLeft', 'ArrowLeft');
      bindContinuous('touchDown', 'ArrowDown');
      bindContinuous('touchRight', 'ArrowRight');
      bindAction('touchRotateCCW', () => this.rotate(-1));
      bindAction('touchRotateCW', () => this.rotate(1));
      bindAction('touchHold', () => this.hold());
      bindAction('touchDrop', () => this.hardDrop());
      bindAction('touchPause', () => this.pause());

      const board = $('boardCanvas');
      if (!board) return;
      let gesture = null;
      board.addEventListener('pointerdown', (e) => {
        if (this.state !== 'playing') return;
        e.preventDefault();
        try { board.setPointerCapture(e.pointerId); } catch (err) {}
        gesture = {
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          startTime: performance.now(),
          moved: false,
          softSteps: 0,
        };
      });
      board.addEventListener('pointermove', (e) => {
        if (!gesture || gesture.id !== e.pointerId || !this.canControl()) return;
        e.preventDefault();
        const dx = e.clientX - gesture.lastX;
        const dy = e.clientY - gesture.lastY;
        const stepX = Math.max(16, CELL * 0.72);
        const stepY = Math.max(14, CELL * 0.62);

        if (Math.abs(dx) >= stepX && Math.abs(dx) > Math.abs(dy) * 0.7) {
          const count = Math.min(3, Math.max(1, Math.floor(Math.abs(dx) / stepX)));
          for (let i = 0; i < count; i++) this.move(dx > 0 ? 1 : -1);
          gesture.lastX = e.clientX;
          gesture.moved = true;
          vibrate(4);
        }
        if (dy >= stepY && Math.abs(dy) > Math.abs(dx) * 0.65) {
          const count = Math.min(4, Math.max(1, Math.floor(dy / stepY)));
          for (let i = 0; i < count; i++) this.softDrop();
          gesture.softSteps += count;
          gesture.lastY = e.clientY;
          gesture.moved = true;
        }
      });
      const endGesture = (e) => {
        if (!gesture || (e && e.pointerId !== undefined && gesture.id !== e.pointerId)) return;
        const g = gesture;
        gesture = null;
        const endX = e && e.clientX !== undefined ? e.clientX : g.lastX;
        const endY = e && e.clientY !== undefined ? e.clientY : g.lastY;
        const totalX = endX - g.startX;
        const totalY = endY - g.startY;
        const elapsed = performance.now() - g.startTime;
        const distance = Math.hypot(totalX, totalY);

        if (this.canControl() && totalY > CELL * 2.2 && Math.abs(totalY) > Math.abs(totalX) * 1.25 && elapsed < 430) {
          this.hardDrop();
          vibrate(16);
        } else if (this.canControl() && distance < 12 && elapsed < 280) {
          this.rotate(1);
          vibrate(8);
        }
      };
      board.addEventListener('pointerup', endGesture);
      board.addEventListener('pointercancel', endGesture);
      board.addEventListener('lostpointercapture', endGesture);
      board.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    held(...codes) { return codes.some((c) => this.keys[c]); }

    onKey(code) {
      if (code === 'KeyM') { this.toggleSfx(); return; }
      if (code === 'KeyN') { this.toggleMusic(); return; }
      if (this.closePanel && !$("sidePanel").hidden && code === 'Escape') { this.closePanel(); return; }

      if (this.state === 'menu') {
        if (code === 'Space' || code === 'Enter') this.start();
        return;
      }
      if (this.state === 'how') {
        if (code === 'Escape' || code === 'Space') { this.state = 'menu'; this.showOverlay('ovMenu'); }
        return;
      }
      if (this.state === 'over') {
        if (code === 'KeyR' || code === 'Space' || code === 'Enter') this.start();
        if (code === 'Escape') this.home();
        return;
      }
      if (code === 'KeyR') { this.start(); return; }
      if (code === 'KeyP' || code === 'Escape') { this.pause(); return; }
      if (this.state !== 'playing') return;

      switch (code) {
        case 'ArrowLeft': case 'KeyA': this.dasTimer.left = -DAS; this.move(-1); break;
        case 'ArrowRight': case 'KeyD': this.dasTimer.right = -DAS; this.move(1); break;
        case 'ArrowDown': case 'KeyS': this.dasTimer.down = 0; this.softDrop(); break;
        case 'ArrowUp': case 'KeyW': this.rotate(1); break;
        case 'KeyZ': case 'KeyQ': this.rotate(-1); break;
        case 'Space': this.hardDrop(); break;
        case 'KeyC': case 'ShiftLeft': this.hold(); break;
      }
    }

    canControl() { return this.state === 'playing' && this.phase === 'falling' && this.piece; }

    move(dir) {
      if (!this.canControl()) return;
      if (core.tryMove(this.board, this.piece, 0, dir)) {
        this.audio.move();
        this.lastActionRotate = false;
        this.resetLock();
      }
    }
    softDrop() {
      if (!this.canControl()) return;
      if (core.tryMove(this.board, this.piece, 1, 0)) {
        this.score += 1;
        this.dropTimer = 0;
        this.lastActionRotate = false;
        this.audio.softDrop();
      }
    }
    rotate(dir) {
      if (!this.canControl()) return;
      if (core.tryRotate(this.board, this.piece, dir)) {
        this.audio.rotate();
        this.lastActionRotate = true;
        this.resetLock();
      } else {
        this.audio.deny();
      }
    }
    hardDrop() {
      if (!this.canControl()) return;
      const d = core.hardDropDistance(this.board, this.piece);
      if (d > 0) {
        // 拖影
        for (let k = 0; k < d; k += 1) {
          this.trail.push({
            cells: this.piece.cells(this.piece.rot, this.piece.row + k, this.piece.col),
            type: this.piece.type, life: 0.22 - k * 0.004, maxLife: 0.22,
          });
        }
        this.piece.row += d;
        this.score += d * 2;
        this.lastActionRotate = false;
      }
      this.audio.hardDrop();
      this.fx.shake(4 + Math.min(11, d));
      this.lockPiece();
    }
    hold() {
      if (!this.canControl() || this.holdUsed) { if (this.holdUsed) this.audio.deny(); return; }
      const cur = this.piece.type;
      if (this.holdType === null) { this.holdType = cur; this.spawn(); }
      else { const t = this.holdType; this.holdType = cur; this.spawn(t); }
      this.holdUsed = true;
      this.audio.hold();
      this.renderHold();
    }
    resetLock() {
      if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESET) {
        this.lockTimer = 0; this.lockResets++;
      }
    }

    // ---------------- 流程 ----------------
    start() {
      this.audio.init();
      if (this.closePanel) this.closePanel();
      this.resetRun();
      this.hideOverlays();
      this.state = 'countdown';
      this.cdValue = 3;
      this.cdTimer = 0;
      this.setPanelIcon('btnPause', '❚❚');
      $('countdown').hidden = false;
      $('cdText').textContent = '3';
      this.audio.countdown(3);
      this.fillQueue();
      this.renderQueue();
      this.renderHold();
      this.syncUI(true);
    }
    home() {
      if (this.closePanel) this.closePanel();
      this.state = 'menu';
      $('countdown').hidden = true;
      this.fx.clear();
      this.syncUI(true);
      this.showOverlay('ovMenu');
    }
    pause(force) {
      if (this.closePanel) this.closePanel();
      if (this.state === 'playing' && force !== false) {
        this.state = 'paused';
        this.showOverlay('ovPause');
        this.setPanelIcon('btnPause', '▶');
      } else if (this.state === 'paused' && force !== true) {
        this.state = 'countdown';
        this.cdValue = 1; this.cdTimer = 0;
        this.hideOverlays();
        $('countdown').hidden = false;
        $('cdText').textContent = '1';
        this.setPanelIcon('btnPause', '❚❚');
      }
    }

    fillQueue() { while (this.queue.length < 6) this.queue.push.apply(this.queue, core.newBag()); }

    rollSpecial() {
      const chance = Math.min(0.20, 0.09 + this.level * 0.005);
      const pity = this.sinceSpecial >= 16;
      if (!pity && Math.random() > chance) return null;
      this.sinceSpecial = 0;
      const r = Math.random();
      return r < 0.45 ? core.SPECIAL.BOMB : (r < 0.80 ? core.SPECIAL.LASER : core.SPECIAL.STAR);
    }

    spawn(forceType) {
      this.fillQueue();
      const type = forceType || this.queue.shift();
      this.fillQueue();
      const p = new core.Piece(type);
      this.sinceSpecial++;
      const sp = this.rollSpecial();
      if (sp) p.specials[(Math.random() * 4) | 0] = sp;
      this.piece = p;
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lastActionRotate = false;
      this.stat.pieces++;
      this.renderQueue();

      if (core.collides(this.board, p, 0, 0, p.rot)) { this.gameOver(); return; }
      this.phase = 'falling';
    }

    lockPiece() {
      const p = this.piece;
      const tspin = this.lastActionRotate ? core.detectTSpin(this.board, p) : 'none';
      const cells = p.cells();
      this.board.lockCells(cells, p.type, p.specials);

      // 落地冲击：压缩 + 灰尘
      for (const rc of cells) {
        const row = this.board.grid[rc[0]];
        const cell = row ? row[rc[1]] : null;
        if (cell) cell.squash = 0.26;
        const vr = rc[0] - core.SPAWN_ROWS;
        if (vr >= -1) this.fx.dust(this.rd.px(rc[1]) + CELL / 2, this.rd.py(vr + 1), 3, 0.7);
      }
      this.audio.land();
      this.fx.shake(2.2);
      this.piece = null;
      this.holdUsed = false;

      // Lock out：方块完全锁死在隐藏缓冲区内 → 顶出
      if (cells.every((rc) => rc[0] < core.SPAWN_ROWS)) { this.gameOver(); return; }

      const full = this.board.findFullRows();
      if (full.length) {
        this.chain = 1;
        this.combo++;
        this.pendingTspin = tspin;
        this.startFlash(full);
      } else {
        this.chain = 0;
        this.combo = 0;
        this.pendingTspin = 'none';
        if (tspin !== 'none') { this.toast('T-SPIN', '#ff7ab0', 26); this.audio.tspin(); this.addScore(TSPIN_MINI_SCORE[0]); }
        this.spawn();
      }
      this.syncUI();
    }

    startFlash(rows) {
      this.flashRows = rows;
      this.phase = 'flash';
      this.phaseTimer = 0;
      this.audio.lineAlert();
      const x0 = this.rd.frame, x1 = this.rd.frame + this.rd.playW;
      rows.forEach((r) => {
        const vr = r - core.SPAWN_ROWS;
        if (vr < 0) return;
        this.fx.beam(this.rd.py(vr) + CELL / 2, {
          a: x0, b: x1, h: CELL * 1.5, dur: FLASH_TIME + 0.12, color: this.theme.accentSoft,
        });
      });
    }

    /** 闪烁结束 → 真正执行破坏 + 独立坍塌 */
    resolveClear() {
      const rows = this.flashRows.slice();
      const res = this.board.resolveDestruction(rows);
      const lineCount = rows.length;
      const extra = res.list.length - lineCount * core.COLS;

      // --- 特殊砖块的专属特效 ---
      res.specials.forEach((s) => {
        const vr = s.r - core.SPAWN_ROWS;
        const cx = this.rd.px(s.c) + CELL / 2;
        const cy = this.rd.py(vr) + CELL / 2;
        this.stat.special++;
        if (s.kind === core.SPECIAL.BOMB) {
          this.audio.explode();
          this.fx.shockwave(cx, cy, { rMax: CELL * 4.2, dur: 0.55, color: '#ffb166', width: 7 });
          this.fx.sparks(cx, cy, 34, 1.5);
          this.fx.smoke(cx, cy, 8);
          this.fx.shake(15);
          this.fx.screenFlash(0.30, '#ffb070');
        } else if (s.kind === core.SPECIAL.LASER) {
          this.audio.laser();
          this.fx.beamV(cx, { a: this.rd.frame, b: this.rd.frame + this.rd.playH, h: CELL * 1.3, dur: 0.42, color: '#bfeaff' });
          this.fx.sparks(cx, cy, 22, 1.3);
          this.fx.shake(9);
        } else if (s.kind === core.SPECIAL.STAR) {
          this.audio.star();
          this.fx.shockwave(cx, cy, { rMax: CELL * 7, dur: 0.7, color: '#ffe9a8', width: 5 });
          this.fx.screenFlash(0.34, '#ffeab0');
          this.fx.shake(12);
        }
      });

      // --- 碎裂粒子 ---
      const colors = this.theme.colors;
      res.list.forEach((it) => {
        const vr = it.r - core.SPAWN_ROWS;
        if (vr < 0) return;
        const cx = this.rd.px(it.c) + CELL / 2;
        const cy = this.rd.py(vr) + CELL / 2 - (it.cell.animOffset || 0);
        const power = it.cause === 'line' ? 1 : 1.35;
        this.fx.debris(cx, cy, colors[it.cell.type], 9, power);
        this.fx.dust(cx, cy, 3, 1);
        if (Math.random() < 0.45) this.fx.embers(cx, cy, 2);
        if (Math.random() < 0.3) this.fx.sparks(cx, cy, 4, 0.8);
      });

      // 行中心冲击波
      rows.forEach((r) => {
        const vr = r - core.SPAWN_ROWS;
        if (vr < 0) return;
        this.fx.shockwave(this.rd.frame + this.rd.playW / 2, this.rd.py(vr) + CELL / 2,
          { rMax: this.rd.playW * 0.78, dur: 0.5, color: this.theme.accentSoft, width: 5, squashY: 0.34 });
      });

      this.board.removeCells(res.list);

      // --- 独立重力坍塌：每块砖各自计算落点 ---
      const moves = this.board.collapseColumns();
      moves.forEach((m) => {
        m.cell.animOffset = (m.toRow - m.fromRow) * CELL;
        m.cell.fallVel = 0;
        m.cell.falling = true;
      });

      this.scoreClear(lineCount, extra, res.specials.length);

      this.audio.crack(Math.min(3, lineCount));
      this.fx.shake(7 + lineCount * 3 + this.chain * 2.5);
      this.fx.screenFlash(0.16 + lineCount * 0.05);
      this.fx.slowmo(lineCount >= 4 || this.chain >= 3 ? 0.35 : 0.62, 0.09);
      this.bg.pulse(0.30 + lineCount * 0.10 + this.chain * 0.12);

      this.flashRows = [];
      this.phase = 'gravity';
      this.phaseTimer = 0;
      this.landAudioCooldown = 0;
    }

    scoreClear(lineCount, extraCells, specialCount) {
      const tsp = this.pendingTspin || 'none';
      let base;
      let label = null;
      if (tsp === 'full') {
        base = TSPIN_SCORE[lineCount] || TSPIN_SCORE[3];
        label = lineCount >= 3 ? 'T-SPIN TRIPLE' : lineCount === 2 ? 'T-SPIN DOUBLE' : 'T-SPIN SINGLE';
        this.stat.tspin++;
      } else if (tsp === 'mini') {
        base = TSPIN_MINI_SCORE[lineCount] || 400;
        label = 'T-SPIN MINI';
        this.stat.tspin++;
      } else {
        base = LINE_SCORE[lineCount] || lineCount * 260;
        if (lineCount >= 4) { label = 'TETRIS'; this.stat.tetris++; }
      }
      this.pendingTspin = 'none';

      const difficult = lineCount >= 4 || tsp !== 'none';
      let mult = chainMult(this.chain);
      if (difficult && this.b2b > 0) mult *= 1.5;
      const lvMult = 1 + (this.level - 1) * 0.10;
      let gain = Math.round(base * mult * lvMult);
      gain += extraCells * 32;                 // 特殊砖额外摧毁奖励
      gain += Math.max(0, this.combo - 1) * 50; // 连击奖励

      if (difficult) this.b2b++; else if (lineCount > 0) this.b2b = 0;

      this.lines += lineCount;
      this.addScore(gain);
      this.maxChain = Math.max(this.maxChain, this.chain);
      this.maxCombo = Math.max(this.maxCombo, this.combo);

      // --- 文字反馈 ---
      const cx = this.rd.frame + this.rd.playW / 2;
      const cy = this.rd.frame + this.rd.playH * 0.36;
      if (this.chain >= 2) {
        this.fx.text(cx, cy, chainLabel(this.chain), {
          color: this.chain >= 4 ? '#ff5c88' : this.theme.accentSoft,
          size: 26 + Math.min(16, this.chain * 4), glow: 22, dur: 1.05, scalePop: 1, vy: -18,
        });
        this.audio.combo(this.chain);
      } else if (label) {
        this.fx.text(cx, cy, label, { color: '#ffe0a0', size: 27, glow: 20, dur: 1.0, scalePop: 1, vy: -18 });
      } else {
        this.fx.text(cx, cy, chainLabel(1), { color: this.theme.accentSoft, size: 22, glow: 14, dur: 0.8, scalePop: 1, vy: -20 });
      }
      if (label === 'TETRIS') this.audio.tetris();
      else if (tsp !== 'none') this.audio.tspin();
      else this.audio.clearLines(lineCount);

      if (difficult && this.b2b > 1) {
        this.fx.text(cx, cy + 40, 'BACK-TO-BACK ×1.5', { color: '#ffb46a', size: 15, glow: 14, dur: 1.0, vy: -14 });
      }
      if (specialCount > 0) {
        this.fx.text(cx, cy - 40, specialCount > 1 ? '连环引爆 ×' + specialCount : '特殊砖发动', {
          color: '#ffd08a', size: 15, glow: 12, dur: 0.95, vy: -16,
        });
      }
      this.fx.text(cx, cy + 66, '+' + gain, { color: '#fff0c8', size: 21, glow: 12, dur: 0.95, vy: -46 });

      // 完美清除
      if (this.board.isEmpty()) {
        this.stat.perfect++;
        this.addScore(2500);
        this.audio.perfectClear();
        this.fx.text(cx, cy - 78, 'PERFECT CLEAR', { color: '#a8f0ff', size: 24, glow: 26, dur: 1.5, scalePop: 1, vy: -12 });
        this.fx.screenFlash(0.5, '#bfefff');
        this.fx.shake(20);
        this.bg.pulse(1);
      }

      const newLevel = Math.min(MAX_LEVEL, Math.floor(this.lines / LINES_PER_LEVEL) + 1);
      if (newLevel > this.level) {
        this.level = newLevel;
        this.audio.levelUp();
        this.audio.setMusicTempo(this.level);
        this.applyTheme(this.level);
        this.toast('LEVEL ' + this.level, '#fff0c8', 30);
        this.fx.screenFlash(0.3, this.theme.accentSoft);
      }
      this.syncUI();
    }

    addScore(v) { this.score += v; }

    toast(str, color, size) {
      this.fx.text(this.rd.frame + this.rd.playW / 2, this.rd.frame + this.rd.playH * 0.20, str,
        { color: color || '#ffe0a0', size: size || 22, glow: 18, dur: 1.25, scalePop: 1, vy: -16 });
    }

    /** 所有砖块落稳 → 检查是否形成新满行（连锁） */
    afterSettle() {
      const full = this.board.findFullRows();
      if (full.length) {
        this.chain++;
        this.startFlash(full);
      } else {
        this.chain = 0;
        this.spawn();
        this.syncUI();
      }
    }

    gameOver() {
      this.state = 'over';
      this.piece = null;
      this.audio.gameOver();
      this.fx.shake(20);
      this.fx.screenFlash(0.4, '#ff6a4a');
      let isNew = false;
      if (this.score > this.best) { this.best = this.score; saveBest(this.best); isNew = true; }
      $('ovOverTitle').textContent = isNew ? '新 纪 录 !' : '游 戏 结 束';
      $('ovScore').textContent = this.score.toLocaleString();
      $('ovBest').textContent = this.best.toLocaleString();
      $('ovLevel').textContent = this.level;
      $('ovLines').textContent = this.lines;
      $('ovChain').textContent = this.maxChain;
      $('ovCombo').textContent = this.maxCombo;
      $('ovTetris').textContent = this.stat.tetris;
      $('ovTspin').textContent = this.stat.tspin;
      $('ovSpecial').textContent = this.stat.special;
      this.showOverlay('ovOver');
      this.syncUI(true);
    }

    // ---------------- 主循环 ----------------
    loop(now) {
      let dt = this.last ? (now - this.last) / 1000 : 0.016;
      this.last = now;
      dt = Math.min(0.05, dt);

      this.bg.update(dt);
      this.bg.draw();

      const scaled = dt * this.fx.timeScale;
      this.rd.time += dt;
      this.fx.update(scaled);
      this.updateTrail(scaled);
      this.update(scaled, dt);
      this.draw();
      this.tickUI(dt);

      requestAnimationFrame((t) => this.loop(t));
    }

    updateTrail(dt) {
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }
    }

    update(dt, rawDt) {
      if (this.state === 'countdown') {
        this.cdTimer += rawDt;
        if (this.cdTimer >= 0.62) {
          this.cdTimer = 0;
          this.cdValue--;
          if (this.cdValue > 0) {
            $('cdText').textContent = String(this.cdValue);
            $('cdText').style.animation = 'none';
            void $('cdText').offsetWidth;
            $('cdText').style.animation = '';
            this.audio.countdown(this.cdValue);
          } else if (this.cdValue === 0) {
            $('cdText').textContent = 'GO';
            $('cdText').style.animation = 'none';
            void $('cdText').offsetWidth;
            $('cdText').style.animation = '';
            this.audio.countdown(0);
          } else {
            $('countdown').hidden = true;
            this.state = 'playing';
            if (!this.piece && this.phase === 'falling') this.spawn();
          }
        }
        return;
      }
      if (this.state !== 'playing') { this.updateCells(dt); return; }

      this.handleDAS(rawDt);
      this.updateCells(dt);
      this.updateDanger(dt);

      switch (this.phase) {
        case 'falling': {
          if (!this.piece) break;
          this.dropTimer += dt;
          const grounded = core.collides(this.board, this.piece, 1, 0, this.piece.rot);
          if (grounded) {
            this.lockTimer += dt;
            if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
          } else {
            this.lockTimer = 0;
            if (this.dropTimer >= this.dropInterval) {
              this.dropTimer = 0;
              core.tryMove(this.board, this.piece, 1, 0);
              this.lastActionRotate = false;
            }
          }
          break;
        }
        case 'flash': {
          this.phaseTimer += dt;
          if (this.phaseTimer >= FLASH_TIME) this.resolveClear();
          break;
        }
        case 'gravity': {
          let anyFalling = false;
          const g = this.board.grid;
          for (let r = 0; r < core.TOTAL_ROWS; r++)
            for (let c = 0; c < core.COLS; c++) { const cell = g[r][c]; if (cell && cell.falling) { anyFalling = true; r = core.TOTAL_ROWS; break; } }
          if (!anyFalling) {
            this.phaseTimer += dt;
            if (this.phaseTimer >= SETTLE_TIME) { this.phase = 'settle'; this.afterSettle(); }
          } else {
            this.phaseTimer = 0;
          }
          break;
        }
        default: break;
      }
    }

    /** 每个砖块独立下落 / 落地压缩回弹 */
    updateCells(dt) {
      const g = this.board.grid;
      const grav = CELL_GRAV + this.level * 60;
      if (this.landAudioCooldown > 0) this.landAudioCooldown -= dt;
      for (let r = core.TOTAL_ROWS - 1; r >= 0; r--) {
        const row = g[r];
        for (let c = 0; c < core.COLS; c++) {
          const cell = row[c];
          if (!cell) continue;
          if (cell.falling) {
            cell.fallVel += grav * dt;
            cell.animOffset -= cell.fallVel * dt;
            if (cell.animOffset <= 0) {
              cell.animOffset = 0;
              cell.falling = false;
              cell.squash = Math.min(0.44, cell.fallVel / 1500);
              cell.fallVel = 0;
              const vr = r - core.SPAWN_ROWS;
              if (vr >= 0) {
                this.fx.dust(this.rd.px(c) + CELL / 2, this.rd.py(vr + 1), 3, 0.85);
                if (this.landAudioCooldown <= 0) { this.audio.land(); this.landAudioCooldown = 0.05; }
              }
              this.fx.shake(1.6);
            }
          } else if (cell.squash > 0) {
            cell.squash -= dt * 2.6;
            if (cell.squash < 0) cell.squash = 0;
          }
        }
      }
    }

    updateDanger(dt) {
      const h = this.board.stackHeight();
      const target = Math.max(0, Math.min(1, (h - 14) / 6));
      this.dangerLevel += (target - this.dangerLevel) * Math.min(1, dt * 4);
      $('dangerVig').style.opacity = (this.dangerLevel * 0.85).toFixed(3);
      this.bg.setBaseHeat(this.dangerLevel * 0.5);
      if (this.dangerLevel > 0.5) {
        this.warnTimer -= dt;
        if (this.warnTimer <= 0) { this.audio.warn(); this.warnTimer = 1.1; }
      }
    }

    handleDAS(dt) {
      if (this.phase !== 'falling' || !this.piece) return;
      const ms = dt * 1000;
      if (this.held('ArrowLeft', 'KeyA')) {
        this.dasTimer.left += ms;
        while (this.dasTimer.left >= ARR) { this.dasTimer.left -= ARR; this.move(-1); }
      } else this.dasTimer.left = -DAS;
      if (this.held('ArrowRight', 'KeyD')) {
        this.dasTimer.right += ms;
        while (this.dasTimer.right >= ARR) { this.dasTimer.right -= ARR; this.move(1); }
      } else this.dasTimer.right = -DAS;
      if (this.held('ArrowDown', 'KeyS')) {
        this.dasTimer.down += ms;
        while (this.dasTimer.down >= SOFT_ARR) { this.dasTimer.down -= SOFT_ARR; this.softDrop(); }
      } else this.dasTimer.down = 0;
    }

    // ---------------- 绘制 ----------------
    draw() {
      const rd = this.rd, ctx = rd.ctx, fx = this.fx;
      rd.clear();

      ctx.save();
      ctx.translate(rd.w / 2 + fx.shakeX, rd.h / 2 + fx.shakeY);
      ctx.rotate(fx.shakeAng);
      ctx.translate(-rd.w / 2, -rd.h / 2);

      rd.drawPlayfield(this.dangerLevel);

      ctx.save();
      rd.clipPlayfield(ctx);

      if (this.trail.length) rd.drawTrail(this.trail, this.theme.colors, core.SPAWN_ROWS);

      const flashing = this.phase === 'flash';
      const k = flashing ? this.phaseTimer / FLASH_TIME : 0;
      const glow = flashing ? 0.30 + 0.70 * Math.abs(Math.sin(this.phaseTimer * 30)) : 0;
      rd.drawBoard(this.board, core.SPAWN_ROWS, flashing ? this.flashRows : null, glow, flashing ? k * 1.1 : 0);

      if (this.piece && this.phase === 'falling' && this.state !== 'countdown') {
        const d = core.hardDropDistance(this.board, this.piece);
        if (d > 0) rd.drawGhost(this.piece, d, this.theme.colors, core.SPAWN_ROWS);
        rd.drawPiece(this.piece, this.theme.colors, core.SPAWN_ROWS);
      }

      fx.drawParticles(ctx);
      fx.drawWavesAndBeams(ctx);
      ctx.restore();

      rd.drawFrameOverlay(Math.min(1, this.chain * 0.28 + this.dangerLevel * 0.5 + this.bg.heat * 0.35));

      ctx.save();
      rd.clipPlayfield(ctx);
      fx.drawTexts(ctx);
      fx.drawFlash(ctx, rd.w, rd.h);
      ctx.restore();

      ctx.restore();
    }

    // ---------------- UI 同步 ----------------
    renderQueue() {
      const c = this.theme.colors;
      this.rd.drawNextPreview($('nextCanvas0'), this.queue[0], c, { pad: 12 });
      this.rd.drawNextPreview($('nextCanvas1'), this.queue[1], c, { pad: 8, alpha: 0.75 });
      this.rd.drawNextPreview($('nextCanvas2'), this.queue[2], c, { pad: 8, alpha: 0.55 });
    }
    renderHold() {
      this.rd.drawNextPreview($('holdCanvas'), this.holdType, this.theme.colors,
        { pad: 12, alpha: this.holdUsed ? 0.32 : 1 });
    }

    bump(id) {
      const el = $(id);
      if (!el) return;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }

    syncUI(full) {
      $('uiHigh').textContent = Math.max(this.best, this.score).toLocaleString();
      $('uiLevel').textContent = this.level;
      $('uiChain').textContent = this.chain;
      $('uiCombo').textContent = this.combo;
      $('uiLines').textContent = this.lines;
      $('uiMaxChain').textContent = this.maxChain;
      $('uiTetris').textContent = this.stat.tetris;
      $('uiTspin').textContent = this.stat.tspin;
      $('uiSpeed').textContent = (0.95 / this.dropInterval).toFixed(1) + 'x';
      $('ovHigh').textContent = this.best.toLocaleString();

      const b2bOn = this.b2b > 1;
      $('uiB2BCell').classList.toggle('on', b2bOn);
      $('uiB2B').textContent = b2bOn ? '×' + (1 + (this.b2b - 1) * 0.5).toFixed(1).replace('.0', '') : '—';

      const atMax = this.level >= MAX_LEVEL;
      const goalLines = Math.max(0, this.level * LINES_PER_LEVEL - this.lines);
      $('lvGoalText').textContent = atMax ? '已达最高等级' : ('距离 LV' + (this.level + 1) + ' 还需 ' + goalLines + ' 行');
      const prog = atMax ? 100 : ((this.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL) * 100;
      $('lvBarFill').style.width = prog.toFixed(1) + '%';

      this.renderHold();
      if (full) { this.displayScore = this.score; $('uiScore').textContent = this.score.toLocaleString(); }
    }

    tickUI(dt) {
      if (this.displayScore !== this.score) {
        const diff = this.score - this.displayScore;
        const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 9));
        this.displayScore += diff > 0 ? Math.min(diff, step) : Math.max(diff, -step);
        this.displayScore = Math.round(this.displayScore);
        $('uiScore').textContent = this.displayScore.toLocaleString();
        if (Math.abs(diff) > 40) this.bump('uiScore');
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.__bf = new Game();
  });
})();
