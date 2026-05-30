// 敌人定义
import type { EnemyDef, EnemyKind } from './types';

// armor = 物理防御力（魔法无视）。最终物理伤害 = max(攻击-护甲, 保底5)。
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  normal: { color: '#e05050', hp: 120,  speed: 0.85, atk: 22, atkInt: 1.0, armor: 10,  rad: 0.30 },
  fast:   { color: '#e6d24a', hp: 65,   speed: 1.7,  atk: 13, atkInt: 1.0, armor: 0,   rad: 0.24 }, // 轻甲速攻
  tank:   { color: '#8a3030', hp: 420,  speed: 0.5,  atk: 45, atkInt: 1.2, armor: 40,  rad: 0.40 }, // 重甲
  runner: { color: '#4ad0e6', hp: 45,   speed: 2.4,  atk: 10, atkInt: 1.0, armor: 0,   rad: 0.22 }, // 极速冲刺、无甲
  brute:  { color: '#6a2a6a', hp: 900,  speed: 0.42, atk: 70, atkInt: 1.3, armor: 60,  rad: 0.46 }, // 重型 Boss，高甲
};
