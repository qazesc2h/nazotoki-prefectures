/* 폴리오미노 — 데이터 모델 (순수 함수, DOM 비의존)
   피스(칸 집합)의 정규화·8가지 변형, 도면(구멍·글자), 배치 검증·완성 판정·글자 읽기 */

export type Cell = [number, number];              /* [x, y] */
export type Shape = Cell[];                        /* 정규화된 칸 집합 (최소 x,y = 0, 정렬) */

/** 칸 집합을 정규화: 최소 x·y 를 0 으로 평행이동하고 (y, x) 순으로 정렬 */
export function normalize(cells: Cell[]): Shape {
  if (!cells.length) return [];
  let mx = Infinity, my = Infinity;
  for (const [x, y] of cells) { if (x < mx) mx = x; if (y < my) my = y; }
  const out: Shape = cells.map(([x, y]) => [x - mx, y - my] as Cell);
  out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  /* 중복 칸 제거 */
  return out.filter((c, i) => i === 0 || c[0] !== out[i - 1][0] || c[1] !== out[i - 1][1]);
}
export function shapeKey(s: Shape): string { return s.map(c => c[0] + ',' + c[1]).join(';'); }
export function parseShapeKey(k: string): Shape {
  if (!k) return [];
  return normalize(k.split(';').map(p => { const [x, y] = p.split(',').map(Number); return [x, y] as Cell; }));
}
/** "###/#.." 같은 그림 문자열 → Shape */
export function shapeFromRows(rows: string | string[]): Shape {
  const rs = typeof rows === 'string' ? rows.split('/') : rows;
  const cells: Cell[] = [];
  rs.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, y]); });
  return normalize(cells);
}
export function shapeSize(s: Shape): { w: number; h: number } {
  let w = 0, h = 0;
  for (const [x, y] of s) { if (x + 1 > w) w = x + 1; if (y + 1 > h) h = y + 1; }
  return { w, h };
}
/** 모든 칸이 변으로 이어져 있는가 (피스로 유효한가) */
export function isConnected(s: Shape): boolean {
  if (!s.length) return false;
  const set = new Set(s.map(c => c[0] + ',' + c[1]));
  const seen = new Set<string>();
  const stack: Cell[] = [s[0]];
  seen.add(s[0][0] + ',' + s[0][1]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Cell[]) {
      const k = (x + dx) + ',' + (y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === s.length;
}

/**
 * 정육면체 전개도인가 (6칸 피스 전용). 한 칸을 바닥면으로 두고 인접 칸으로 정육면체를 굴려 가며
 * 각 칸에 닿는 면을 기록한다 — 모든 칸의 면이 서로 다르면 접어서 정육면체가 된다.
 * 면 번호 0~5, 마주보는 면은 5-n. 상태 = (바닥, 북쪽, 동쪽) 면.
 */
export function isCubeNet(s: Shape): boolean {
  if (s.length !== 6) return false;
  const idx = new Map(s.map((c, i) => [c[0] + ',' + c[1], i] as [string, number]));
  const face: (number | null)[] = s.map(() => null);
  type St = { down: number; north: number; east: number };
  const roll = (st: St, dx: number, dy: number): St => {
    const up = 5 - st.down;
    if (dx === 1) return { down: st.east, north: st.north, east: up };
    if (dx === -1) return { down: 5 - st.east, north: st.north, east: st.down };
    if (dy === -1) return { down: st.north, north: up, east: st.east };
    return { down: 5 - st.north, north: st.down, east: st.east };   /* dy === 1 (남쪽) */
  };
  const stack: [number, St][] = [[0, { down: 0, north: 1, east: 2 }]];
  face[0] = 0;
  while (stack.length) {
    const [i, st] = stack.pop()!;
    const [x, y] = s[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]] as Cell[]) {
      const j = idx.get((x + dx) + ',' + (y + dy));
      if (j === undefined) continue;
      const ns = roll(st, dx, dy);
      if (face[j] === null) { face[j] = ns.down; stack.push([j, ns]); }
      else if (face[j] !== ns.down) return false;
    }
  }
  return new Set(face).size === 6;
}

/* ---- 변형 ---- */
export function rotateCW(s: Shape): Shape { return normalize(s.map(([x, y]) => [-y, x] as Cell)); }
export function flipH(s: Shape): Shape { return normalize(s.map(([x, y]) => [-x, y] as Cell)); }

export interface SymmetryOpts { allowRotate: boolean; allowFlip: boolean; }

/** 허용된 대칭 아래의 서로 다른 변형 목록 (항상 원형이 0번) */
export function orientations(s: Shape, opts: SymmetryOpts): Shape[] {
  const out: Shape[] = [];
  const seen = new Set<string>();
  const push = (t: Shape) => { const k = shapeKey(t); if (!seen.has(k)) { seen.add(k); out.push(t); } };
  const base = [normalize(s)];
  if (opts.allowFlip) base.push(flipH(s));
  for (const b of base) {
    let cur = b;
    const n = opts.allowRotate ? 4 : 1;
    for (let i = 0; i < n; i++) { push(cur); cur = rotateCW(cur); }
  }
  return out;
}
/** 정규 키: 허용된 대칭의 변형 중 사전순 최소 키 — 같은 피스인지 판정 */
export function canonicalKey(s: Shape, opts: SymmetryOpts): string {
  let best: string | null = null;
  for (const t of orientations(s, opts)) { const k = shapeKey(t); if (best === null || k < best) best = k; }
  return best || '';
}
export const FREE: SymmetryOpts = { allowRotate: true, allowFlip: true };
export const ONE_SIDED: SymmetryOpts = { allowRotate: true, allowFlip: false };
/** 뒤집었을 때 다른 모양이 되는(거울상이 있는) 피스인가 */
export function isChiral(s: Shape): boolean { return canonicalKey(s, ONE_SIDED) !== canonicalKey(flipH(s), ONE_SIDED); }

/* ---- 도면 ---- */
export interface Board {
  w: number; h: number;
  holes: Set<string>;                 /* "x,y" — 사용하지 않는 칸 */
  letters: Record<string, string>;    /* "x,y" → 글자 */
}
export const BOARD_MIN = 1, BOARD_MAX = 20;
export function cellKey(x: number, y: number): string { return x + ',' + y; }
export function inBoard(b: Board, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < b.w && y < b.h; }
export function isHole(b: Board, x: number, y: number): boolean { return b.holes.has(cellKey(x, y)); }
/** 채워야 하는 칸 수 (구멍 제외) */
export function openCellCount(b: Board): number { return b.w * b.h - [...b.holes].filter(k => { const [x, y] = k.split(',').map(Number); return inBoard(b, x, y); }).length; }
/** 크기 변경: 범위 밖 구멍·글자는 버린다 */
export function resizeBoard(b: Board, w: number, h: number): Board {
  w = Math.max(BOARD_MIN, Math.min(BOARD_MAX, Math.floor(w) || BOARD_MIN));
  h = Math.max(BOARD_MIN, Math.min(BOARD_MAX, Math.floor(h) || BOARD_MIN));
  const nb: Board = { w, h, holes: new Set(), letters: {} };
  b.holes.forEach(k => { const [x, y] = k.split(',').map(Number); if (inBoard(nb, x, y)) nb.holes.add(k); });
  Object.keys(b.letters).forEach(k => { const [x, y] = k.split(',').map(Number); if (inBoard(nb, x, y) && b.letters[k]) nb.letters[k] = b.letters[k]; });
  return nb;
}

/* ---- 배치 ---- */
export interface Placement {
  id: number;
  key: string;        /* 카탈로그 피스 키 (색·개수 집계용) */
  cells: Shape;       /* 놓인 변형 (정규화) */
  x: number; y: number;  /* 도면 상 원점 */
  memo?: string;
}
export function absCells(p: Placement): Cell[] { return p.cells.map(([dx, dy]) => [p.x + dx, p.y + dy] as Cell); }

export interface Coverage {
  count: Map<string, number>;     /* "x,y" → 덮은 피스 수 */
  owner: Map<string, number>;     /* "x,y" → 피스 id (하나만 덮을 때) */
  conflictIds: Set<number>;       /* 겹침·구멍·도면 밖에 걸린 피스 */
  overlapCells: Set<string>;      /* 둘 이상이 덮은 칸 */
  uncovered: number;              /* 아직 비어 있는 채울 칸 수 */
}
export function computeCoverage(b: Board, placements: Placement[]): Coverage {
  const count = new Map<string, number>(), owner = new Map<string, number>();
  const conflictIds = new Set<number>(), overlapCells = new Set<string>();
  for (const p of placements) {
    for (const [x, y] of absCells(p)) {
      const k = cellKey(x, y);
      if (!inBoard(b, x, y) || isHole(b, x, y)) { conflictIds.add(p.id); continue; }
      const c = (count.get(k) || 0) + 1;
      count.set(k, c);
      if (c === 1) owner.set(k, p.id);
      else { overlapCells.add(k); conflictIds.add(p.id); conflictIds.add(owner.get(k)!); owner.delete(k); }
    }
  }
  let uncovered = 0;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!isHole(b, x, y) && !count.get(cellKey(x, y))) uncovered++;
  return { count, owner, conflictIds, overlapCells, uncovered };
}
export function isComplete(cov: Coverage): boolean { return cov.uncovered === 0 && cov.conflictIds.size === 0; }

/** 글자 읽기: 피스별로 덮은 글자(읽기 순서: 위→아래, 왼→오), 덮이지 않은 글자 */
export interface LetterReading { byPiece: { id: number; key: string; memo?: string; text: string }[]; uncovered: string; }
export function readLetters(b: Board, placements: Placement[]): LetterReading {
  const cov = computeCoverage(b, placements);
  const byPiece = placements.map(p => {
    const cells = absCells(p).filter(([x, y]) => inBoard(b, x, y)).sort((a, c) => a[1] - c[1] || a[0] - c[0]);
    return { id: p.id, key: p.key, memo: p.memo, text: cells.map(([x, y]) => b.letters[cellKey(x, y)] || '').join('') };
  });
  let uncovered = '';
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const k = cellKey(x, y);
    if (b.letters[k] && !isHole(b, x, y) && !cov.count.get(k)) uncovered += b.letters[k];
  }
  return { byPiece, uncovered };
}
