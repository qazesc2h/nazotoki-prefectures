import { describe, it, expect } from 'vitest';
import { normalize, shapeKey, shapeFromRows, orientations, canonicalKey, isChiral, isConnected, rotateCW, flipH, computeCoverage, isComplete, readLetters, resizeBoard, openCellCount, FREE, ONE_SIDED } from '../src/polyomino/model';
import type { Board, Placement } from '../src/polyomino/model';
import { freePolyominoes, BASE_CATALOG, buildCatalog, keyForShape } from '../src/polyomino/shapes';
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
  it('뒤집기 금지면 거울상 피스가 두 장으로', () => {
    const free = buildCatalog(FREE, []);
    const oneSided = buildCatalog(ONE_SIDED, []);
    expect(free.filter(p => p.size === 4)).toHaveLength(5);
    expect(oneSided.filter(p => p.size === 4)).toHaveLength(7);   /* S/Z, L/J 분리 */
    expect(oneSided.filter(p => p.size === 5)).toHaveLength(18);
    const S = free.find(p => p.size === 4 && p.name === 'S')!;
    expect(keyForShape(oneSided, S.shape, ONE_SIDED, S.key)).toBe(S.key + ':a');
    expect(keyForShape(oneSided, flipH(S.shape), ONE_SIDED, S.key)).toBe(S.key + ':b');
  });
  it('자작 피스', () => {
    const cat = buildCatalog(FREE, [{ id: 7, rows: '#./##/.#' }]);
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
