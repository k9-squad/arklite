// 游戏引擎：持有全部状态并推进模拟。完全独立于 DOM / 渲染 / 框架。
import type {
  Effect, Enemy, Facing, Level, Operator, OpKind, Pending, UiSnapshot, Vec,
} from './types';
import { COST_PER_SEC, MAX_COST } from './config';
import { OPS } from './operators';
import { ENEMIES } from './enemies';
import { LEVELS } from './levels';
import {
  cellType, cellsFor, clamp, defaultFacing, facingFromVector, key, pathCell, pathIndexOnAnyPath,
} from './geometry';

export class GameEngine {
  // 关卡
  levelIndex = 0;
  level: Level = LEVELS[0];

  // 局势
  started = false;
  running = false;
  over = false;
  won = false;

  time = 0;
  speed = 1;
  costF = 20;
  life = 5;

  spawnIdx = 0;

  // 实体
  enemies: Enemy[] = [];
  ops: Operator[] = [];
  effects: Effect[] = [];

  // 部署 / 选择
  placing: OpKind | null = null;
  pending: Pending | null = null;
  selected: Operator | null = null;

  private opGrid: Record<string, Operator> = {};
  // 每条路径一个 [idx -> op] 数组（仅近战阻挡用）
  private blockGrid: Array<Array<Operator | null>> = [];

  // ---------- 生命周期 ----------
  private loadLevel(idx: number): void {
    this.levelIndex = clamp(idx, 0, LEVELS.length - 1);
    this.level = LEVELS[this.levelIndex];
    this.time = 0;
    this.speed = 1;
    this.costF = this.level.startCost;
    this.life = this.level.life;
    this.spawnIdx = 0;
    this.enemies = [];
    this.ops = [];
    this.effects = [];
    this.opGrid = {};
    this.blockGrid = this.level.paths.map(() => []);
    this.placing = null;
    this.pending = null;
    this.selected = null;
  }

  /** 从第 1 关开始新游戏。 */
  start(): void {
    this.loadLevel(0);
    this.started = true;
    this.running = true;
    this.over = false;
    this.won = false;
  }

  /** 重新挑战当前关。 */
  restartLevel(): void {
    this.loadLevel(this.levelIndex);
    this.started = true;
    this.running = true;
    this.over = false;
    this.won = false;
  }

  hasNextLevel(): boolean { return this.levelIndex < LEVELS.length - 1; }

  /** 通关后进入下一关。 */
  nextLevel(): void {
    if (!this.hasNextLevel()) return;
    this.loadLevel(this.levelIndex + 1);
    this.started = true;
    this.running = true;
    this.over = false;
    this.won = false;
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

  update(dt: number): void {
    // 特效始终推进（即便暂停/结算，让结算瞬间的特效播放完）
    this.advanceEffects(dt);
    if (!this.running || this.over) return;
    for (let i = 0; i < this.speed && !this.over; i++) this.step(dt);
  }

  // ---------- 部署 ----------
  canPlace(kind: OpKind, r: number, c: number): boolean {
    const def = OPS[kind];
    if (this.opGrid[key(r, c)]) return false;
    const t = cellType(this.level, r, c);
    return def.melee ? t === 'r' : t === 'h';
  }

  affordable(kind: OpKind): boolean { return this.costF >= OPS[kind].cost; }

  setPlacing(kind: OpKind): void {
    if (!this.started || this.over || !this.affordable(kind)) return;
    this.selected = null;
    this.placing = kind;
    this.pending = null;
  }

  cancelPlacing(): void { this.placing = null; this.pending = null; }

  beginPending(r: number, c: number): boolean {
    const kind = this.placing;
    if (!kind || !this.canPlace(kind, r, c) || !this.affordable(kind)) {
      this.placing = null;
      return false;
    }
    const f = defaultFacing(this.level, OPS[kind].melee, r, c);
    this.pending = { kind, r, c, facing: f, defFacing: f };
    return true;
  }

  setPendingFacing(dxCells: number, dyCells: number): void {
    const p = this.pending;
    if (p) p.facing = facingFromVector(dxCells, dyCells, p.defFacing);
  }

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
      melee: def.melee, facing,
      cells: cellsFor(def, r, c, facing),
      blk: [], fire: 0, hurt: 0,
    };
    this.ops.push(op);
    this.opGrid[key(r, c)] = op;
    if (def.melee) {
      // 近战可能位于多条路径的重叠格，全部登记
      for (let pi = 0; pi < this.level.paths.length; pi++) {
        const p = this.level.paths[pi];
        for (let i = 0; i < p.length; i++) if (p[i].r === r && p[i].c === c) this.blockGrid[pi][i] = op;
      }
    }
    this.costF -= def.cost;
  }

  private removeOp(op: Operator): void {
    const i = this.ops.indexOf(op);
    if (i >= 0) this.ops.splice(i, 1);
    delete this.opGrid[key(op.r, op.c)];
    for (const col of this.blockGrid) {
      for (let i = 0; i < col.length; i++) if (col[i] === op) col[i] = null;
    }
    if (this.selected === op) this.selected = null;
  }

  // ---------- 选择 ----------
  opAt(r: number, c: number): Operator | undefined { return this.opGrid[key(r, c)]; }
  selectAt(r: number, c: number): Operator | null {
    this.selected = this.opGrid[key(r, c)] ?? null;
    return this.selected;
  }
  deselect(): void { this.selected = null; }
  retreatSelected(): void { if (this.selected) this.removeOp(this.selected); }

  // ---------- 模拟单步 ----------
  private step(dt: number): void {
    this.time += dt;
    this.costF = Math.min(MAX_COST, this.costF + COST_PER_SEC * dt);

    this.spawnDue();
    this.moveAndBlock(dt);
    this.reachGoal();
    this.enemyAttacks(dt);
    this.opActions(dt);

    for (const op of this.ops) { if (op.fire > 0) op.fire -= dt; if (op.hurt > 0) op.hurt -= dt; }
    for (const e of this.enemies) { e.age += dt; if (e.hurt > 0) e.hurt -= dt; }
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (!this.over && this.spawnIdx >= this.level.spawns.length && this.enemies.length === 0 && this.life > 0) {
      this.end(true);
    }
  }

  private advanceEffects(dt: number): void {
    for (const ef of this.effects) ef.life -= dt;
    this.effects = this.effects.filter((ef) => ef.life > 0);
  }

  private spawnDue(): void {
    const spawns = this.level.spawns;
    while (this.spawnIdx < spawns.length && spawns[this.spawnIdx].time <= this.time) {
      const sp = spawns[this.spawnIdx++];
      const ed = ENEMIES[sp.kind];
      const path = this.level.paths[sp.path] ?? this.level.paths[0];
      this.enemies.push({
        kind: sp.kind, def: ed, hp: ed.hp, maxhp: ed.hp, speed: ed.speed,
        path, pathPos: 0, blockedBy: null, atkCd: 0, age: 0, hurt: 0, dead: false,
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
      const pIdx = this.level.paths.indexOf(e.path);
      const col = this.blockGrid[pIdx] ?? [];
      const newPos = e.pathPos + e.speed * dt;
      let blocked = false;
      const startTile = Math.ceil(e.pathPos - 1e-6);
      const endTile = Math.min(Math.floor(newPos + 1e-6), e.path.length - 1);
      for (let ti = startTile; ti <= endTile; ti++) {
        const op = col[ti];
        if (op && op.block > 0 && op.blk.length < op.block) {
          e.pathPos = ti; op.blk.push(e); e.blockedBy = op; blocked = true; break;
        }
      }
      if (!blocked) e.pathPos = Math.min(newPos, e.path.length - 1);
    }
  }

  private reachGoal(): void {
    for (const e of this.enemies) {
      if (!e.dead && e.pathPos >= e.path.length - 1 - 1e-6) {
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
        op.hurt = 0.18;
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
        const allies = this.ops.filter((o) => o !== op && o.hp < o.maxhp && rangeSet.has(key(o.r, o.c)));
        if (allies.length === 0) continue;
        let t = allies[0];
        for (const o of allies) if (o.hp / o.maxhp < t.hp / t.maxhp) t = o;
        op.cd = op.def.interval;
        op.fire = 0.2;
        t.hp = Math.min(t.maxhp, t.hp + op.def.atk);
        this.push({ type: 'heal', at: { r: t.r, c: t.c }, life: 0.4, max: 0.4, color: op.def.color });
        continue;
      }

      const inRange = this.enemies.filter(
        (e) => !e.dead && rangeSet.has(key(pathCell(e.path, e.pathPos).r, pathCell(e.path, e.pathPos).c)),
      );
      if (inRange.length === 0) continue;
      op.cd = op.def.interval;
      op.fire = 0.2;

      if (op.def.aoe) {
        for (const e of inRange) this.damage(e, op.def.atk);
        let sr = 0, sc = 0;
        for (const c of op.cells) { sr += c.r; sc += c.c; }
        this.push({ type: 'aoe', at: { r: sr / op.cells.length, c: sc / op.cells.length }, life: 0.32, max: 0.32, color: op.def.color });
      } else {
        let cand = inRange.filter((e) => e.blockedBy === op);
        if (cand.length === 0) cand = inRange;
        let target = cand[0];
        for (const e of cand) if (e.pathPos > target.pathPos) target = e;
        this.damage(target, op.def.atk);
        const to = this.enemyRC(target);
        if (op.melee) {
          this.push({ type: 'slash', at: to, ang: Math.atan2(to.r - op.r, to.c - op.c), life: 0.2, max: 0.2, color: op.def.color });
        } else {
          this.push({ type: 'shot', from: { r: op.r, c: op.c }, to, life: 0.16, max: 0.16, color: op.def.color });
        }
      }
    }
  }

  private push(ef: Effect): void { this.effects.push(ef); }

  private enemyRC(e: Enemy): Vec {
    const i = Math.floor(e.pathPos);
    const f = e.pathPos - i;
    const a = e.path[clamp(i, 0, e.path.length - 1)];
    const b = e.path[clamp(i + 1, 0, e.path.length - 1)];
    return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
  }

  private damage(e: Enemy, amt: number): void {
    e.hp -= amt;
    e.hurt = 0.12;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.push({ type: 'death', at: this.enemyRC(e), life: 0.35, max: 0.35, color: e.def.color });
    }
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
      totalSpawns: this.level.spawns.length,
      speed: this.speed,
      placingKind: this.placing,
      levelIndex: this.levelIndex,
      levelCount: LEVELS.length,
      levelName: this.level.name,
      levelHint: this.level.hint,
      hasNextLevel: this.hasNextLevel(),
    };
  }
}
