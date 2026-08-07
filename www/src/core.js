// core.js — 纯逻辑层（不依赖DOM），可用 node 直接单元测试
(function (global) {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const SPAWN_ROWS = 4;                 // 顶部隐藏出生区
  const TOTAL_ROWS = ROWS + SPAWN_ROWS;

  // ---- 方块定义（严格遵循 SRS 标准朝向，保证踢墙表可用） ----
  const PIECES = {
    I: { key: 'I', rotations: [
      [[1,0],[1,1],[1,2],[1,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,1],[1,1],[2,1],[3,1]],
    ]},
    O: { key: 'O', rotations: [
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
    ]},
    T: { key: 'T', rotations: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ]},
    S: { key: 'S', rotations: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,1],[1,2],[2,0],[2,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ]},
    Z: { key: 'Z', rotations: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,2],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ]},
    J: { key: 'J', rotations: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ]},
    L: { key: 'L', rotations: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[1,2],[2,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ]},
  };
  const TYPES = ['I','O','T','S','Z','J','L'];

  // ---- SRS 踢墙表。表中为 (dx, dy)，dy 向上为正；转成行列时 row -= dy ----
  const KICK_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
    '1>2': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
    '2>1': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
    '0>3': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  };
  const KICK_I = {
    '0>1': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
    '1>0': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
    '2>1': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
    '2>3': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
    '3>0': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
    '0>3': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  };

  // ---- 特殊砖块类型 ----
  const SPECIAL = { BOMB: 'bomb', LASER: 'laser', STAR: 'star' };

  function newBag(rng) {
    const r = rng || Math.random;
    const arr = TYPES.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  let _uid = 0;
  function makeCell(type, special) {
    return {
      id: ++_uid,
      type: type,
      special: special || null,
      seed: Math.random() * 1000,
      animOffset: 0,   // 当前相对最终位置的像素偏移（>0 表示还在上方下落中）
      fallVel: 0,
      squash: 0,
      falling: false,
    };
  }

  class Board {
    constructor() {
      this.grid = Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(null));
    }
    inBounds(r, c) { return r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS; }
    isFree(r, c) {
      // 四面皆为实体边界：顶部同样封死，避免踢墙把方块顶出缓冲区导致格子丢失
      if (c < 0 || c >= COLS || r < 0 || r >= TOTAL_ROWS) return false;
      return this.grid[r][c] === null;
    }
    lockCells(cells, type, specialMap) {
      cells.forEach(function (rc, i) {
        const r = rc[0], c = rc[1];
        if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
          this.grid[r][c] = makeCell(type, specialMap ? specialMap[i] : null);
        }
      }, this);
    }
    findFullRows() {
      const out = [];
      for (let r = 0; r < TOTAL_ROWS; r++) {
        let full = true;
        for (let c = 0; c < COLS; c++) { if (!this.grid[r][c]) { full = false; break; } }
        if (full) out.push(r);
      }
      return out;
    }
    isEmpty() {
      for (let r = 0; r < TOTAL_ROWS; r++)
        for (let c = 0; c < COLS; c++) if (this.grid[r][c]) return false;
      return true;
    }
    stackHeight() {
      for (let r = 0; r < TOTAL_ROWS; r++)
        for (let c = 0; c < COLS; c++) if (this.grid[r][c]) return TOTAL_ROWS - r;
      return 0;
    }
    countCells() {
      let n = 0;
      for (let r = 0; r < TOTAL_ROWS; r++)
        for (let c = 0; c < COLS; c++) if (this.grid[r][c]) n++;
      return n;
    }

    /**
     * 计算本次消除要摧毁的全部格子：满行 + 特殊砖块的连锁扩散。
     * 返回 { list:[{r,c,cell,cause}], byRow:Map, specials:[{r,c,kind}] }
     */
    resolveDestruction(rows) {
      const marked = new Set();
      const list = [];
      const specialsFired = [];
      const queue = [];
      const key = (r, c) => r * COLS + c;

      const mark = (r, c, cause) => {
        if (!this.inBounds(r, c)) return;
        const cell = this.grid[r][c];
        if (!cell) return;
        const k = key(r, c);
        if (marked.has(k)) return;
        marked.add(k);
        list.push({ r, c, cell, cause });
        if (cell.special) queue.push({ r, c, cell });
      };

      rows.forEach((r) => { for (let c = 0; c < COLS; c++) mark(r, c, 'line'); });

      // 特殊砖块连锁扩散（爆破/激光/同色）
      let guard = 0;
      while (queue.length && guard++ < 400) {
        const s = queue.shift();
        const kind = s.cell.special;
        specialsFired.push({ r: s.r, c: s.c, kind });
        if (kind === SPECIAL.BOMB) {
          for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++) mark(s.r + dr, s.c + dc, 'bomb');
        } else if (kind === SPECIAL.LASER) {
          for (let r = 0; r < TOTAL_ROWS; r++) mark(r, s.c, 'laser');
        } else if (kind === SPECIAL.STAR) {
          for (let r = 0; r < TOTAL_ROWS; r++)
            for (let c = 0; c < COLS; c++) {
              const cell = this.grid[r][c];
              if (cell && cell.type === s.cell.type) mark(r, c, 'star');
            }
        }
      }
      return { list, specials: specialsFired };
    }

    removeCells(list) {
      list.forEach((it) => { this.grid[it.r][it.c] = null; });
    }

    /**
     * 独立重力坍塌：逐列扫描，每个砖块单独计算自己的最终落点。
     * 不做整行平移。返回发生位移的砖块列表。
     */
    collapseColumns() {
      const moves = [];
      for (let c = 0; c < COLS; c++) {
        const stack = [];
        for (let r = 0; r < TOTAL_ROWS; r++) {
          const cell = this.grid[r][c];
          if (cell) stack.push({ cell, fromRow: r });
          this.grid[r][c] = null;
        }
        const n = stack.length;
        for (let i = 0; i < n; i++) {
          const toRow = TOTAL_ROWS - n + i;
          const s = stack[i];
          this.grid[toRow][c] = s.cell;
          if (toRow !== s.fromRow) moves.push({ cell: s.cell, fromRow: s.fromRow, toRow, col: c });
        }
      }
      return moves;
    }
  }

  class Piece {
    constructor(type) {
      this.type = type;
      this.rot = 0;
      this.row = SPAWN_ROWS - 2;   // 位于隐藏缓冲区下沿，随后滑入可见区
      this.col = 3;
      this.specials = [null, null, null, null]; // 与 rotations[rot] 的4个格子一一对应
      this.lastKick = null;
    }
    cells(rot, row, col) {
      rot = rot === undefined ? this.rot : rot;
      row = row === undefined ? this.row : row;
      col = col === undefined ? this.col : col;
      return PIECES[this.type].rotations[rot].map((rc) => [row + rc[0], col + rc[1]]);
    }
  }

  function collides(board, piece, dRow, dCol, rot) {
    const cells = piece.cells(rot, piece.row + dRow, piece.col + dCol);
    for (let i = 0; i < cells.length; i++) {
      if (!board.isFree(cells[i][0], cells[i][1])) return true;
    }
    return false;
  }

  function tryMove(board, piece, dRow, dCol) {
    if (!collides(board, piece, dRow, dCol, piece.rot)) {
      piece.row += dRow; piece.col += dCol;
      return true;
    }
    return false;
  }

  function tryRotate(board, piece, dir) {
    if (piece.type === 'O') return false;
    const from = piece.rot;
    const to = (from + dir + 4) % 4;
    const table = piece.type === 'I' ? KICK_I : KICK_JLSTZ;
    const kicks = table[from + '>' + to] || [[0, 0]];
    for (let i = 0; i < kicks.length; i++) {
      const dx = kicks[i][0], dy = kicks[i][1];
      const dCol = dx, dRow = -dy;
      if (!collides(board, piece, dRow, dCol, to)) {
        piece.row += dRow; piece.col += dCol; piece.rot = to;
        piece.lastKick = i;
        return true;
      }
    }
    return false;
  }

  function hardDropDistance(board, piece) {
    let d = 0;
    while (!collides(board, piece, d + 1, 0, piece.rot)) d++;
    return d;
  }

  /**
   * T-Spin 判定（3角规则）。返回 'none' | 'mini' | 'full'
   * 必须在"最后一次成功操作是旋转"的前提下调用。
   */
  function detectTSpin(board, piece) {
    if (piece.type !== 'T') return 'none';
    const r = piece.row, c = piece.col;
    const corners = [[r, c], [r, c + 2], [r + 2, c], [r + 2, c + 2]];
    const filled = corners.map((rc) => !board.isFree(rc[0], rc[1]));
    const count = filled.filter(Boolean).length;
    if (count < 3) return 'none';
    // 朝向对应的两个"正面角"索引：0=上(左上,右上) 1=右(右上,右下) 2=下(左下,右下) 3=左(左上,左下)
    const frontIdx = [[0, 1], [1, 3], [2, 3], [0, 2]][piece.rot];
    const frontFilled = filled[frontIdx[0]] && filled[frontIdx[1]];
    if (frontFilled) return 'full';
    return piece.lastKick >= 3 ? 'full' : 'mini';
  }

  global.BFCore = {
    COLS, ROWS, SPAWN_ROWS, TOTAL_ROWS, PIECES, TYPES, SPECIAL,
    newBag, makeCell, Board, Piece,
    collides, tryMove, tryRotate, hardDropDistance, detectTSpin,
  };
})(typeof window !== 'undefined' ? window : globalThis);
