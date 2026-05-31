// 画布渲染器：把引擎状态画到 canvas。唯一掌握「格↔像素」映射的地方。
import type { GameEngine } from '../game/engine';
import type { Effect, Enemy, Facing, Level, Operator, OpKind, Projectile, Vec } from '../game/types';
import { cellsFor, clamp, pathPosToRC } from '../game/geometry';
import { OPS } from '../game/operators';

const TAU = Math.PI * 2;

export class CanvasRenderer {
  readonly cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  CELL = 56;
  OX = 0;
  OY = 0;
  private rows = 8;
  private cols = 5;
  private t = 0; // 全局动画时钟（秒）

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** 依据关卡尺寸与可用区域调整画布。 */
  resize(level: Level, availW: number, availH: number): void {
    this.rows = level.rows;
    this.cols = level.cols;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.CELL = Math.max(22, Math.floor(Math.min(availW / this.cols, availH / this.rows)));
    const w = this.CELL * this.cols, h = this.CELL * this.rows;
    this.cv.width = Math.floor(w * dpr);
    this.cv.height = Math.floor(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.OX = 0;
    this.OY = 0;
  }

  private cx(c: number): number { return this.OX + (c + 0.5) * this.CELL; }
  private cy(r: number): number { return this.OY + (r + 0.5) * this.CELL; }
  private get W(): number { return this.cols * this.CELL; }
  private get H(): number { return this.rows * this.CELL; }

  screenToCell(clientX: number, clientY: number): Vec | null {
    const rect = this.cv.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.W / rect.width);
    const py = (clientY - rect.top) * (this.H / rect.height);
    const c = Math.floor((px - this.OX) / this.CELL);
    const r = Math.floor((py - this.OY) / this.CELL);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return { r, c };
  }

  vectorCells(clientX: number, clientY: number, r: number, c: number): { dx: number; dy: number } {
    const rect = this.cv.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.W / rect.width);
    const py = (clientY - rect.top) * (this.H / rect.height);
    return { dx: (px - this.cx(c)) / this.CELL, dy: (py - this.cy(r)) / this.CELL };
  }

  // ---------- 主绘制 ----------
  draw(g: GameEngine, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    this.paintBackdrop();

    const level = g.level;
    this.drawTiles(level);
    this.drawPaths(level);
    this.drawEndpoints(level);

    if (g.placing && !g.pending) this.drawPlaceable(g);
    if (g.selected) this.drawRange(g.selected.cells, 'rgba(255,235,120,.20)', g.selected.def.color);
    if (g.pending) this.drawPending(g.pending);

    for (const op of g.ops) this.drawOp(op);
    for (const e of g.enemies) this.drawEnemy(e);
    for (const p of g.projectiles) this.drawProjectile(p);
    for (const ef of g.effects) this.drawEffect(ef);
  }

  private drawProjectile(p: Projectile): void {
    const ctx = this.ctx, CELL = this.CELL;
    const x = this.cx(p.x), y = this.cy(p.y);
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x); // 始终面向目标
    const len = CELL * 0.26, wid = CELL * 0.1;
    // 拖尾
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.color; ctx.lineWidth = wid; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 弹头
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.fillStyle = p.heal ? p.color : '#ffffff';
    if (p.heal) {
      ctx.beginPath(); ctx.arc(0, 0, wid * 0.9, 0, TAU); ctx.fill();
    } else {
      // 菱形弹头
      ctx.beginPath();
      ctx.moveTo(len * 0.5, 0); ctx.lineTo(0, wid * 0.8);
      ctx.lineTo(-len * 0.3, 0); ctx.lineTo(0, -wid * 0.8); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, wid * 0.5, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private paintBackdrop(): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, '#0e0e16');
    grad.addColorStop(1, '#14141e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private drawTiles(level: Level): void {
    const ctx = this.ctx, CELL = this.CELL;
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      const t = level.map[r][c];
      if (t === 'x') continue;
      const x = this.OX + c * CELL, y = this.OY + r * CELL;
      const high = t === 'h';
      // 主体
      const g = ctx.createLinearGradient(x, y, x, y + CELL);
      if (high) { g.addColorStop(0, '#4f5a82'); g.addColorStop(1, '#3c4569'); }
      else { g.addColorStop(0, '#363648'); g.addColorStop(1, '#2c2c3c'); }
      ctx.fillStyle = g;
      this.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7); ctx.fill();
      // 高台立体高光 + 描边
      ctx.strokeStyle = high ? 'rgba(150,170,230,.35)' : 'rgba(120,120,150,.18)';
      ctx.lineWidth = 1;
      this.roundRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5, 6); ctx.stroke();
      if (high) {
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        this.roundRect(x + 4, y + 4, CELL - 8, Math.max(4, CELL * 0.12), 4); ctx.fill();
      }
    }
  }

  private drawPaths(level: Level): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const path of level.paths) {
      // 底层暗带
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = Math.max(4, this.CELL * 0.16);
      this.tracePath(path); ctx.stroke();
      // 流动虚线
      ctx.strokeStyle = 'rgba(180,200,255,.22)';
      ctx.lineWidth = Math.max(2, this.CELL * 0.07);
      ctx.setLineDash([this.CELL * 0.28, this.CELL * 0.34]);
      ctx.lineDashOffset = -(this.t * this.CELL * 0.9) % 1000;
      this.tracePath(path); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private tracePath(path: Vec[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    path.forEach((p, i) => {
      const x = this.cx(p.c), y = this.cy(p.r);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
  }

  private drawEndpoints(level: Level): void {
    const seenStart = new Set<string>(), seenGoal = new Set<string>();
    for (const p of level.paths) {
      const s = p[0], gg = p[p.length - 1];
      if (!seenStart.has(s.r + ',' + s.c)) { seenStart.add(s.r + ',' + s.c); this.drawMarker(s.r, s.c, '#46d36b', '出', true); }
      if (!seenGoal.has(gg.r + ',' + gg.c)) { seenGoal.add(gg.r + ',' + gg.c); this.drawMarker(gg.r, gg.c, '#5b94ff', '门', false); }
    }
  }

  private drawMarker(r: number, c: number, color: string, txt: string, spawn: boolean): void {
    const ctx = this.ctx, x = this.cx(c), y = this.cy(r);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (spawn ? 3 : 2.2));
    const base = this.CELL * 0.24;
    // 光晕
    ctx.globalAlpha = 0.18 + 0.12 * pulse;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, base + this.CELL * 0.14 * (0.6 + 0.4 * pulse), 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // 主体
    const g = ctx.createRadialGradient(x - base * 0.3, y - base * 0.3, base * 0.2, x, y, base);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, base, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = `bold ${this.CELL * 0.26}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
  }

  private drawPlaceable(g: GameEngine): void {
    const ctx = this.ctx, CELL = this.CELL;
    if (!g.placing) return;
    const a = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(this.t * 4));
    for (let r = 0; r < g.level.rows; r++) for (let c = 0; c < g.level.cols; c++) {
      if (!g.canPlace(g.placing, r, c)) continue;
      ctx.fillStyle = `rgba(120,255,170,${a})`;
      this.roundRect(this.OX + c * CELL + 2, this.OY + r * CELL + 2, CELL - 4, CELL - 4, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,255,170,.55)'; ctx.lineWidth = 2;
      this.roundRect(this.OX + c * CELL + 3, this.OY + r * CELL + 3, CELL - 6, CELL - 6, 6); ctx.stroke();
    }
  }

  private drawRange(cells: Vec[], fill: string, edge?: string): void {
    const ctx = this.ctx, CELL = this.CELL;
    for (const c of cells) {
      if (c.r < 0 || c.c < 0 || c.r >= this.rows || c.c >= this.cols) continue;
      ctx.fillStyle = fill;
      this.roundRect(this.OX + c.c * CELL + 3, this.OY + c.r * CELL + 3, CELL - 6, CELL - 6, 6); ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5;
        this.roundRect(this.OX + c.c * CELL + 3, this.OY + c.r * CELL + 3, CELL - 6, CELL - 6, 6); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPending(p: { kind: OpKind; r: number; c: number; facing: Facing }): void {
    const def = OPS[p.kind];
    this.drawRange(cellsFor(def, p.r, p.c, p.facing), def.support ? 'rgba(80,230,170,.28)' : 'rgba(120,255,170,.26)', def.color);

    const ctx = this.ctx, CELL = this.CELL, s = CELL * 0.34;
    const x = this.cx(p.c), y = this.cy(p.r);
    ctx.globalAlpha = 0.92;
    this.opBody(p.kind, x, y, s, def.color);
    ctx.fillStyle = '#15151c'; ctx.font = `bold ${CELL * 0.3}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.cn, x, y + 1);
    ctx.globalAlpha = 1;

    const f = p.facing, len = CELL * 0.72;
    const ax = x + f.dc * len, ay = y + f.dr * len;
    ctx.strokeStyle = '#ffd54a'; ctx.fillStyle = '#ffd54a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke();
    const a = Math.atan2(f.dr, f.dc), h = CELL * 0.17;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - h * Math.cos(a - 0.5), ay - h * Math.sin(a - 0.5));
    ctx.lineTo(ax - h * Math.cos(a + 0.5), ay - h * Math.sin(a + 0.5));
    ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt';
  }

  /** 干员几何形状（按职业）。 */
  private opBody(kind: OpKind, x: number, y: number, s: number, color: string): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, this.lighten(color, 0.25));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'sniper') {
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath();
    } else if (kind === 'caster') {
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
    } else if (kind === 'mage') {
      // 六边形
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const vx = x + Math.cos(a) * s, vy = y + Math.sin(a) * s;
        if (i) ctx.lineTo(vx, vy); else ctx.moveTo(vx, vy);
      }
      ctx.closePath();
    } else if (kind === 'medic') {
      ctx.arc(x, y, s, 0, TAU);
    } else {
      const rr = 6;
      this.roundRectPath(x - s, y - s, s * 2, s * 2, rr);
    }
    ctx.fill(); ctx.stroke();
  }

  private drawOp(op: Operator): void {
    const ctx = this.ctx, CELL = this.CELL;
    // 阻挡中的干员略微朝来敌方向偏离格心，给被挡敌人腾出空间
    let ox = 0, oy = 0;
    if (op.block > 0 && op.blk.length > 0) {
      ox = -op.facing.dc * CELL * 0.12;
      oy = -op.facing.dr * CELL * 0.12;
    }
    const x = this.cx(op.c) + ox, y = this.cy(op.r) + oy;
    const fireT = clamp(op.fire / 0.2, 0, 1);
    const s = CELL * 0.34 * (1 + 0.06 * fireT);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.9, s * 0.9, s * 0.4, 0, 0, TAU); ctx.fill();

    this.opBody(op.kind, x, y, s, op.def.color);

    // 受击红闪
    if (op.hurt > 0) {
      ctx.globalAlpha = clamp(op.hurt / 0.18, 0, 1) * 0.6;
      ctx.fillStyle = '#ff5a5a';
      this.opBody(op.kind, x, y, s, '#ff5a5a');
      ctx.globalAlpha = 1;
    }

    // 朝向点
    const f = op.facing;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x + f.dc * s * 0.95, y + f.dr * s * 0.95, CELL * 0.055, 0, TAU); ctx.fill();

    // 文字
    ctx.fillStyle = '#15151c'; ctx.font = `bold ${CELL * 0.3}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(op.def.cn, x, y + 1);

    // 血条（受伤才显示，平滑缓动 + 残影）
    if (op.hp < op.maxhp - 0.5 || op.hpShown < op.maxhp - 0.5) {
      const w = CELL * 0.72, bx = x - w / 2, by = y - s - 8;
      const ratio = clamp(op.hp / op.maxhp, 0, 1);
      const shown = clamp(op.hpShown / op.maxhp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; this.roundRect(bx - 1, by - 1, w + 2, 6, 3); ctx.fill();
      if (shown > ratio) { // 掉血残影
        ctx.fillStyle = 'rgba(255,120,120,.55)'; this.roundRect(bx, by, w * shown, 4, 2); ctx.fill();
      } else if (shown < ratio) { // 回血残影（医疗）
        ctx.fillStyle = 'rgba(180,255,200,.5)'; this.roundRect(bx, by, w * ratio, 4, 2); ctx.fill();
      }
      ctx.fillStyle = ratio > 0.5 ? '#5fd16a' : ratio > 0.25 ? '#e6c34a' : '#e0564a';
      this.roundRect(bx, by, w * Math.min(ratio, shown), 4, 2); ctx.fill();
    }
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx, CELL = this.CELL;
    const rc = pathPosToRC(e.path, e.pathPos);
    let ox = 0, oy = 0;
    // 被阻挡的敌人：按槽位错开，避免叠在一起
    if (e.blockedBy && e.blockTotal > 1) {
      const ang = (e.blockSlot / e.blockTotal) * TAU - Math.PI / 2;
      const spread = CELL * 0.20;
      ox = Math.cos(ang) * spread;
      oy = Math.sin(ang) * spread;
    }
    const px = this.cx(rc.c) + ox, py = this.cy(rc.r) + oy;
    const spawnT = clamp(e.age / 0.3, 0, 1); // 出场缩放
    const rad = CELL * e.def.rad * (0.4 + 0.6 * spawnT);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(px, py + rad * 0.85, rad * 0.95, rad * 0.4, 0, 0, TAU); ctx.fill();

    // 主体（径向渐变球体）
    const g = ctx.createRadialGradient(px - rad * 0.35, py - rad * 0.35, rad * 0.15, px, py, rad);
    g.addColorStop(0, this.lighten(e.def.color, 0.4));
    g.addColorStop(1, e.def.color);
    ctx.fillStyle = (e.hurt > 0) ? '#ffffff' : g;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.stroke();

    // 被阻挡光环
    if (e.blockedBy) {
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, rad + 3, 0, TAU); ctx.stroke();
    }

    // 血条（平滑缓动 + 残影）
    const w = rad * 2.3, bx = px - w / 2, by = py - rad - 8;
    const real = clamp(e.hp / e.maxhp, 0, 1);
    const shown = clamp(e.hpShown / e.maxhp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; this.roundRect(bx - 1, by - 1, w + 2, 6, 3); ctx.fill();
    if (shown > real) { // 掉血残影（白）
      ctx.fillStyle = 'rgba(255,255,255,.6)'; this.roundRect(bx, by, w * shown, 4, 2); ctx.fill();
    }
    ctx.fillStyle = '#ff5a5a'; this.roundRect(bx, by, w * real, 4, 2); ctx.fill();
  }

  private drawEffect(ef: Effect): void {
    const ctx = this.ctx, CELL = this.CELL;
    const k = clamp(ef.life / ef.max, 0, 1); // 1→0
    if (ef.type === 'hit') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      const prog = 1 - k;
      if (ef.heal) {
        // 治疗命中：上浮十字 + 光环
        ctx.globalAlpha = k;
        ctx.strokeStyle = ef.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.4 * (0.6 + prog), 0, TAU); ctx.stroke();
        const ly = y - CELL * 0.3 * prog, cs = CELL * 0.1;
        ctx.fillStyle = ef.color;
        ctx.fillRect(x - cs / 3, ly - cs, cs * 0.66, cs * 2);
        ctx.fillRect(x - cs, ly - cs / 3, cs * 2, cs * 0.66);
        ctx.globalAlpha = 1;
      } else {
        // 命中爆点：闪光 + 放射火花
        ctx.globalAlpha = k;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.16 * (1 - prog * 0.5), 0, TAU); ctx.fill();
        ctx.strokeStyle = ef.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        const spokes = 6, len = CELL * (0.18 + prog * 0.22);
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * TAU + prog;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * len * 0.4, y + Math.sin(a) * len * 0.4);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
      }
    } else if (ef.type === 'aoe') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      const rr = CELL * (0.5 + (1 - k) * 1.1);
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = ef.color;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      ctx.globalAlpha = k;
      ctx.strokeStyle = this.lighten(ef.color, 0.4); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (ef.type === 'slash') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      const prog = 1 - k, rad = CELL * 0.46, sweep = 2.1;
      const a0 = ef.ang - sweep / 2 + sweep * prog;
      ctx.globalAlpha = k; ctx.lineCap = 'round';
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = CELL * 0.14;
      ctx.beginPath(); ctx.arc(x, y, rad, a0 - 0.55, a0 + 0.55); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = ef.color; ctx.lineWidth = CELL * 0.06;
      ctx.beginPath(); ctx.arc(x, y, rad, a0 - 0.55, a0 + 0.55); ctx.stroke();
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    } else if (ef.type === 'heal') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      ctx.globalAlpha = k;
      ctx.strokeStyle = ef.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.46 * (1.3 - k), 0, TAU); ctx.stroke();
      // 上浮十字
      const ly = y - CELL * 0.25 * (1 - k);
      const cs = CELL * 0.1;
      ctx.fillStyle = ef.color;
      ctx.fillRect(x - cs / 3, ly - cs, cs * 0.66, cs * 2);
      ctx.fillRect(x - cs, ly - cs / 3, cs * 2, cs * 0.66);
      ctx.globalAlpha = 1;
    } else if (ef.type === 'death') {
      const x = this.cx(ef.at.c), y = this.cy(ef.at.r);
      const n = 6, spread = CELL * 0.5 * (1 - k);
      ctx.globalAlpha = k;
      ctx.fillStyle = ef.color;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = x + Math.cos(a) * spread, py = y + Math.sin(a) * spread;
        ctx.beginPath(); ctx.arc(px, py, CELL * 0.06 * k + 1, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 工具 ----------
  private lighten(hex: string, amt: number): string {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    const f = (v: number) => Math.round(v + (255 - v) * amt);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.roundRectPath(x, y, w, h, r);
  }
}
