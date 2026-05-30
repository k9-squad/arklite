// 敌人定义
import type { EnemyDef, EnemyKind } from './types';

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  normal: { color: '#e05050', hp: 120, speed: 0.85, atk: 22, atkInt: 1.0, rad: 0.30 },
  fast:   { color: '#e6d24a', hp: 65,  speed: 1.7,  atk: 13, atkInt: 1.0, rad: 0.24 },
  tank:   { color: '#8a3030', hp: 420, speed: 0.5,  atk: 45, atkInt: 1.2, rad: 0.40 },
};
