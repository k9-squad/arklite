// 关卡定义：多路径地图 + 渐进波次。
// 设计思路（模仿明日方舟）：地图由路径自动生成——路径格为地面(r)，
// 其相邻格为高台(h)，其余为空(x)。关卡可有多条路径、多个出生/目标点。
import type { EnemyKind, Level, LevelSpawn, Vec } from './types';

const v = (r: number, c: number): Vec => ({ r, c });

/** 把折线航点展开为逐格路径（相邻航点必须共行或共列）。 */
function poly(points: Array<[number, number]>): Vec[] {
  const cells: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    const [r, c] = points[i];
    if (i === 0) { cells.push(v(r, c)); continue; }
    const [pr, pc] = points[i - 1];
    const dr = Math.sign(r - pr), dc = Math.sign(c - pc);
    let cr = pr, cc = pc;
    while (cr !== r || cc !== c) { cr += dr; cc += dc; cells.push(v(cr, cc)); }
  }
  return cells;
}

/** 由路径自动生成地图：路径=地面，周围 8 邻=高台，其余=空。 */
function mapFromPaths(rows: number, cols: number, paths: Vec[][]): string[] {
  const g: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'x'));
  for (const p of paths) for (const { r, c } of p) if (g[r]?.[c] !== undefined) g[r][c] = 'r';
  for (const p of paths) for (const { r, c } of p) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && g[nr][nc] === 'x') g[nr][nc] = 'h';
    }
  }
  return g.map((row) => row.join(''));
}

interface WaveEntry { kind: EnemyKind; count: number; gap: number; path?: number; }

/** 把若干波（顺序播放，波间留 lull 秒）展开成带时间戳的 spawns。 */
function schedule(waves: Array<{ at?: number; entries: WaveEntry[]; lull?: number }>, pathCount: number): LevelSpawn[] {
  const out: LevelSpawn[] = [];
  let t = 2;
  for (const w of waves) {
    if (w.at !== undefined) t = w.at;
    // 同一波内各 entry 并行展开（交替分配到默认路径）
    let local = t;
    for (const e of w.entries) {
      let tt = local;
      for (let i = 0; i < e.count; i++) {
        const path = e.path ?? (pathCount > 1 ? i % pathCount : 0);
        out.push({ time: +tt.toFixed(2), kind: e.kind, path });
        tt += e.gap;
      }
    }
    // 推进时间到本波最长 entry 之后
    const span = Math.max(...w.entries.map((e) => e.count * e.gap));
    t += span + (w.lull ?? 3);
  }
  return out.sort((a, b) => a.time - b.time);
}

function makeLevel(
  id: number, name: string, hint: string, rows: number, cols: number,
  pathPts: Array<Array<[number, number]>>,
  waves: Array<{ at?: number; entries: WaveEntry[]; lull?: number }>,
  life: number, startCost: number,
): Level {
  const paths = pathPts.map(poly);
  const map = mapFromPaths(rows, cols, paths);
  const spawns = schedule(waves, paths.length);
  return { id, name, hint, rows, cols, map, paths, spawns, life, startCost };
}

export const LEVELS: Level[] = [
  // ---------- 1：新手训练（单路，平缓） ----------
  makeLevel(1, '新手训练', '单一进攻路线，先用近卫挡住缺口。', 9, 6,
    [[[0, 1], [4, 1], [4, 4], [8, 4]]],
    [
      { entries: [{ kind: 'normal', count: 4, gap: 1.8 }] },
      { entries: [{ kind: 'normal', count: 5, gap: 1.5 }], lull: 4 },
      { entries: [{ kind: 'fast', count: 4, gap: 1.2 }] },
    ], 5, 20),

  // ---------- 2：曲折通道（单路，更长） ----------
  makeLevel(2, '曲折通道', '路线变长，合理摆放远程覆盖拐角。', 9, 6,
    [[[0, 0], [2, 0], [2, 4], [5, 4], [5, 1], [8, 1]]],
    [
      { entries: [{ kind: 'normal', count: 5, gap: 1.5 }] },
      { entries: [{ kind: 'fast', count: 6, gap: 1.0 }], lull: 4 },
      { entries: [{ kind: 'normal', count: 3, gap: 1.4 }, { kind: 'tank', count: 1, gap: 0 }] },
      { entries: [{ kind: 'fast', count: 6, gap: 0.9 }], lull: 3 },
    ], 5, 22),

  // ---------- 3：双道分流（两条路汇合） ----------
  makeLevel(3, '双道分流', '两路进攻在中段汇合，注意分配兵力。', 9, 7,
    [
      [[0, 0], [4, 0], [4, 3], [8, 3]],
      [[0, 6], [4, 6], [4, 3], [8, 3]],
    ],
    [
      { entries: [{ kind: 'normal', count: 6, gap: 1.4 }] },
      { entries: [{ kind: 'fast', count: 8, gap: 0.9 }], lull: 4 },
      { entries: [{ kind: 'tank', count: 2, gap: 2.5 }, { kind: 'normal', count: 6, gap: 1.2 }] },
      { entries: [{ kind: 'fast', count: 8, gap: 0.8 }, { kind: 'tank', count: 1, gap: 0 }], lull: 3 },
    ], 4, 24),

  // ---------- 4：双门夹击（两条独立路线、两个目标） ----------
  makeLevel(4, '双门夹击', '两路通向不同目标点，两侧都要防守。', 10, 7,
    [
      [[0, 0], [3, 0], [3, 2], [9, 2]],
      [[0, 6], [3, 6], [3, 4], [9, 4]],
    ],
    [
      { entries: [{ kind: 'normal', count: 6, gap: 1.3 }] },
      { entries: [{ kind: 'runner', count: 5, gap: 1.0 }], lull: 4 },
      { entries: [{ kind: 'tank', count: 2, gap: 2.2 }, { kind: 'fast', count: 6, gap: 1.0 }] },
      { entries: [{ kind: 'runner', count: 6, gap: 0.8 }, { kind: 'normal', count: 4, gap: 1.3 }], lull: 3 },
      { entries: [{ kind: 'tank', count: 2, gap: 1.8 }] },
    ], 4, 26),

  // ---------- 5：交叉要道（两路交叉，速攻压力） ----------
  makeLevel(5, '交叉要道', '高速冲锋兵增多，远程火力是关键。', 10, 7,
    [
      [[0, 1], [5, 1], [5, 5], [9, 5]],
      [[0, 5], [3, 5], [3, 1], [9, 1]],
    ],
    [
      { entries: [{ kind: 'fast', count: 6, gap: 1.0 }] },
      { entries: [{ kind: 'runner', count: 8, gap: 0.7 }], lull: 4 },
      { entries: [{ kind: 'tank', count: 3, gap: 2.0 }, { kind: 'fast', count: 8, gap: 0.9 }] },
      { entries: [{ kind: 'runner', count: 10, gap: 0.6 }], lull: 3 },
      { entries: [{ kind: 'tank', count: 2, gap: 1.6 }, { kind: 'normal', count: 6, gap: 1.0 }] },
    ], 3, 28),

  // ---------- 6：终焉防线（三路 + Boss） ----------
  makeLevel(6, '终焉防线', '三路齐发，并有重型首领，全力防守！', 11, 7,
    [
      [[0, 0], [5, 0], [5, 3], [10, 3]],
      [[0, 3], [10, 3]],
      [[0, 6], [5, 6], [5, 3], [10, 3]],
    ],
    [
      { entries: [{ kind: 'normal', count: 6, gap: 1.2 }, { kind: 'fast', count: 6, gap: 1.2 }] },
      { entries: [{ kind: 'runner', count: 9, gap: 0.7 }], lull: 4 },
      { entries: [{ kind: 'tank', count: 3, gap: 2.0 }, { kind: 'fast', count: 9, gap: 0.8 }] },
      { entries: [{ kind: 'runner', count: 12, gap: 0.5 }, { kind: 'normal', count: 6, gap: 1.0 }], lull: 4 },
      { entries: [{ kind: 'brute', count: 1, gap: 0, path: 1 }, { kind: 'tank', count: 4, gap: 1.5 }], lull: 0 },
    ], 3, 30),
];
