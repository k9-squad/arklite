// 共享类型定义（纯数据，无 DOM / 框架依赖）

export interface Vec { r: number; c: number; }
export interface Facing { dr: number; dc: number; }

export type OpKind = 'guard' | 'def' | 'sniper' | 'caster' | 'medic';

/** 干员的静态定义。range 为 [forward, side] 偏移列表（朝向部署时可旋转）。 */
export interface OpDef {
  kind: OpKind;
  name: string;
  cn: string;
  color: string;
  melee: boolean;
  block: number;
  cost: number;
  atk: number;        // 伤害；support 时为治疗量
  interval: number;   // 攻击/治疗间隔（秒）
  hp: number;
  aoe: boolean;
  support: boolean;
  range: Array<[number, number]>;
  sub: string;        // 卡片副标题
  roleTxt: string;
  tier: string;
  blockTxt: string;
  atkTxt: string;
}

/** 已部署的干员实例。 */
export interface Operator {
  def: OpDef;
  kind: OpKind;
  r: number;
  c: number;
  hp: number;
  maxhp: number;
  cd: number;
  block: number;
  melee: boolean;
  facing: Facing;
  cells: Vec[];
  pathIndex: number;  // 位于路径上的索引（仅近战），否则 -1
  blk: Enemy[];       // 当前阻挡的敌人（每帧重算）
}

export type EnemyKind = 'normal' | 'fast' | 'tank';

export interface EnemyDef {
  color: string;
  hp: number;
  speed: number;
  atk: number;
  atkInt: number;
  rad: number;
}

export interface Enemy {
  kind: EnemyKind;
  def: EnemyDef;
  hp: number;
  maxhp: number;
  speed: number;
  pathPos: number;
  blockedBy: Operator | null;
  atkCd: number;
  dead: boolean;
}

export type Effect =
  | { type: 'shot'; from: Vec; to: Vec; life: number; color: string }
  | { type: 'slash'; at: Vec; ang: number; life: number; color: string }
  | { type: 'aoe'; at: Vec; life: number; color: string }
  | { type: 'heal'; at: Vec; life: number; color: string };

export interface Pending {
  kind: OpKind;
  r: number;
  c: number;
  facing: Facing;
  defFacing: Facing;
}

export interface Spawn { time: number; kind: EnemyKind; }

/** 暴露给 UI 层的精简快照。 */
export interface UiSnapshot {
  started: boolean;
  running: boolean;
  over: boolean;
  won: boolean;
  cost: number;
  life: number;
  spawnIdx: number;
  totalSpawns: number;
  speed: number;
  placingKind: OpKind | null;
}
