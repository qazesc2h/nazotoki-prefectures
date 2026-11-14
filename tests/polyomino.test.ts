import { describe, it, expect } from 'vitest';
import { normalize, shapeKey, shapeFromRows, orientations, canonicalKey, isChiral, isConnected, isCubeNet, rotateCW, flipH, computeCoverage, isComplete, readLetters, resizeBoard, openCellCount, FREE, ONE_SIDED } from '../src/polyomino/model';
import type { Board, Placement } from '../src/polyomino/model';
import { freePolyominoes, BASE_CATALOG, buildCatalog } from '../src/polyomino/shapes';
import { groupEntries, solverPieces, assignSolution, migrateCounts, findEntry } from '../src/polyomino/entries';
import type { PieceEntry } from '../src/polyomino/entries';
import { solve } from '../src/polyomino/solver';

const board = (w: number, h: number, holes: string[] = [], letters: Record<string, string> = {}): Board => ({ w, h, holes: new Set(holes), letters });
const P = (id: number, key: string, rows: string, x: number, y: number, memo?: string): Placement => ({ id, key, cells: shapeFromRows(rows), x, y, memo });

describe('모양·변형', () => {
  it('정규화·키·연결 판정', () => {
    expect(shapeKey(normalize([[2, 3], [3, 3], [2, 4]]))).toBe('0,0;1,0;0,1');
    expect(shapeFromRows('##/#.')).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(isConnected(shapeFromRows('#.#'))).toBe(false);
    expect(isConnected(shapeFromRows('###/#..'))).toBe(true);
  });
  it('변형 수: L 테트로미노 자유 8 · 회전만 4 · 고정 1, O 는 1', () => {
    const L = shapeFromRows('###/#..');
    expect(orientations(L, FREE)).toHaveLength(8);
    expect(orientations(L, ONE_SIDED)).toHaveLength(4);
    expect(orientations(L, { allowRotate: false, allowFlip: false })).toHaveLength(1);
    expect(orientations(shapeFromRows('##/##'), FREE)).toHaveLength(1);
    expect(orientations(L, FREE)[0]).toEqual(L);   /* 원형이 0번 */
  });
  it('정규 키는 변형에 불변, 거울상 판정', () => {
    const S = shapeFromRows('##./.##');
    expect(canonicalKey(rotateCW(S), FREE)).toBe(canonicalKey(S, FREE));
    expect(canonicalKey(flipH(S), FREE)).toBe(canonicalKey(S, FREE));
    expect(canonicalKey(flipH(S), ONE_SIDED)).not.toBe(canonicalKey(S, ONE_SIDED));
    expect(isChiral(S)).toBe(true);
    expect(isChiral(shapeFromRows('###/.#.'))).toBe(false);
  });
});

describe('카탈로그', () => {
  it('자유 폴리오미노 개수 1,1,2,5,12,35', () => {
    expect([1, 2, 3, 4, 5, 6].map(n => freePolyominoes(n).length)).toEqual([1, 1, 2, 5, 12, 35]);
  });
  it('표준 이름이 붙고 키가 겹치지 않음', () => {
    const names5 = BASE_CATALOG.filter(p => p.size === 5).map(p => p.name).join('');
    expect(names5).toBe('IUPFXNYLZTWV');
    expect(new Set(BASE_CATALOG.map(p => p.key)).size).toBe(BASE_CATALOG.length);
    expect(BASE_CATALOG.filter(p => p.size === 6)).toHaveLength(35);
  });
  it('카탈로그는 모양 종류만 (방향은 고를 때 정함): 4칸 5종 · 5칸 12종', () => {
    const cat = buildCatalog([]);
    expect(cat.filter(p => p.size === 4)).toHaveLength(5);
    expect(cat.filter(p => p.size === 5)).toHaveLength(12);
  });
  it('정육면체 전개도: 35종 중 11종, 십자형은 전개도·2×3·일자는 아님', () => {
    expect(BASE_CATALOG.filter(p => p.size === 6 && p.cubeNet)).toHaveLength(11);
    expect(isCubeNet(shapeFromRows('.#./###/.#./.#.'))).toBe(true);
    expect(isCubeNet(shapeFromRows('#.../####/...#'))).toBe(true);    /* 계단형 */
    expect(isCubeNet(shapeFromRows('###/###'))).toBe(false);
    expect(isCubeNet(shapeFromRows('######'))).toBe(false);
    expect(isCubeNet(shapeFromRows('#####'))).toBe(false);
    /* 변형에 불변 */
    const cross = shapeFromRows('.#./###/.#./.#.');
    expect(isCubeNet(rotateCW(cross))).toBe(true); expect(isCubeNet(flipH(cross))).toBe(true);
  });
  it('자작 피스', () => {
    const cat = buildCatalog([{ id: 7, rows: '#./##/.#' }]);
    const u = cat.find(p => p.key === 'u:7')!;
    expect(u.custom).toBe(true); expect(u.size).toBe(4);
  });
});

describe('도면·배치', () => {
  it('구멍·크기 변경', () => {
    const b = board(4, 3, ['0,0', '3,2', '9,9']);
    expect(openCellCount(b)).toBe(10);
    const r = resizeBoard(b, 2, 2);
    expect(r.holes.has('0,0')).toBe(true); expect(r.holes.has('3,2')).toBe(false);
    expect(resizeBoard(b, 99, 0)).toMatchObject({ w: 20, h: 1 });
  });
  it('겹침·구멍·도면 밖 충돌과 완성', () => {
    const b = board(3, 2, ['2,1']);
    const ok = [P(1, 'a', '###', 0, 0), P(2, 'b', '##', 0, 1)];
    const cov = computeCoverage(b, ok);
    expect(cov.conflictIds.size).toBe(0); expect(cov.uncovered).toBe(0); expect(isComplete(cov)).toBe(true);
    const bad = computeCoverage(b, [P(1, 'a', '###', 0, 0), P(2, 'b', '##', 1, 0), P(3, 'c', '#', 2, 1), P(4, 'd', '#', 5, 5)]);
    expect([...bad.conflictIds].sort()).toEqual([1, 2, 3, 4]);
    expect(bad.overlapCells.has('1,0')).toBe(true);
    expect(isComplete(bad)).toBe(false);
  });
  it('글자 읽기: 피스별 덮은 글자(위→아래, 왼→오) · 안 덮인 글자', () => {
    const b = board(3, 2, [], { '0,0': 'あ', '1,0': 'い', '2,0': 'う', '0,1': 'え', '2,1': 'お' });
    const r = readLetters(b, [P(1, 'a', '##/#.', 0, 0, 'メ'), P(2, 'b', '#', 2, 0)]);
    expect(r.byPiece).toEqual([{ id: 1, key: 'a', memo: 'メ', text: 'あいえ' }, { id: 2, key: 'b', memo: undefined, text: 'う' }]);
    expect(r.uncovered).toBe('お');
  });
});

describe('답 탐색', () => {
  const I = shapeFromRows('####'), O = shapeFromRows('##/##'), L = shapeFromRows('###/#..'), T = shapeFromRows('###/.#.');
  it('2×2 를 도미노 2개로: 답 2가지', () => {
    const r = solve(board(2, 2), [{ key: 'd', shape: shapeFromRows('##'), count: 2 }], FREE);
    expect(r.solutions).toHaveLength(2); expect(r.truncated).toBe(false);
  });
  it('4×2 를 테트로미노로: I 2개 → 1가지, O 2개 → 1가지, L 2개 → 2가지(자유)·뒤집기 금지면 1가지', () => {
    expect(solve(board(4, 2), [{ key: 'I', shape: I, count: 2 }], FREE).solutions).toHaveLength(1);
    expect(solve(board(4, 2), [{ key: 'O', shape: O, count: 2 }], FREE).solutions).toHaveLength(1);
    expect(solve(board(4, 2), [{ key: 'L', shape: L, count: 2 }], FREE).solutions).toHaveLength(2);
    expect(solve(board(4, 2), [{ key: 'L', shape: L, count: 2 }], ONE_SIDED).solutions).toHaveLength(1);
  });
  it('면적 불일치·덮을 수 없는 칸·피스 남음은 바로 판정', () => {
    expect(solve(board(3, 3), [{ key: 'O', shape: O, count: 2 }], FREE).reason).toMatch(/적습니다/);
    expect(solve(board(2, 2), [{ key: 'I', shape: I, count: 1 }], FREE).reason).toMatch(/많습니다|덮을 수 없는/);
    expect(solve(board(3, 1, ['1,0']), [{ key: 'd', shape: shapeFromRows('##'), count: 1 }], FREE).reason).toMatch(/덮을 수 없는/);
  });
  it('무제한 피스·고정 칸', () => {
    const r = solve(board(4, 2), [{ key: 'd', shape: shapeFromRows('##'), count: 'inf' }], FREE);
    expect(r.solutions).toHaveLength(5);   /* 2×4 도미노 타일링 = 피보나치 5 */
    const fixed = solve(board(4, 2), [{ key: 'O', shape: O, count: 1 }], { ...FREE, fixedCells: ['0,0', '1,0', '0,1', '1,1'] });
    expect(fixed.solutions).toHaveLength(1);
    expect(fixed.solutions[0][0]).toMatchObject({ x: 2, y: 0 });
  });
  it('펜토미노 T + L + I 로 5×3 채우기 · 상한', () => {
    const r = solve(board(5, 3), [{ key: 'T', shape: T, count: 1 }, { key: 'L', shape: L, count: 1 }, { key: 'I', shape: I, count: 1 }, { key: 'm', shape: shapeFromRows('#'), count: 3 }], FREE);
    expect(r.solutions.length).toBeGreaterThan(0);
    const capped = solve(board(6, 2), [{ key: 'd', shape: shapeFromRows('##'), count: 'inf' }], { ...FREE, maxSolutions: 3 });
    expect(capped.solutions).toHaveLength(3); expect(capped.truncated).toBe(true);
  });
});

describe('떨어진 칸이 있는 자작 피스', () => {
  it('떨어진 피스도 한 덩어리로 놓이고 답 탐색에 쓰인다', () => {
    /* 3×1 도면: 「#.#」 피스 1개 + 1칸 피스 1개 → 답 1개 (가운데를 1칸이 채움) */
    const board: Board = { w: 3, h: 1, holes: new Set(), letters: {} };
    const r = solve(board, [{ key: 'u:1', shape: shapeFromRows('#.#'), count: 1 }, { key: 'm', shape: shapeFromRows('#'), count: 1 }], FREE);
    expect(r.reason).toBeUndefined();
    expect(r.solutions).toHaveLength(1);
    const gap = r.solutions[0].find(p => p.key === 'u:1')!;
    expect(gap.cells.map(([x, y]) => (gap.x + x) + ',' + (gap.y + y)).sort()).toEqual(['0,0', '2,0']);
  });
  it('돌리면 떨어진 칸도 함께 돈다', () => {
    const o = orientations(shapeFromRows('#.#'), FREE).map(shapeKey).sort();
    expect(o).toHaveLength(2);   /* 가로 #.# 와 세로 */
  });
});

describe('방향을 골라 담은 피스 (항목)', () => {
  const FIXED = { allowRotate: false, allowFlip: false };
  const L = shapeFromRows('###/#..'), L180 = rotateCW(rotateCW(L)), J = flipH(L);
  const entries: PieceEntry[] = [
    { id: 1, key: 'L', shape: L, count: 1 },
    { id: 2, key: 'L', shape: L180, count: 1 },
  ];
  const board = (w: number, h: number): Board => ({ w, h, holes: new Set(), letters: {} });
  it('같은 모양·다른 방향은 항목이 둘, 찾기는 방향까지 맞아야', () => {
    expect(findEntry(entries, 'L', L)!.id).toBe(1);
    expect(findEntry(entries, 'L', L180)!.id).toBe(2);
    expect(findEntry(entries, 'L', J)).toBeUndefined();
  });
  it('답 탐색 묶음: 회전 허용이면 한 피스로 합치고(중복 답 방지), 회전·뒤집기 금지면 방향별로 따로', () => {
    const free = groupEntries(entries, [], FREE);
    expect(free).toHaveLength(1); expect(free[0].count).toBe(2);
    const fixed = groupEntries(entries, [], FIXED);
    expect(fixed).toHaveLength(2);
    /* 뒤집기만 금지: L 과 L180 은 회전으로 겹치므로 한 묶음, J 는 따로 */
    expect(groupEntries([...entries, { id: 3, key: 'L', shape: J, count: 1 }], [], ONE_SIDED)).toHaveLength(2);
  });
  it('회전·뒤집기를 꺼도 고른 방향으로 답을 찾는다: 4×2 = L + 180° 돌린 L', () => {
    const fixed = groupEntries(entries, [], FIXED);
    const r = solve(board(4, 2), solverPieces(fixed), FIXED);
    expect(r.solutions).toHaveLength(1);
    /* 같은 방향 L 두 개로는 4×2 를 못 채움 */
    expect(solve(board(4, 2), solverPieces(groupEntries([{ id: 1, key: 'L', shape: L, count: 2 }], [], FIXED)), FIXED).solutions).toHaveLength(0);
    /* 답을 도면에 적용할 때 각 배치는 방향이 같은 항목으로 */
    const who = assignSolution(r.solutions[0], fixed, entries, []);
    expect(who.map(w => w.entry).sort()).toEqual([1, 2]);
  });
  it('회전 허용 묶음에서도 배치는 방향이 같은 항목에 우선 배정', () => {
    const free = groupEntries(entries, [], FREE);
    const r = solve(board(4, 2), solverPieces(free), FREE);
    for (const sol of r.solutions) {
      const who = assignSolution(sol, free, entries, []);
      expect(new Set(who.map(w => w.entry)).size).toBe(2);   /* 두 항목에 하나씩 */
    }
  });
  it('예전 저장(키별 개수, 뒤집기 금지 때 :a/:b)을 항목으로 옮김', () => {
    const shapeOf = (k: string) => (k === 'L' ? L : k === 'O' ? shapeFromRows('##/##') : null);
    const placements = [{ id: 1, key: 'L:b', cells: J, x: 0, y: 0 }, { id: 2, key: 'O', cells: shapeFromRows('##/##'), x: 2, y: 0 }];
    const m = migrateCounts({ 'L:a': 1, 'L:b': 2, O: 'inf', X: 3 }, shapeOf, placements);
    expect(m.entries).toHaveLength(3);
    expect(m.entries.find(e => e.key === 'L' && e.count === 2)!.shape).toEqual(normalize(J));
    expect(m.placements[0].key).toBe('L');
    expect(m.placements[0].entry).toBe(m.entries.find(e => e.key === 'L' && e.count === 2)!.id);
    expect(m.placements[1].entry).toBe(m.entries.find(e => e.key === 'O')!.id);
  });
});
