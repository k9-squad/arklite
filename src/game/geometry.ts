// 网格 / 朝向 / 范围几何（纯函数，不依赖像素或全局地图）
import type { Facing, Level, OpDef, Vec } from './types';

export const key = (r: number, c: number): string => r + ',' + c;
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function cellType(level: Level, r: number, c: number): string {
  if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) return 'x';
  return level.map[r][c];
}

/** 沿某路径取整所在格（用于范围判定）。 */
export function pathCell(path: Vec[], pathPos: number): Vec {
  const i = clamp(Math.round(pathPos), 0, path.length - 1);
  return path[i];
}

/** 沿某路径的分数网格坐标（供渲染插值）。 */
export function pathPosToRC(path: Vec[], pathPos: number): Vec {
  const i = Math.floor(pathPos);
  const f = pathPos - i;
  const a = path[clamp(i, 0, path.length - 1)];
  const b = path[clamp(i + 1, 0, path.length - 1)];
  return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
}

/** 找出经过格 (r,c) 的某条路径上的索引；找不到返回 -1。 */
export function pathIndexOnAnyPath(paths: Vec[][], r: number, c: number): { path: number; idx: number } | null {
  for (let pi = 0; pi < paths.length; pi++) {
    const p = paths[pi];
    for (let i = 0; i < p.length; i++) if (p[i].r === r && p[i].c === c) return { path: pi, idx: i };
  }
  return null;
}

/** 距离任意路径最近的格（用于远程默认朝向）。 */
function nearestPathCell(paths: Vec[][], r: number, c: number): Vec {
  let best = paths[0]?.[0] ?? { r, c };
  let bd = Infinity;
  for (const p of paths) for (const cell of p) {
    const d = (cell.r - r) ** 2 + (cell.c - c) ** 2;
    if (d < bd) { bd = d; best = cell; }
  }
  return best;
}

/** 部署时的默认朝向（近战朝最近路径来向，远程朝最近路径）。 */
export function defaultFacing(level: Level, melee: boolean, r: number, c: number): Facing {
  if (melee) {
    const hit = pathIndexOnAnyPath(level.paths, r, c);
    if (hit) {
      const p = level.paths[hit.path];
      const ref = hit.idx > 0 ? p[hit.idx - 1] : p[hit.idx + 1] ?? p[hit.idx];
      const ddr = ref.r - r, ddc = ref.c - c;
      return Math.abs(ddr) >= Math.abs(ddc) ? { dr: sign(ddr), dc: 0 } : { dr: 0, dc: sign(ddc) };
    }
  }
  const near = nearestPathCell(level.paths, r, c);
  const ddr = near.r - r, ddc = near.c - c;
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
