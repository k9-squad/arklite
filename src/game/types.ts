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
  blk: Enemy[];       // 当前阻挡的敌人（每帧重算）
  fire: number;       // 开火动画计时（秒，递减）
  hurt: number;       // 受击闪烁计时（秒，递减）
}

export type EnemyKind = 'normal' | 'fast' | 'tank' | 'runner' | 'brute';

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
  path: Vec[];        // 所属路径
  pathPos: number;    // 沿该路径的连续位置
  blockedBy: Operator | null;
  atkCd: number;
  age: number;        // 存活时间（用于出场动画）
  hurt: number;       // 受击闪烁计时
  dead: boolean;
}

export type Effect =
  | { type: 'shot'; from: Vec; to: Vec; life: number; max: number; color: string }
  | { type: 'slash'; at: Vec; ang: number; life: number; max: number; color: string }
  | { type: 'aoe'; at: Vec; life: number; max: number; color: string }
  | { type: 'heal'; at: Vec; life: number; max: number; color: string }
  | { type: 'death'; at: Vec; life: number; max: number; color: string };

export interface Pending {
  kind: OpKind;
  r: number;
  c: number;
  facing: Facing;
  defFacing: Facing;
}

export interface LevelSpawn { time: number; kind: EnemyKind; path: number; }

/** 关卡：地图 + 多条路径 + 波次。 */
export interface Level {
  id: number;
  name: string;
  hint: string;
  rows: number;
  cols: number;
  map: string[];        // 每格：r 地面 / h 高台 / x 空
  paths: Vec[][];       // 多条敌人路径，每条为有序格子
  spawns: LevelSpawn[];
  life: number;
  startCost: number;
}

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
  levelIndex: number;
  levelCount: number;
  levelName: string;
  levelHint: string;
  hasNextLevel: boolean;
}
