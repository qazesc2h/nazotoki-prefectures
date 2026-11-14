/* 폴리오미노 — 고른 피스 항목 (순수 모듈).
   항목 = 카탈로그 피스 + 고른 방향 + 개수. 같은 모양이라도 방향이 다르면 다른 항목이다.
   「회전 허용」「뒤집기 허용」은 고른 뒤 그 방향에서 얼마나 돌릴 수 있는지만 정한다. */
import { normalize, shapeKey, canonicalKey, orientations, flipH, ONE_SIDED } from './model';
import type { Shape, SymmetryOpts, Placement } from './model';
import type { SolverPiece, SolverPlacement } from './solver';

export interface PieceEntry {
  id: number;
  key: string;              /* 카탈로그 피스 키 (이름·색) */
  shape: Shape;             /* 고른 방향 (정규화) */
  count: number | 'inf';
}

export function findEntry(entries: PieceEntry[], key: string, shape: Shape): PieceEntry | undefined {
  const k = shapeKey(normalize(shape));
  return entries.find(e => e.key === key && shapeKey(e.shape) === k);
}
export function placedOf(placements: Placement[], entryId: number): number {
  return placements.filter(p => p.entry === entryId).length;
}
/** 남은 개수 (무제한이면 Infinity) */
export function entryRemaining(e: PieceEntry, placements: Placement[]): number {
  if (e.count === 'inf') return Infinity;
  return Math.max(0, e.count - placedOf(placements, e.id));
}

/** 답 탐색용 묶음: 허용된 대칭으로 서로 같은 피스가 되는 항목끼리 합친다.
    (회전을 허용하면 방향만 다른 두 항목은 같은 피스라, 따로 넘기면 같은 답이 항목만 바뀌어 두 번 나온다) */
export interface SolveGroup { gkey: string; key: string; shape: Shape; count: number | 'inf'; entryIds: number[]; }
export function groupEntries(entries: PieceEntry[], placements: Placement[], opts: SymmetryOpts): SolveGroup[] {
  const groups = new Map<string, SolveGroup>();
  for (const e of entries) {
    const left = entryRemaining(e, placements);
    const gkey = 'g:' + canonicalKey(e.shape, opts);
    let g = groups.get(gkey);
    if (!g) { g = { gkey, key: e.key, shape: e.shape, count: 0, entryIds: [] }; groups.set(gkey, g); }
    g.entryIds.push(e.id);
    if (left === Infinity || g.count === 'inf') g.count = 'inf';
    else g.count = (g.count as number) + left;
  }
  return [...groups.values()];
}
export function solverPieces(groups: SolveGroup[]): SolverPiece[] {
  return groups.map(g => ({ key: g.gkey, shape: g.shape, count: g.count }));
}
/** 답의 배치를 항목에 배정: 묶음 안에서 남은 개수가 있는 항목부터, 놓인 방향과 같은 방향의 항목을 우선 */
export function assignSolution(sol: SolverPlacement[], groups: SolveGroup[], entries: PieceEntry[], placements: Placement[]): { entry: number; key: string }[] {
  const left = new Map(entries.map(e => [e.id, entryRemaining(e, placements)]));
  return sol.map(p => {
    const g = groups.find(x => x.gkey === p.key);
    if (!g) return { entry: -1, key: p.key };
    const k = shapeKey(normalize(p.cells));
    const ids = g.entryIds.slice().sort((a, b) => {
      const sa = shapeKey(entries.find(e => e.id === a)!.shape) === k ? 0 : 1, sb = shapeKey(entries.find(e => e.id === b)!.shape) === k ? 0 : 1;
      return sa - sb;
    });
    const id = ids.find(i => (left.get(i) || 0) > 0) ?? ids[0];
    left.set(id, (left.get(id) || 0) - 1);
    const e = entries.find(x => x.id === id)!;
    return { entry: id, key: e.key };
  });
}

/** 예전 저장(카탈로그 키 → 개수, 뒤집기 금지 때 ':a' ':b' 분리)을 항목으로 옮긴다 */
export function migrateCounts(counts: Record<string, number | 'inf'>, shapeOf: (key: string) => Shape | null, placements: Placement[]): { entries: PieceEntry[]; placements: Placement[] } {
  const entries: PieceEntry[] = [];
  let id = 1;
  for (const k of Object.keys(counts)) {
    const v = counts[k];
    if (!(v === 'inf' || (typeof v === 'number' && v > 0))) continue;
    const base = k.replace(/:[ab]$/, '');
    const s = shapeOf(base); if (!s) continue;
    const shape = normalize(k.endsWith(':b') ? flipH(s) : s);
    const same = findEntry(entries, base, shape);
    if (same) { same.count = same.count === 'inf' || v === 'inf' ? 'inf' : same.count + v; continue; }
    entries.push({ id: id++, key: base, shape, count: v });
  }
  const out = placements.map(p => {
    const base = p.key.replace(/:[ab]$/, '');
    /* 같은 카탈로그 피스 중 거울상이 같은(회전만으로 겹치는) 항목 우선 */
    const mine = entries.filter(e => e.key === base);
    const ck = canonicalKey(p.cells, ONE_SIDED);
    const hit = mine.find(e => canonicalKey(e.shape, ONE_SIDED) === ck) || mine[0];
    return { ...p, key: base, entry: hit ? hit.id : undefined };
  });
  return { entries, placements: out };
}
/** 피스가 고른 방향에서 허용된 변형 (0번 = 고른 방향) */
export function entryOrientations(e: PieceEntry, opts: SymmetryOpts): Shape[] { return orientations(e.shape, opts); }
