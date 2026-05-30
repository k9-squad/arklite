// 敌人波次（绝对生成时间，秒）
import type { Spawn, EnemyKind } from './types';

export function buildSpawns(): Spawn[] {
  const s: Spawn[] = [];
  const add = (time: number, kind: EnemyKind) => s.push({ time: +time.toFixed(2), kind });
  let t = 2;

  for (let i = 0; i < 5; i++) { add(t, 'normal'); t += 1.7; }   // 波1
  t += 4;
  for (let i = 0; i < 6; i++) { add(t, 'fast'); t += 1.1; }      // 波2
  t += 4;
  for (let i = 0; i < 3; i++) { add(t, 'tank'); add(t + 0.6, 'normal'); t += 3.2; } // 波3
  t += 3;
  for (let i = 0; i < 8; i++) { add(t, i % 2 ? 'fast' : 'normal'); t += 0.85; }      // 终波
  add(t + 1.5, 'tank');
  add(t + 1.9, 'tank');

  return s.sort((a, b) => a.time - b.time);
}
