// 画布渲染器：把引擎状态画到 canvas。唯一掌握「格↔像素」映射的地方。
import type { GameEngine } from '../game/engine';
import type { Effect, Enemy, Facing, Operator, OpKind, Vec } from '../game/types';
import { COLS, MAP, PATH, ROWS } from '../game/config';
import { cellsFor, clamp, pathPosToRC } from '../game/geometry';
import { OPS } from '../game/operators';

export class CanvasRenderer {
  readonly cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  CELL = 56;
  OX = 0;
  OY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** 依据可用区域调整画布尺寸与格子大小。 */
  resize(availW: number, availH: number): void {
    this.CELL = Math.max(24, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    this.cv.width = this.CELL * COLS;
    this.cv.height = this.CELL * ROWS;
    this.cv.style.width = this.cv.width + 'px';
    this.cv.style.height = this.cv.height + 'px';
    this.OX = (this.cv.width - this.CELL * COLS) / 2;
    this.OY = 0;
  }

  // 像素换算
  private cx(c: number): number { return this.OX + (c + 0.5) * this.CELL; }
  private cy(r: number): number { return this.OY + (r + 0.5) * this.CELL; }

  /** 屏幕坐标 → 网格坐标，越界返回 null。 */
  screenToCell(clientX: number, clientY: number): Vec | null {
    const rect = this.cv.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.cv.width / rect.width);
    const py = (clientY - rect.top) * (this.cv.height / rect.height);
    const c = Math.floor((px - this.OX) / this.CELL);
    const r = Math.floor((py - this.OY) / this.CELL);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return { r, c };
  }

  /** 屏幕坐标相对某格中心的向量（单位：格），用于拖动选朝向。 */
  vectorCells(clientX: number, clientY: number, r: number, c: number): { dx: number; dy: number } {
    const rect = this.cv.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.cv.width / rect.width);
    const py = (clientY - rect.top) * (this.cv.height / rect.height);
    return { dx: (px - this.cx(c)) / this.CELL, dy: (py - this.cy(r)) / this.CELL };
  }

  // ---------- 主绘制 ----------
  draw(g: GameEngine): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.drawMap();
    this.drawPath();

    this.drawMarker(PATH[0].r, PATH[0].c, '#4caf50', '出');
    const T = PATH[PATH.length - 1];
    this.drawMarker(T.r, T.c, '#5b94ff', '门');

    if (g.placing && !g.pending) this.drawPlaceableTiles(g);
    if (g.selected) this.drawRange(g.selected.cells, 'rgba(255,235,120,.22)');
    if (g.pending) this.drawPending(g.pending);

    for (const op of g.ops) this.drawOp(op);
    for (const e of g.enemies) this.drawEnemy(e);
    for (const ef of g.effects) this.drawEffect(ef);
  }

  private drawMap(): void {
    const ctx = this.ctx, CELL = this.CELL;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = MAP[r][c];
      if (t === 'x') continue;
      const x = this.OX + c * CELL, y = this.OY + r * CELL;
      ctx.fillStyle = (t === 'h') ? '#454f70' : '#3a3a4a';
      this.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6); ctx.fill();
      if (t === 'h') {
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        this.roundRect(x + 2, y + 2, CELL - 4, 5, 3); ctx.fill();
      }
    }
  }

  private drawPath(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = Math.max(3, this.CELL * 0.1);
    ctx.beginPath();
    PATH.forEach((p, i) => {
      const x = this.cx(p.c), y = this.cy(p.r);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  private drawMarker(r: number, c: number, color: string, txt: string): void {
    const ctx = this.ctx, x = this.cx(c), y = this.cy(r);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, this.CELL * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${this.CELL * 0.26}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  }

  private drawPlaceableTiles(g: GameEngine): void {
    const ctx = this.ctx, CELL = this.CELL;
    if (!g.placing) return;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!g.canPlace(g.placing, r, c)) continue;
      ctx.fillStyle = 'rgba(120,255,150,.18)';
      this.roundRect(this.OX + c * CELL + 2, this.OY + r * CELL + 2, CELL - 4, CELL - 4, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(120,255,150,.5)'; ctx.lineWidth = 2;
      this.roundRect(this.OX + c * CELL + 2, this.OY + r * CELL + 2, CELL - 4, CELL - 4, 6); ctx.stroke();
    }
  }

  private drawRange(cells: Vec[], color: string): void {
    const ctx = this.ctx, CELL = this.CELL;
    for (const c of cells) {
      if (c.r < 0 || c.c < 0 || c.r >= ROWS || c.c >= COLS) continue;
      ctx.fillStyle = color;
      this.roundRect(this.OX + c.c * CELL + 3, this.OY + c.r * CELL + 3, CELL - 6, CELL - 6, 6); ctx.fill();
    }
  }

  private drawPending(p: { kind: OpKind; r: number; c: number; facing: Facing }): void {
    const def = OPS[p.kind];
    const cells = cellsFor(def, p.r, p.c, p.facing);
    this.drawRange(cells, def.support ? 'rgba(80,230,170,.30)' : 'rgba(120,255,150,.28)');

    const ctx = this.ctx, CELL = this.CELL, s = CELL * 0.34;
    const x = this.cx(p.c), y = this.cy(p.r);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = def.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    this.roundRect(x - s, y - s, s * 2, s * 2, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.font = `bold ${CELL * 0.3}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.cn, x, y + 1);
    ctx.globalAlpha = 1;

    const f = p.facing, len = CELL * 0.7;
    const ax = x + f.dc * len, ay = y + f.dr * len;
    ctx.strokeStyle = '#ffd54a'; ctx.fillStyle = '#ffd54a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke();
    const a = Math.atan2(f.dr, f.dc), h = CELL * 0.16;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - h * Math.cos(a - 0.5), ay - h * Math.sin(a - 0.5));
    ctx.lineTo(ax - h * Math.cos(a + 0.5), ay - h * Math.sin(a + 0.5));
    ctx.closePath(); ctx.fill();
  }

  private drawOp(op: Operator): void {
    const ctx = this.ctx, CELL = this.CELL, s = CELL * 0.34;
    const x = this.cx(op.c), y = this.cy(op.r);
    ctx.fillStyle = op.def.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (op.kind === 'sniper') {
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (op.kind === 'caster') {
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (op.kind === 'medic') {
      ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill(); ctx.stroke();
    } else {
      this.roundRect(x - s, y - s, s * 2, s * 2, 5); ctx.fill(); ctx.stroke();
    }
    // 朝向点
    const f = op.facing;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(x + f.dc * s * 0.95, y + f.dr * s * 0.95, CELL * 0.05, 0, 7); ctx.fill();
    // 文字
    ctx.fillStyle = '#1a1a1a'; ctx.font = `bold ${CELL * 0.3}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(op.def.cn, x, y + 1);
    // 近战血条
    if (op.melee) {
      const w = CELL * 0.7, bx = x - w / 2, by = y - s - 7;
      ctx.fillStyle = '#000'; ctx.fillRect(bx, by, w, 4);
      ctx.fillStyle = '#4caf50'; ctx.fillRect(bx, by, w * clamp(op.hp / op.maxhp, 0, 1), 4);
    }
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx, CELL = this.CELL;
    const rc = pathPosToRC(e.pathPos);
    const px = this.cx(rc.c), py = this.cy(rc.r), rad = CELL * e.def.rad;
    ctx.fillStyle = e.def.color; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill(); ctx.stroke();
    if (e.blockedBy) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, rad + 2, 0, 7); ctx.stroke();
    }
    const w = rad * 2.2, bx = px - w / 2, by = py - rad - 7;
    ctx.fillStyle = '#000'; ctx.fillRect(bx, by, w, 4);
    ctx.fillStyle = '#ff5252'; ctx.fillRect(bx, by, w * clamp(e.hp / e.maxhp, 0, 1), 4);
  }

  private drawEffect(ef: Effect): void {
    const ctx = this.ctx, CELL = this.CELL;
    if (ef.type === 'shot') {
      ctx.strokeStyle = ef.color; ctx.globalAlpha = clamp(ef.life / 0.12, 0, 1); ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.cx(ef.from.c), this.cy(ef.from.r));
      ctx.lineTo(this.cx(ef.to.c), this.cy(ef.to.r));
      ctx.stroke(); ctx.globalAlpha = 1;
    } else if (ef.type === 'aoe') {
      ctx.fillStyle = ef.color; ctx.globalAlpha = clamp(ef.life / 0.25, 0, 1) * 0.5;
      ctx.beginPath(); ctx.arc(this.cx(ef.at.c), this.cy(ef.at.r), CELL * 0.9 * (1.2 - ef.life / 0.25), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (ef.type === 'slash') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      const t = 1 - ef.life / 0.18, rad = CELL * 0.42, sweep = 2.0;
      const a0 = ef.ang - sweep / 2 + sweep * t;
      ctx.globalAlpha = clamp(ef.life / 0.18, 0, 1); ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = CELL * 0.13;
      ctx.beginPath(); ctx.arc(x, y, rad, a0 - 0.5, a0 + 0.5); ctx.stroke();
      ctx.strokeStyle = ef.color; ctx.lineWidth = CELL * 0.06;
      ctx.beginPath(); ctx.arc(x, y, rad, a0 - 0.5, a0 + 0.5); ctx.stroke();
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    } else if (ef.type === 'heal') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r), t = ef.life / 0.4;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.strokeStyle = ef.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.45 * (1.3 - t), 0, 7); ctx.stroke();
      ctx.fillStyle = ef.color;
      const cs = CELL * 0.1, cyy = y - CELL * 0.05;
      ctx.fillRect(x - cs / 3, cyy - cs, cs * 0.66, cs * 2);
      ctx.fillRect(x - cs, cyy - cs / 3, cs * 2, cs * 0.66);
      ctx.globalAlpha = 1;
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
