// 干员定义
import type { OpDef, OpKind } from './types';

/** 生成矩形 [forward, side] 偏移列表。 */
function rect(fwds: number[], sides: number[]): Array<[number, number]> {
  const a: Array<[number, number]> = [];
  for (const f of fwds) for (const s of sides) a.push([f, s]);
  return a;
}

/** 矩形区域：含干员自身所在层（fwd=0），但排除干员脚下那一格 (0,0)。 */
function area(fwds: number[], sides: number[]): Array<[number, number]> {
  return rect(fwds, sides).filter(([f, s]) => !(f === 0 && s === 0));
}

export const RANGES: Record<OpKind, Array<[number, number]>> = {
  guard: [[0, 0], [1, 0]],                              // 1×2 含自身格（攻击被阻挡的敌人）
  def: [[0, 0]],                                        // 1×1 仅自身格
  sniper: area([0, 1, 2, 3], [-1, 0, 1]),              // 3×4（含自身列）
  caster: area([0, 1], [-1, 0, 1]),                    // 3×2（含自身列）群攻
  medic: area([0, 1, 2], [-1, 0, 1]).concat([[3, 0]] as Array<[number, number]>), // 3×3（含自身列）+ 最前 1 格
};

export const OPS: Record<OpKind, OpDef> = {
  guard: {
    kind: 'guard', name: '近卫', cn: '卫', color: '#e8913c',
    melee: true, block: 1, cost: 17, atk: 60, interval: 0.9, hp: 600,
    aoe: false, support: false, range: RANGES.guard,
    sub: '阻挡1 · 1×2', roleTxt: '近战单体', tier: '高攻 · 中攻速 · 中血',
    blockTxt: '可阻挡 1 个敌人，优先攻击被自己阻挡的敌人。',
    atkTxt: '攻击范围为身前 1×2，单体高伤害。',
  },
  def: {
    kind: 'def', name: '重装', cn: '重', color: '#3c7be8',
    melee: true, block: 3, cost: 15, atk: 28, interval: 1.0, hp: 1400,
    aoe: false, support: false, range: RANGES.def,
    sub: '阻挡3 · 1×1', roleTxt: '近战坦克', tier: '低攻 · 中攻速 · 高血',
    blockTxt: '可阻挡 3 个敌人，是前线的中流砥柱。',
    atkTxt: '攻击范围仅自身 1 格，伤害较低但血量厚。',
  },
  sniper: {
    kind: 'sniper', name: '射手', cn: '射', color: '#3ce86a',
    melee: false, block: 0, cost: 16, atk: 45, interval: 0.45, hp: 250,
    aoe: false, support: false, range: RANGES.sniper,
    sub: '远程 · 3×4', roleTxt: '远程单体', tier: '中攻 · 高攻速 · 低血',
    blockTxt: '部署于高台，不阻挡敌人。',
    atkTxt: '攻击范围为身前 3×4，攻速快，单体输出。',
  },
  caster: {
    kind: 'caster', name: '群法', cn: '术', color: '#b04ce8',
    melee: false, block: 0, cost: 25, atk: 70, interval: 1.5, hp: 280,
    aoe: true, support: false, range: RANGES.caster,
    sub: '群攻 · 3×2', roleTxt: '远程群攻', tier: '高攻 · 慢攻速 · 低血',
    blockTxt: '部署于高台，不阻挡敌人。',
    atkTxt: '同时攻击范围内（身前 3×2）的所有敌人。',
  },
  medic: {
    kind: 'medic', name: '医疗', cn: '医', color: '#34d399',
    melee: false, block: 0, cost: 14, atk: 60, interval: 1.0, hp: 600,
    aoe: false, support: true, range: RANGES.medic,
    sub: '治疗 · 3×3+1', roleTxt: '治疗支援', tier: '中疗 · 中攻速 · 中血',
    blockTxt: '部署于高台，不阻挡敌人。',
    atkTxt: '治疗范围（身前 3×3+1）内血量最低的友方干员。',
  },
};

export const OP_ORDER: OpKind[] = ['guard', 'def', 'sniper', 'caster', 'medic'];
