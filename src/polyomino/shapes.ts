/* 폴리오미노 — 피스 카탈로그 (1~6칸 자유 폴리오미노 + 사용자 피스). 순수 모듈.
   표준 이름: 펜토미노 I U P F X N Y L Z T W V, 테트로미노 I O T S L, 트로미노 I L. 헥소미노는 번호. */
import { normalize, shapeKey, canonicalKey, orientations, flipH, isChiral, FREE, ONE_SIDED, shapeFromRows } from './model';
import type { Shape, SymmetryOpts } from './model';

export interface CatalogPiece {
  key: string;      /* 자유 정규 키(또는 거울상 분리 시 ':a' / ':b' 접미) · 사용자 피스는 'u:<n>' */
  name: string;     /* 표시 이름 */
  size: number;     /* 칸 수 */
  shape: Shape;     /* 표시·초기 방향 */
  custom?: boolean;
  colorIdx: number;
}

const NAMED: Record<number, [string, string][]> = {
  1: [['1', '#']],
  2: [['2', '##']],
  3: [['I', '###'], ['L', '##/#.']],
  4: [['I', '####'], ['O', '##/##'], ['T', '###/.#.'], ['S', '##./.##'], ['L', '###/#..']],
  5: [['I', '#####'], ['U', '#.#/###'], ['P', '##/##/#.'], ['F', '.##/##./.#.'], ['X', '.#./###/.#.'], ['N', '.###/##..'],
      ['Y', '####/.#..'], ['L', '####/#...'], ['Z', '##./.#./.##'], ['T', '###/.#./.#.'], ['W', '#../##./.##'], ['V', '#../#../###']],
};
export const PIECE_SIZES = [1, 2, 3, 4, 5, 6];

/** n칸 자유 폴리오미노 전부 (n-1 칸에 한 칸씩 붙여 생성, 자유 정규 키로 중복 제거) */
export function freePolyominoes(n: number): Shape[] {
  if (n <= 1) return [[[0, 0]]];
  const prev = freePolyominoes(n - 1);
  const seen = new Map<string, Shape>();
  for (const s of prev) {
    const set = new Set(s.map(c => c[0] + ',' + c[1]));
    for (const [x, y] of s) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (set.has(nx + ',' + ny)) continue;
      const t = normalize([...s, [nx, ny]]);
      const k = canonicalKey(t, FREE);
      if (!seen.has(k)) seen.set(k, t);
    }
  }
  return [...seen.values()];
}

const PALETTE_SIZE = 12;
/** 기본 카탈로그 (자유 폴리오미노 기준, 이름 있는 것은 이름순·나머지는 키순) */
export const BASE_CATALOG: CatalogPiece[] = (() => {
  const out: CatalogPiece[] = [];
  let color = 0;
  for (const n of PIECE_SIZES) {
    const all = freePolyominoes(n);
    const byKey = new Map(all.map(s => [canonicalKey(s, FREE), s] as [string, Shape]));
    const used = new Set<string>();
    (NAMED[n] || []).forEach(([name, rows]) => {
      const shape = shapeFromRows(rows);
      const key = canonicalKey(shape, FREE);
      if (!byKey.has(key)) throw new Error('catalog shape mismatch: ' + n + name);
      used.add(key);
      out.push({ key, name, size: n, shape, colorIdx: color++ % PALETTE_SIZE });
    });
    let idx = 1;
    [...byKey.keys()].sort().forEach(key => {
      if (used.has(key)) return;
      out.push({ key, name: n + '-' + (idx++), size: n, shape: byKey.get(key)!, colorIdx: color++ % PALETTE_SIZE });
    });
  }
  return out;
})();

export interface CustomShape { id: number; rows: string; }

/**
 * 현재 옵션에 맞는 카탈로그: 뒤집기를 허용하지 않으면 거울상이 있는 피스를 두 장(':a' 원형 / ':b' 거울상)으로 나눈다.
 * 사용자 피스는 그대로 한 장(허용 여부와 무관, 그린 방향 그대로).
 */
export function buildCatalog(opts: SymmetryOpts, customs: CustomShape[]): CatalogPiece[] {
  const out: CatalogPiece[] = [];
  for (const p of BASE_CATALOG) {
    if (!opts.allowFlip && isChiral(p.shape)) {
      out.push({ ...p, key: p.key + ':a', name: p.name });
      out.push({ ...p, key: p.key + ':b', name: p.name + '′', shape: flipH(p.shape) });
    } else out.push(p);
  }
  customs.forEach((c, i) => {
    const shape = shapeFromRows(c.rows);
    if (!shape.length) return;
    out.push({ key: 'u:' + c.id, name: '자작' + (i + 1), size: shape.length, shape, custom: true, colorIdx: (BASE_CATALOG.length + i) % PALETTE_SIZE });
  });
  return out;
}

/** 카탈로그 키 → 피스 (없으면 null) */
export function findPiece(catalog: CatalogPiece[], key: string): CatalogPiece | null {
  return catalog.find(p => p.key === key) || null;
}

/** 놓인 변형(cells)이 현재 옵션에서 어느 카탈로그 피스에 해당하는지 (뒤집기 토글 시 ':a'/':b' 재배정용) */
export function keyForShape(catalog: CatalogPiece[], cells: Shape, opts: SymmetryOpts, prevKey: string): string {
  if (prevKey.startsWith('u:')) return prevKey;
  const k = canonicalKey(cells, opts);
  const hit = catalog.find(p => !p.custom && canonicalKey(p.shape, opts) === k);
  return hit ? hit.key : prevKey;
}

/** 피스의 허용 변형 (표시 방향 기준) */
export function pieceOrientations(p: CatalogPiece, opts: SymmetryOpts): Shape[] { return orientations(p.shape, opts); }
export { ONE_SIDED, FREE, shapeKey };
