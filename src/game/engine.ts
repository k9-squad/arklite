// 游戏引擎：持有全部状态并推进模拟。完全独立于 DOM / 渲染 / 框架。
import type {
  Effect, Enemy, Facing, Operator, OpKind, Pending, Spawn, UiSnapshot, Vec,
} from './types';
import {
  COST_PER_SEC, MAX_COST, PATH, START_COST, START_LIFE, pathIndexAt,
} from './config';
import { OPS } from './operators';
import { ENEMIES } from './enemies';
import { buildSpawns } from './waves';
import {
  cellType, cellsFor, clamp, defaultFacing, enemyCell, facingFromVector, key,
} from './geometry';

export class GameEngine {
  // 局势
  started = false;
  running = false;
  over = false;
  won = false;

  time = 0;
  speed = 1;
  costF = START_COST;
  life = START_LIFE;

  spawns: Spawn[] = [];
  spawnIdx = 0;

  // 实体
  enemies: Enemy[] = [];
  ops: Operator[] = [];
  effects: Effect[] = [];

  // 部署 / 选择
  placing: OpKind | null = null;   // 已选卡，待落子
  pending: Pending | null = null;  // 已落子，正在选朝向
  selected: Operator | null = null;

  private opGrid: Record<string, Operator> = {};
  private opPathIdx: Array<Operator | null> = [];

  // ---------- 生命周期 ----------
  start(): void {
    this.started = true;
    this.running = true;
    this.over = false;
    this.won = false;
    this.time = 0;
    this.speed = 1;
    this.costF = START_COST;
    this.life = START_LIFE;
    this.spawns = buildSpawns();
    this.spawnIdx = 0;
    this.enemies = [];
    this.ops = [];
    this.effects = [];
    this.opGrid = {};
    this.opPathIdx = [];
    this.placing = null;
    this.pending = null;
    this.selected = null;
  }

  togglePause(): boolean {
    if (this.over || !this.started) return this.running;
    this.running = !this.running;
    return this.running;
  }

  cycleSpeed(): number {
    this.speed = this.speed === 1 ? 2 : 1;
    return this.speed;
  }

  /** 由主循环调用：按倍速推进若干固定步。 */
  update(dt: number): void {
    if (!this.running || this.over) return;
    for (let i = 0; i < this.speed && !this.over; i++) this.step(dt);
  }

  // ---------- 部署 ----------
  canPlace(kind: OpKind, r: number, c: number): boolean {
    const def = OPS[kind];
    if (this.opGrid[key(r, c)]) return false;
    const t = cellType(r, c);
    return def.melee ? t === 'r' : t === 'h';
  }

  affordable(kind: OpKind): boolean {
    return this.costF >= OPS[kind].cost;
  }

  /** 卡片「部署」按钮：进入选格模式。 */
  setPlacing(kind: OpKind): void {
    if (!this.started || this.over || !this.affordable(kind)) return;
    this.selected = null;
    this.placing = kind;
    this.pending = null;
  }

  cancelPlacing(): void {
    this.placing = null;
    this.pending = null;
  }

  /** 在格子上落子，进入选朝向（拖动）模式。返回是否成功。 */
  beginPending(r: number, c: number): boolean {
    const kind = this.placing;
    if (!kind || !this.canPlace(kind, r, c) || !this.affordable(kind)) {
      this.placing = null;
      return false;
    }
    const f = defaultFacing(OPS[kind].melee, r, c);
    this.pending = { kind, r, c, facing: f, defFacing: f };
    return true;
  }

  /** 拖动更新朝向（向量单位为格）。 */
  setPendingFacing(dxCells: number, dyCells: number): void {
    const p = this.pending;
    if (!p) return;
    p.facing = facingFromVector(dxCells, dyCells, p.defFacing);
  }

  /** 松手：确认部署。 */
  commitPending(): void {
    const p = this.pending;
    if (p && this.affordable(p.kind)) this.placeOp(p.kind, p.r, p.c, p.facing);
    this.pending = null;
    this.placing = null;
  }

  private placeOp(kind: OpKind, r: number, c: number, facing: Facing): void {
    const def = OPS[kind];
    const op: Operator = {
      def, kind, r, c,
      hp: def.hp, maxhp: def.hp, cd: 0,
      block: def.melee ? def.block : 0,
      melee: def.melee,
      facing,
      cells: cellsFor(def, r, c, facing),
      pathIndex: def.melee ? (pathIndexAt[key(r, c)] ?? -1) : -1,
      blk: [],
    };
    this.ops.push(op);
    this.opGrid[key(r, c)] = op;
    if (def.melee && op.pathIndex >= 0) this.opPathIdx[op.pathIndex] = op;
    this.costF -= def.cost;
  }

  private removeOp(op: Operator): void {
    const i = this.ops.indexOf(op);
    if (i >= 0) this.ops.splice(i, 1);
    delete this.opGrid[key(op.r, op.c)];
    if (op.pathIndex >= 0 && this.opPathIdx[op.pathIndex] === op) {
      this.opPathIdx[op.pathIndex] = null;
    }
    if (this.selected === op) this.selected = null;
  }

  // ---------- 选择 ----------
  opAt(r: number, c: number): Operator | undefined {
    return this.opGrid[key(r, c)];
  }

  selectAt(r: number, c: number): Operator | null {
    this.selected = this.opGrid[key(r, c)] ?? null;
    return this.selected;
  }

  deselect(): void { this.selected = null; }

  retreatSelected(): void {
    if (this.selected) this.removeOp(this.selected);
  }

  // ---------- 模拟单步 ----------
  private step(dt: number): void {
    this.time += dt;
    this.costF = Math.min(MAX_COST, this.costF + COST_PER_SEC * dt);

    this.spawnDue();
    this.moveAndBlock(dt);
    this.reachGoal();
    this.enemyAttacks(dt);
    this.opActions(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const ef of this.effects) ef.life -= dt;
    this.effects = this.effects.filter((ef) => ef.life > 0);

    if (!this.over && this.spawnIdx >= this.spawns.length && this.enemies.length === 0 && this.life > 0) {
      this.end(true);
    }
  }

  private spawnDue(): void {
    while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].time <= this.time) {
      const sp = this.spawns[this.spawnIdx++];
      const ed = ENEMIES[sp.kind];
      this.enemies.push({
        kind: sp.kind, def: ed, hp: ed.hp, maxhp: ed.hp,
        speed: ed.speed, pathPos: 0, blockedBy: null, atkCd: 0, dead: false,
      });
    }
  }

  private moveAndBlock(dt: number): void {
    for (const o of this.ops) o.blk = [];
    // 前排（pathPos 大）优先占用阻挡位
    const order = [...this.enemies].sort((a, b) => b.pathPos - a.pathPos);
    for (const e of order) {
      if (e.dead) continue;
      e.blockedBy = null;
      const newPos = e.pathPos + e.speed * dt;
      let blocked = false;
      const startTile = Math.ceil(e.pathPos - 1e-6);
      const endTile = Math.min(Math.floor(newPos + 1e-6), PATH.length - 1);
      for (let ti = startTile; ti <= endTile; ti++) {
        const op = this.opPathIdx[ti];
        if (op && op.block > 0 && op.blk.length < op.block) {
          e.pathPos = ti;
          op.blk.push(e);
          e.blockedBy = op;
          blocked = true;
          break;
        }
      }
      if (!blocked) e.pathPos = Math.min(newPos, PATH.length - 1);
    }
  }

  private reachGoal(): void {
    for (const e of this.enemies) {
      if (!e.dead && e.pathPos >= PATH.length - 1 - 1e-6) {
        e.dead = true;
        this.life--;
        if (this.life <= 0) this.end(false);
      }
    }
  }

  private enemyAttacks(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead || !e.blockedBy) continue;
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.def.atkInt;
        const op = e.blockedBy;
        op.hp -= e.def.atk;
        if (op.hp <= 0) this.removeOp(op);
      }
    }
  }

  private opActions(dt: number): void {
    for (const op of this.ops) {
      op.cd -= dt;
      if (op.cd > 0) continue;
      const rangeSet = new Set(op.cells.map((c) => key(c.r, c.c)));

      if (op.def.support) {
        const allies = this.ops.filter(
          (o) => o !== op && o.hp < o.maxhp && rangeSet.has(key(o.r, o.c)),
        );
        if (allies.length === 0) continue;
        let t = allies[0];
        for (const o of allies) if (o.hp / o.maxhp < t.hp / t.maxhp) t = o;
        op.cd = op.def.interval;
        t.hp = Math.min(t.maxhp, t.hp + op.def.atk);
        this.effects.push({ type: 'heal', at: { r: t.r, c: t.c }, life: 0.4, color: op.def.color });
        continue;
      }

      const inRange = this.enemies.filter(
        (e) => !e.dead && rangeSet.has(key(enemyCell(e.pathPos).r, enemyCell(e.pathPos).c)),
      );
      if (inRange.length === 0) continue;
      op.cd = op.def.interval;

      if (op.def.aoe) {
        for (const e of inRange) this.damage(e, op.def.atk);
        let sr = 0, sc = 0;
        for (const c of op.cells) { sr += c.r; sc += c.c; }
        this.effects.push({
          type: 'aoe',
          at: { r: sr / op.cells.length, c: sc / op.cells.length },
          life: 0.25, color: op.def.color,
        });
      } else {
        // 优先攻击自身阻挡的敌人，否则攻击最接近目标点者
        let cand = inRange.filter((e) => e.blockedBy === op);
        if (cand.length === 0) cand = inRange;
        let target = cand[0];
        for (const e of cand) if (e.pathPos > target.pathPos) target = e;
        this.damage(target, op.def.atk);
        const to = this.enemyRC(target);
        if (op.melee) {
          this.effects.push({
            type: 'slash', at: to,
            ang: Math.atan2(to.r - op.r, to.c - op.c),
            life: 0.18, color: op.def.color,
          });
        } else {
          this.effects.push({
            type: 'shot', from: { r: op.r, c: op.c }, to,
            life: 0.12, color: op.def.color,
          });
        }
      }
    }
  }

  private enemyRC(e: Enemy): Vec {
    const i = Math.floor(e.pathPos);
    const f = e.pathPos - i;
    const a = PATH[clamp(i, 0, PATH.length - 1)];
    const b = PATH[clamp(i + 1, 0, PATH.length - 1)];
    return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
  }

  private damage(e: Enemy, amt: number): void {
    e.hp -= amt;
    if (e.hp <= 0) e.dead = true;
  }

  private end(won: boolean): void {
    this.over = true;
    this.running = false;
    this.won = won;
    this.placing = null;
    this.pending = null;
    this.selected = null;
  }

  // ---------- UI 快照 ----------
  snapshot(): UiSnapshot {
    return {
      started: this.started,
      running: this.running,
      over: this.over,
      won: this.won,
      cost: Math.floor(this.costF),
      life: Math.max(0, this.life),
      spawnIdx: this.spawnIdx,
      totalSpawns: this.spawns.length,
      speed: this.speed,
      placingKind: this.placing,
    };
  }
}
