// 共享类型定义（纯数据，无 DOM / 框架依赖）

export interface Vec { r: number; c: number; }
export interface Facing { dr: number; dc: number; }

export type OpKind = 'guard' | 'def' | 'sniper' | 'caster' | 'mage' | 'medic';

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
  magic: boolean;     // true=魔法伤害(无视护甲)；false=物理伤害(受护甲减免)
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
  hpShown: number;    // 血条平滑显示值（向 hp 缓动）
}

export type EnemyKind = 'normal' | 'fast' | 'tank' | 'runner' | 'brute';

export interface EnemyDef {
  color: string;
  hp: number;
  speed: number;
  atk: number;
  atkInt: number;
  armor: number;      // 物理防御力（魔法伤害无视）
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
  blockSlot: number;  // 在阻挡者的阻挡队列中的序号（用于错开显示），未阻挡为 -1
  blockTotal: number; // 阻挡者当前阻挡总数（用于错开布局）
  atkCd: number;
  age: number;        // 存活时间（用于出场动画）
  hurt: number;       // 受击闪烁计时
  hpShown: number;    // 血条平滑显示值
  dead: boolean;
}

export type Effect =
  | { type: 'slash'; at: Vec; ang: number; life: number; max: number; color: string }
  | { type: 'aoe'; at: Vec; life: number; max: number; color: string }
  | { type: 'heal'; at: Vec; life: number; max: number; color: string }
  | { type: 'death'; at: Vec; life: number; max: number; color: string }
  | { type: 'hit'; at: Vec; life: number; max: number; color: string; heal: boolean };

/** 飞行弹道：恒定速度朝目标飞行，命中时结算伤害/治疗并播放命中特效。 */
export interface Projectile {
  x: number;            // 当前位置（网格分数坐标）
  y: number;
  target: Enemy | Operator | null; // 追踪目标（可能中途死亡）
  tx: number;           // 目标快照坐标（目标消失时用）
  ty: number;
  speed: number;        // 格/秒
  color: string;
  amount: number;       // 伤害量或治疗量
  magic: boolean;
  heal: boolean;        // true=治疗弹道
  dead: boolean;
}

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
  stars: number;      // 本局结算星级：3=完美通关，2=通关但有漏怪，0=未通关
  leaked: boolean;    // 是否有敌人进入目标点
  bulletTime: boolean; // 是否处于部署子弹时间
}
