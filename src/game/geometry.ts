// 网格 / 朝向 / 范围几何（纯函数，不依赖像素）
import type { Facing, OpDef, Vec } from './types';
import { COLS, MAP, PATH, ROWS, pathIndexAt } from './config';

export const key = (r: number, c: number): string => r + ',' + c;
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function cellType(r: number, c: number): string {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return 'x';
  return MAP[r][c];
}

/** 敌人当前所在格（路径取整，用于范围判定）。 */
export function enemyCell(pathPos: number): Vec {
  const i = clamp(Math.round(pathPos), 0, PATH.length - 1);
  return PATH[i];
}

/** 把连续的 pathPos 转换为分数网格坐标（供渲染插值）。 */
export function pathPosToRC(pathPos: number): Vec {
  const i = Math.floor(pathPos);
  const f = pathPos - i;
  const a = PATH[clamp(i, 0, PATH.length - 1)];
  const b = PATH[clamp(i + 1, 0, PATH.length - 1)];
  return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
}

/** 部署时的默认朝向（近战朝敌人来向，远程朝最近路径）。 */
export function defaultFacing(melee: boolean, r: number, c: number): Facing {
  if (melee) {
    const pi = pathIndexAt[key(r, c)];
    const ref = pi > 0 ? PATH[pi - 1] : PATH[pi + 1];
    const ddr = ref.r - r, ddc = ref.c - c;
    return Math.abs(ddr) >= Math.abs(ddc) ? { dr: sign(ddr), dc: 0 } : { dr: 0, dc: sign(ddc) };
  }
  let best = PATH[0];
  let bd = Infinity;
  for (const p of PATH) {
    const d = (p.r - r) ** 2 + (p.c - c) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  const ddr = best.r - r, ddc = best.c - c;
  if (ddr === 0 && ddc === 0) return { dr: -1, dc: 0 };
  return Math.abs(ddr) >= Math.abs(ddc) ? { dr: sign(ddr), dc: 0 } : { dr: 0, dc: sign(ddc) };
}

/** 由朝向 + 偏移列表得到实际覆盖格。forwardVec=f；sideVec=(f.dc,-f.dr)。 */
export function cellsFor(def: OpDef, r: number, c: number, f: Facing): Vec[] {
  const svr = f.dc, svc = -f.dr;
  return def.range.map(([fwd, side]) => ({
    r: r + fwd * f.dr + side * svr,
    c: c + fwd * f.dc + side * svc,
  }));
}

/** 由拖动向量（单位：格）得到四方向之一，过短则回退默认朝向。 */
export function facingFromVector(dxCells: number, dyCells: number, fallback: Facing): Facing {
  if (Math.hypot(dxCells, dyCells) < 0.35) return fallback;
  return Math.abs(dxCells) > Math.abs(dyCells)
    ? { dr: 0, dc: sign(dxCells) }
    : { dr: sign(dyCells), dc: 0 };
}
