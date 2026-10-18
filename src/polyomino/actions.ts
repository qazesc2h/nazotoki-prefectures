/* 폴리오미노 — 상태 변경 동작 (저장·되돌리기·재렌더 포함). UI 모듈은 이 함수들만 호출한다. */
import { polyState, polySaveState, pushUndo, boardOf } from './state';
import { buildCatalog, findPiece, keyForShape, pieceOrientations } from './shapes';
import type { CatalogPiece } from './shapes';
import { computeCoverage, resizeBoard, cellKey, inBoard, isHole, rotateCW, flipH, normalize, shapeKey, orientations } from './model';
import type { Placement, Shape, SymmetryOpts } from './model';

/* ---- 재렌더 간접 호출 (ui.ts 가 등록) ---- */
let renderer: () => void = () => {};
export function setPolyRenderer(fn: () => void): void { renderer = fn; }
export function polyRender(): void { renderer(); }

/* ---- UI 휘발 상태 ---- */
export const polyUi = { selectedId: null as number | null, solveSeq: 0 };

export function symOpts(): SymmetryOpts { return { allowRotate: polyState.allowRotate, allowFlip: polyState.allowFlip }; }
export function catalog(): CatalogPiece[] { return buildCatalog(symOpts(), polyState.customs); }
export function pieceByKey(key: string): CatalogPiece | null { return findPiece(catalog(), key); }

/** 남은 개수 (무제한이면 Infinity) */
export function remaining(key: string): number {
  const c = polyState.counts[key];
  if (c === 'inf') return Infinity;
  const placed = polyState.placements.filter(p => p.key === key).length;
  return Math.max(0, (c || 0) - placed);
}
/** 선택한 피스 총 칸 수 (무제한 피스는 제외) 와 무제한 피스 존재 여부 */
export function selectedArea(): { area: number; hasInf: boolean } {
  let area = 0, hasInf = false;
  for (const p of catalog()) {
    const c = polyState.counts[p.key];
    if (c === 'inf') hasInf = true; else if (c) area += c * p.size;
  }
  return { area, hasInf };
}
/** 트레이 카드에 보이는 변형 */
export function trayShape(p: CatalogPiece): Shape {
  const os = pieceOrientations(p, symOpts());
  const i = ((polyState.trayOrient[p.key] || 0) % os.length + os.length) % os.length;
  return os[i];
}
export function trayRotate(key: string, dir: 1 | -1 = 1): void {
  const p = pieceByKey(key); if (!p) return;
  const os = pieceOrientations(p, symOpts());
  const cur = trayShape(p);
  const target = shapeKey(dir === 1 ? rotateCW(cur) : flipH(cur));
  const idx = os.findIndex(o => shapeKey(o) === target);
  if (idx >= 0) polyState.trayOrient[key] = idx;
  polySaveState(); polyRender();
}
export function trayFlip(key: string): void { trayRotate(key, -1); }

/** 겹침 금지 옵션일 때 놓을 수 없는 자리인가 (ignoreId 피스 자신은 제외) */
export function wouldConflict(cells: Shape, x: number, y: number, ignoreId: number | null): boolean {
  const b = boardOf();
  const cov = computeCoverage(b, polyState.placements.filter(p => p.id !== ignoreId));
  for (const [dx, dy] of cells) {
    const cx = x + dx, cy = y + dy;
    if (!inBoard(b, cx, cy) || isHole(b, cx, cy) || cov.count.get(cellKey(cx, cy))) return true;
  }
  return false;
}
export function canPlaceHere(cells: Shape, x: number, y: number, ignoreId: number | null): boolean {
  return !polyState.forbidOverlap || !wouldConflict(cells, x, y, ignoreId);
}

/* ---- 배치 ---- */
export function placePiece(key: string, cells: Shape, x: number, y: number): Placement | null {
  if (remaining(key) <= 0) return null;
  if (!canPlaceHere(cells, x, y, null)) return null;
  pushUndo();
  const p: Placement = { id: polyState.nextPlacementId++, key, cells: normalize(cells), x, y };
  polyState.placements.push(p);
  polyUi.selectedId = p.id;
  polySaveState(); polyRender();
  return p;
}
export function movePlacement(id: number, x: number, y: number): boolean {
  const p = polyState.placements.find(q => q.id === id); if (!p) return false;
  if (p.x === x && p.y === y) { polyRender(); return true; }
  if (!canPlaceHere(p.cells, x, y, id)) { polyRender(); return false; }
  pushUndo(); p.x = x; p.y = y; polyUi.selectedId = id;
  polySaveState(); polyRender();
  return true;
}
export function removePlacement(id: number): void {
  if (!polyState.placements.some(p => p.id === id)) return;
  pushUndo();
  polyState.placements = polyState.placements.filter(p => p.id !== id);
  if (polyUi.selectedId === id) polyUi.selectedId = null;
  polySaveState(); polyRender();
}
function transformPlacement(id: number, fn: (s: Shape) => Shape): void {
  const p = polyState.placements.find(q => q.id === id); if (!p) return;
  const next = fn(p.cells);
  /* 허용 변형 안에 있는지 (회전 금지면 돌리지 않음) */
  const allowed = orientations(p.cells, symOpts()).map(shapeKey);
  if (!allowed.includes(shapeKey(next))) return;
  /* 같은 칸(무게중심 근처)에 머물도록 원점 보정 */
  const cx = (s: Shape) => s.reduce((a, c) => a + c[0], 0) / s.length, cy = (s: Shape) => s.reduce((a, c) => a + c[1], 0) / s.length;
  const nx = Math.round(p.x + cx(p.cells) - cx(next)), ny = Math.round(p.y + cy(p.cells) - cy(next));
  if (!canPlaceHere(next, nx, ny, id)) return;
  pushUndo(); p.cells = next; p.x = nx; p.y = ny;
  polySaveState(); polyRender();
}
export function rotatePlacement(id: number): void { if (polyState.allowRotate) transformPlacement(id, rotateCW); }
export function flipPlacement(id: number): void { if (polyState.allowFlip) transformPlacement(id, flipH); }
export function setMemo(id: number, memo: string): void {
  const p = polyState.placements.find(q => q.id === id); if (!p) return;
  p.memo = memo.trim().slice(0, 4) || undefined;
  polySaveState(); polyRender();
}
export function resetPlacements(): void {
  if (!polyState.placements.length) return;
  pushUndo(); polyState.placements = []; polyUi.selectedId = null;
  polySaveState(); polyRender();
}
export function selectPlacement(id: number | null): void { polyUi.selectedId = id; polyRender(); }

/* ---- 도면 ---- */
export function resize(w: number, h: number): void {
  const nb = resizeBoard(boardOf(), w, h);
  if (nb.w === polyState.w && nb.h === polyState.h) return;
  pushUndo();
  polyState.w = nb.w; polyState.h = nb.h; polyState.holes = [...nb.holes]; polyState.letters = nb.letters;
  polySaveState(); polyRender();
}
export function setHole(x: number, y: number, on: boolean, batch = false): void {
  const k = cellKey(x, y);
  const has = polyState.holes.includes(k);
  if (has === on) return;
  if (!batch) pushUndo();
  polyState.holes = on ? [...polyState.holes, k] : polyState.holes.filter(h => h !== k);
  polySaveState(); polyRender();
}
export function setLetter(x: number, y: number, ch: string): void {
  const k = cellKey(x, y);
  const v = Array.from(ch.trim())[0] || '';
  if ((polyState.letters[k] || '') === v) return;
  pushUndo();
  if (v) polyState.letters[k] = v; else delete polyState.letters[k];
  polySaveState(); polyRender();
}
export function hasLetters(): boolean { return Object.keys(polyState.letters).some(k => polyState.letters[k]); }

/* ---- 피스 선택 ---- */
export function setCount(key: string, v: number | 'inf'): void {
  if (v === 'inf') polyState.counts[key] = 'inf';
  else if (v <= 0) delete polyState.counts[key];
  else polyState.counts[key] = Math.min(99, Math.floor(v));
  /* 개수를 줄이면 초과 배치는 뒤에서부터 트레이로 */
  if (v !== 'inf') {
    const placed = polyState.placements.filter(p => p.key === key);
    const over = placed.length - (v <= 0 ? 0 : Math.floor(v));
    if (over > 0) { pushUndo(); const drop = new Set(placed.slice(-over).map(p => p.id)); polyState.placements = polyState.placements.filter(p => !drop.has(p.id)); if (polyUi.selectedId !== null && drop.has(polyUi.selectedId)) polyUi.selectedId = null; }
  }
  polySaveState(); polyRender();
}
export function bumpCount(key: string, d: number): void {
  const c = polyState.counts[key];
  if (c === 'inf') { if (d < 0) setCount(key, polyState.placements.filter(p => p.key === key).length); return; }
  setCount(key, (c || 0) + d);
}
export function toggleInf(key: string): void {
  const c = polyState.counts[key];
  setCount(key, c === 'inf' ? polyState.placements.filter(p => p.key === key).length : 'inf');
}
export function setAllOfSize(size: number, n: number): void {
  for (const p of catalog()) if ((size === 0 ? !!p.custom : (!p.custom && p.size === size))) setCount(p.key, n);
}

/* ---- 옵션 ---- */
export function setAllowFlip(on: boolean): void {
  if (polyState.allowFlip === on) return;
  const before = catalog();
  polyState.allowFlip = on;
  const after = catalog();
  /* 개수 재배정: 켬→끔 이면 자유 키 → ':a' 로, 끔→켬 이면 ':a'+':b' 합산 → 자유 키 */
  const counts: Record<string, number | 'inf'> = {};
  const add = (k: string, v: number | 'inf') => { if (v === 'inf' || counts[k] === 'inf') counts[k] = 'inf'; else counts[k] = (counts[k] as number || 0) + v; };
  for (const k of Object.keys(polyState.counts)) {
    const v = polyState.counts[k];
    if (k.startsWith('u:')) { add(k, v); continue; }
    const base = k.replace(/:[ab]$/, '');
    if (on) add(base, v);
    else { const target = after.some(p => p.key === base + ':a') ? base + ':a' : base; add(target, v); }
  }
  polyState.counts = counts;
  /* 놓인 피스 키 재배정 */
  for (const p of polyState.placements) p.key = keyForShape(after, p.cells, symOpts(), p.key.replace(/:[ab]$/, ''));
  for (const p of polyState.placements) { if (!polyState.counts[p.key] && remaining(p.key) <= 0) polyState.counts[p.key] = (polyState.counts[p.key] as number || 0) + 1; }
  polyState.trayOrient = {};
  void before;
  polySaveState(); polyRender();
}
export function setAllowRotate(on: boolean): void { polyState.allowRotate = on; polyState.trayOrient = {}; polySaveState(); polyRender(); }
export function setForbidOverlap(on: boolean): void { polyState.forbidOverlap = on; polySaveState(); polyRender(); }
export function setCoverLetters(on: boolean): void { polyState.coverLetters = on; polySaveState(); polyRender(); }

/* ---- 자작 피스 ---- */
export function addCustom(rows: string): number {
  const id = polyState.nextCustomId++;
  polyState.customs.push({ id, rows });
  polyState.counts['u:' + id] = 1;
  polySaveState(); polyRender();
  return id;
}
export function removeCustom(id: number): void {
  const key = 'u:' + id;
  if (polyState.placements.some(p => p.key === key)) pushUndo();
  polyState.customs = polyState.customs.filter(c => c.id !== id);
  delete polyState.counts[key];
  polyState.placements = polyState.placements.filter(p => p.key !== key);
  polySaveState(); polyRender();
}

/** 전체 삭제: 도면·피스·배치 모두 초기화 (옵션은 유지) */
export function clearAll(): void {
  pushUndo();
  polyState.holes = []; polyState.letters = {}; polyState.placements = []; polyState.counts = {}; polyState.trayOrient = {};
  polyUi.selectedId = null;
  polySaveState(); polyRender();
}
