/* 폴리오미노 — 답 탐색 (순수 모듈). 빈 칸 중 놓을 수 있는 방법이 가장 적은 칸을 골라 거기를 덮는 배치를 차례로 시도하는
   정확 피복 백트래킹. 피스 개수(유한/무제한)를 그대로 다루며, 칸 기준으로 분기하므로 같은 답이 두 번 나오지 않는다. */
import { cellKey, inBoard, isHole, orientations } from './model';
import type { Board, Shape, SymmetryOpts, Cell } from './model';

export interface SolverPiece { key: string; shape: Shape; count: number | 'inf'; }
export interface SolverPlacement { key: string; cells: Shape; x: number; y: number; }
export interface SolveOptions extends SymmetryOpts {
  maxSolutions?: number;   /* 기본 500 */
  maxSteps?: number;       /* 기본 3,000,000 */
  fixedCells?: Iterable<string>;   /* 이미 덮여 있어 탐색에서 제외할 칸 ("x,y") */
}
export interface SolveResult {
  solutions: SolverPlacement[][];
  truncated: boolean;     /* 상한에 걸려 중단 (더 있을 수 있음) */
  steps: number;
  reason?: string;        /* 탐색 전에 불가능이 확정된 이유 */
}

export function solve(board: Board, pieces: SolverPiece[], opts: SolveOptions): SolveResult {
  const maxSolutions = opts.maxSolutions ?? 500;
  const maxSteps = opts.maxSteps ?? 3000000;
  const fixed = new Set(opts.fixedCells || []);

  /* 채울 칸 인덱싱 */
  const idx = new Map<string, number>();
  const cells: Cell[] = [];
  for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) {
    const k = cellKey(x, y);
    if (isHole(board, x, y) || fixed.has(k)) continue;
    idx.set(k, cells.length); cells.push([x, y]);
  }
  const N = cells.length;
  const result: SolveResult = { solutions: [], truncated: false, steps: 0 };
  const live = pieces.filter(p => p.count === 'inf' || p.count > 0);
  if (N === 0) { result.solutions.push([]); if (live.some(p => p.count !== 'inf')) { result.solutions = []; result.reason = '채울 칸이 없는데 써야 할 피스가 남아 있습니다.'; } return result; }
  if (!live.length) { result.reason = '쓸 피스가 없습니다.'; return result; }

  /* 면적 검사 */
  const finiteArea = live.reduce((s, p) => s + (p.count === 'inf' ? 0 : p.count * p.shape.length), 0);
  const hasInf = live.some(p => p.count === 'inf');
  if (finiteArea > N) { result.reason = '피스의 총 칸 수(' + finiteArea + ')가 채울 칸 수(' + N + ')보다 많습니다.'; return result; }
  if (!hasInf && finiteArea < N) { result.reason = '피스의 총 칸 수(' + finiteArea + ')가 채울 칸 수(' + N + ')보다 적습니다.'; return result; }

  /* 모든 배치 후보: 피스 × 변형 × 위치 */
  interface Cand { pi: number; cells: Shape; x: number; y: number; idxs: number[]; }
  const cands: Cand[] = [];
  const byCell: number[][] = cells.map(() => []);
  live.forEach((p, pi) => {
    for (const o of orientations(p.shape, opts)) {
      let w = 0, h = 0; for (const [x, y] of o) { if (x + 1 > w) w = x + 1; if (y + 1 > h) h = y + 1; }
      for (let y = 0; y + h <= board.h; y++) for (let x = 0; x + w <= board.w; x++) {
        const idxs: number[] = [];
        let ok = true;
        for (const [dx, dy] of o) { const i = idx.get(cellKey(x + dx, y + dy)); if (i === undefined || !inBoard(board, x + dx, y + dy)) { ok = false; break; } idxs.push(i); }
        if (!ok) continue;
        const ci = cands.length;
        cands.push({ pi, cells: o, x, y, idxs });
        for (const i of idxs) byCell[i].push(ci);
      }
    }
  });
  if (byCell.some(l => !l.length)) { result.reason = '어떤 피스로도 덮을 수 없는 칸이 있습니다.'; return result; }

  const covered = new Uint8Array(N);
  const remaining = live.map(p => p.count === 'inf' ? Infinity : p.count);
  let uncoveredCount = N;
  const chosen: Cand[] = [];
  let steps = 0, truncated = false;

  const candOk = (c: Cand): boolean => {
    if (remaining[c.pi] <= 0) return false;
    for (const i of c.idxs) if (covered[i]) return false;
    return true;
  };

  function rec(): void {
    if (truncated) return;
    if (uncoveredCount === 0) {
      /* 유한 피스는 전부 써야 함 */
      for (let i = 0; i < live.length; i++) if (remaining[i] !== Infinity && remaining[i] > 0) return;
      result.solutions.push(chosen.map(c => ({ key: live[c.pi].key, cells: c.cells, x: c.x, y: c.y })));
      if (result.solutions.length >= maxSolutions) truncated = true;
      return;
    }
    /* 선택지가 가장 적은 빈 칸 */
    let best = -1, bestN = Infinity;
    for (let i = 0; i < N; i++) {
      if (covered[i]) continue;
      let n = 0;
      for (const ci of byCell[i]) { if (candOk(cands[ci])) { n++; if (n >= bestN) break; } }
      if (n < bestN) { bestN = n; best = i; if (n === 0) return; }
    }
    for (const ci of byCell[best]) {
      const c = cands[ci];
      if (!candOk(c)) continue;
      if (++steps > maxSteps) { truncated = true; return; }
      for (const i of c.idxs) covered[i] = 1;
      uncoveredCount -= c.idxs.length; remaining[c.pi]--; chosen.push(c);
      rec();
      chosen.pop(); remaining[c.pi]++; uncoveredCount += c.idxs.length;
      for (const i of c.idxs) covered[i] = 0;
      if (truncated) return;
    }
  }
  rec();
  result.steps = steps; result.truncated = truncated;
  return result;
}
