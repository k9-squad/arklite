// 游戏引擎：持有全部状态并推进模拟。完全独立于 DOM / 渲染 / 框架。
import type {
  Effect, Enemy, Facing, Level, Operator, OpKind, Pending, Projectile, UiSnapshot, Vec,
} from './types';
import { BULLET_TIME, COST_PER_SEC, HP_EASE, MAX_COST, MIN_DAMAGE, PROJECTILE_SPEED } from './config';
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
  leaked = false;     // 本局是否有敌人进入目标点

  spawnIdx = 0;

  // 实体
  enemies: Enemy[] = [];
  ops: Operator[] = [];
  effects: Effect[] = [];
  projectiles: Projectile[] = [];

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
    this.leaked = false;
    this.spawnIdx = 0;
    this.enemies = [];
    this.ops = [];
    this.effects = [];
    this.projectiles = [];
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

  /** 结算星级：3=完美（无漏怪），2=通关但漏怪，0=未通关。 */
  stars(): number {
    if (!this.over || !this.won) return 0;
    return this.leaked ? 2 : 3;
  }

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

  /** 部署落子、瞄准朝向期间进入子弹时间，给玩家决策时间。 */
  get bulletTime(): boolean { return this.pending !== null; }

  update(dt: number): void {
    // 特效与弹道、血条缓动始终推进（即便暂停/结算，让动画播放完）
    this.advanceEffects(dt);
    this.advanceProjectiles(dt);
    this.smoothHp(dt);
    if (!this.running || this.over) return;
    if (this.bulletTime) { this.step(dt * BULLET_TIME); return; }
    for (let i = 0; i < this.speed && !this.over; i++) this.step(dt);
  }

  private smoothHp(dt: number): void {
    const f = Math.min(1, HP_EASE * dt);
    for (const o of this.ops) o.hpShown += (o.hp - o.hpShown) * f;
    for (const e of this.enemies) e.hpShown += (e.hp - e.hpShown) * f;
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
      blk: [], fire: 0, hurt: 0, hpShown: def.hp,
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
        path, pathPos: 0, blockedBy: null, blockSlot: -1, blockTotal: 0,
        atkCd: 0, age: 0, hurt: 0, hpShown: ed.hp, dead: false,
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
      e.blockSlot = -1;
      const pIdx = this.level.paths.indexOf(e.path);
      const col = this.blockGrid[pIdx] ?? [];
      const newPos = e.pathPos + e.speed * dt;
      let blocked = false;
      const startTile = Math.ceil(e.pathPos - 1e-6);
      const endTile = Math.min(Math.floor(newPos + 1e-6), e.path.length - 1);
      for (let ti = startTile; ti <= endTile; ti++) {
        const op = col[ti];
        if (op && op.block > 0 && op.blk.length < op.block) {
          e.pathPos = ti; e.blockSlot = op.blk.length; op.blk.push(e);
          e.blockedBy = op; blocked = true; break;
        }
      }
      if (!blocked) e.pathPos = Math.min(newPos, e.path.length - 1);
    }
    // 记录各敌人所在阻挡组的总数（供错开布局）
    for (const e of this.enemies) {
      e.blockTotal = e.blockedBy ? e.blockedBy.blk.length : 0;
    }
  }

  private reachGoal(): void {
    for (const e of this.enemies) {
      if (!e.dead && e.pathPos >= e.path.length - 1 - 1e-6) {
        e.dead = true;
        this.life--;
        this.leaked = true;
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
        // 治疗弹道：飞向友军，命中时回血
        this.spawnProjectile(op, t, op.def.atk, op.def.magic, true);
        continue;
      }

      const inRange = this.enemies.filter(
        (e) => !e.dead && rangeSet.has(key(pathCell(e.path, e.pathPos).r, pathCell(e.path, e.pathPos).c)),
      );
      if (inRange.length === 0) continue;
      op.cd = op.def.interval;
      op.fire = 0.2;

      if (op.def.aoe) {
        // 群法：范围瞬发
        for (const e of inRange) this.damage(e, op.def.atk, op.def.magic);
        let sr = 0, sc = 0;
        for (const c of op.cells) { sr += c.r; sc += c.c; }
        this.push({ type: 'aoe', at: { r: sr / op.cells.length, c: sc / op.cells.length }, life: 0.32, max: 0.32, color: op.def.color });
      } else {
        // 优先攻击自身阻挡的敌人，否则最靠前者
        let cand = inRange.filter((e) => e.blockedBy === op);
        if (cand.length === 0) cand = inRange;
        let target = cand[0];
        for (const e of cand) if (e.pathPos > target.pathPos) target = e;
        if (op.melee) {
          // 近战：瞬发挥砍
          this.damage(target, op.def.atk, op.def.magic);
          const to = this.enemyRC(target);
          this.push({ type: 'slash', at: to, ang: Math.atan2(to.r - op.r, to.c - op.c), life: 0.2, max: 0.2, color: op.def.color });
        } else {
          // 远程（射手/单法）：发射弹道，命中时结算
          this.spawnProjectile(op, target, op.def.atk, op.def.magic, false);
        }
      }
    }
  }

  private spawnProjectile(op: Operator, target: Enemy | Operator, amount: number, magic: boolean, heal: boolean): void {
    const to = heal
      ? { r: (target as Operator).r, c: (target as Operator).c }
      : this.enemyRC(target as Enemy);
    this.projectiles.push({
      x: op.c, y: op.r, target, tx: to.c, ty: to.r,
      speed: PROJECTILE_SPEED, color: op.def.color, amount, magic, heal, dead: false,
    });
  }

  private advanceProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      // 更新目标当前位置（始终面向目标）
      if (p.target && !(p.target as Enemy).dead) {
        const t = p.target;
        const to = p.heal ? { r: (t as Operator).r, c: (t as Operator).c } : this.enemyRC(t as Enemy);
        p.tx = to.c; p.ty = to.r;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 1e-4) {
        // 命中
        p.dead = true;
        const t = p.target;
        if (t && !(t as Enemy).dead) {
          if (p.heal) {
            const o = t as Operator;
            o.hp = Math.min(o.maxhp, o.hp + p.amount);
            this.push({ type: 'hit', at: { r: o.r, c: o.c }, life: 0.3, max: 0.3, color: p.color, heal: true });
          } else {
            this.damage(t as Enemy, p.amount, p.magic);
            this.push({ type: 'hit', at: { r: p.ty, c: p.tx }, life: 0.25, max: 0.25, color: p.color, heal: false });
          }
        }
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private push(ef: Effect): void { this.effects.push(ef); }

  private enemyRC(e: Enemy): Vec {
    const i = Math.floor(e.pathPos);
    const f = e.pathPos - i;
    const a = e.path[clamp(i, 0, e.path.length - 1)];
    const b = e.path[clamp(i + 1, 0, e.path.length - 1)];
    return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
  }

  /** 结算伤害。物理伤害受护甲减免（保底 MIN_DAMAGE）；魔法伤害无视护甲。 */
  private damage(e: Enemy, amt: number, magic: boolean): void {
    const dealt = magic ? amt : Math.max(amt - e.def.armor, MIN_DAMAGE);
    e.hp -= dealt;
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
      stars: this.stars(),
      leaked: this.leaked,
      bulletTime: this.bulletTime,
    };
  }
}
