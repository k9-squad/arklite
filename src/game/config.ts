// 地图与全局平衡常量
import type { Vec } from './types';

// S=出生点  T=目标点  r=地面(近战可部署/敌人行走)  h=高台(远程可部署)  x=空地
export const MAP: string[] = [
  'hShxx',
  'hrhxx',
  'hrrrh',
  'xhhrh',
  'hrrrh',
  'hrhxx',
  'hrrrh',
  'xhhTh',
];

export const ROWS = MAP.length;
export const COLS = MAP[0].length;

// 敌人行进路径（按顺序排列的地面格）
const RAW_PATH: Array<[number, number]> = [
  [0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3],
  [4, 2], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3], [7, 3],
];
export const PATH: Vec[] = RAW_PATH.map(([r, c]) => ({ r, c }));

export const pathIndexAt: Record<string, number> = {};
PATH.forEach((p, i) => { pathIndexAt[p.r + ',' + p.c] = i; });

// 经济 / 局势
export const START_COST = 20;
export const MAX_COST = 99;
export const COST_PER_SEC = 1;
export const START_LIFE = 3;
