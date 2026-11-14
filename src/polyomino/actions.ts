/* 폴리오미노 — 상태 변경 동작 (저장·되돌리기·재렌더 포함). UI 모듈은 이 함수들만 호출한다. */
import { polyState, polySaveState, pushUndo, boardOf } from './state';
import { buildCatalog, findPiece } from './shapes';
import type { CatalogPiece } from './shapes';
import { computeCoverage, resizeBoard, cellKey, inBoard, isHole, rotateCW, flipH, normalize, shapeKey, orientations, FREE } from './model';
import { findEntry, entryRemaining, entryOrientations } from './entries';
import type { PieceEntry } from './entries';
import type { Placement, Shape, SymmetryOpts } from './model';
import type { EditMode } from './state';

/* ---- 재렌더 간접 호출 (ui.ts 가 등록) ---- */
let renderer: () => void = () => {};
export function setPolyRenderer(fn: () => void): void { renderer = fn; }
export function polyRender(): void { renderer(); }

/* ---- UI 휘발 상태 ---- */
export const polyUi = { selectedId: null as number | null, solveSeq: 0 };

export function symOpts(): SymmetryOpts { return { allowRotate: polyState.allowRotate, allowFlip: polyState.allowFlip }; }
export function catalog(): CatalogPiece[] { return buildCatalog(polyState.customs); }
export function pieceByKey(key: string): CatalogPiece | null { return findPiece(catalog(), key); }

export function entryById(id: number | undefined): PieceEntry | undefined { return id === undefined ? undefined : polyState.entries.find(e => e.id === id); }
/** 항목의 남은 개수 (무제한이면 Infinity) */
export function remaining(entryId: number): number {
  const e = entryById(entryId);
  return e ? entryRemaining(e, polyState.placements) : 0;
}
/** 선택한 피스 총 칸 수 (무제한 피스는 제외) 와 무제한 피스 존재 여부 */
export function selectedArea(): { area: number; hasInf: boolean } {
  let area = 0, hasInf = false;
  for (const e of polyState.entries) { if (e.count === 'inf') hasInf = true; else area += e.count * e.shape.length; }
  return { area, hasInf };
}

/* ---- 피스 선택 카드의 방향 (회전·뒤집기 허용과 무관하게 항상 8방향 중에서 고른다) ---- */
export function pickShape(p: CatalogPiece): Shape {
  const os = orientations(p.shape, FREE);
  const i = (((polyState.pickOrient[p.key] || 0) % os.length) + os.length) % os.length;
  return os[i];
}
export function pickTurn(key: string, how: 'rotate' | 'flip'): void {
  const p = pieceByKey(key); if (!p) return;
  const os = orientations(p.shape, FREE);
  const cur = pickShape(p);
  const target = shapeKey(how === 'rotate' ? rotateCW(cur) : flipH(cur));
  const idx = os.findIndex(o => shapeKey(o) === target);
  if (idx >= 0) polyState.pickOrient[key] = idx;
  polySaveState(); polyRender();
}
/** 카드에 보이는 방향의 항목 */
export function pickEntry(p: CatalogPiece): PieceEntry | undefined { return findEntry(polyState.entries, p.key, pickShape(p)); }
export function entriesOfKey(key: string): PieceEntry[] { return polyState.entries.filter(e => e.key === key); }

/** 트레이 카드에 보이는 변형 (항목이 고른 방향에서 허용된 회전·뒤집기 안에서) */
export function trayShape(e: PieceEntry): Shape {
  const os = entryOrientations(e, symOpts());
  const i = (((polyState.trayOrient[e.id] || 0) % os.length) + os.length) % os.length;
  return os[i];
}
export function trayRotate(entryId: number, dir: 1 | -1 = 1): void {
  const e = entryById(entryId); if (!e) return;
  const os = entryOrientations(e, symOpts());
  const cur = trayShape(e);
  const target = shapeKey(dir === 1 ? rotateCW(cur) : flipH(cur));
  const idx = os.findIndex(o => shapeKey(o) === target);
  if (idx >= 0) polyState.trayOrient[entryId] = idx;
  polySaveState(); polyRender();
}
export function trayFlip(entryId: number): void { trayRotate(entryId, -1); }

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
export function placePiece(entryId: number, cells: Shape, x: number, y: number): Placement | null {
  const e = entryById(entryId); if (!e) return null;
  if (remaining(entryId) <= 0) return null;
  if (!canPlaceHere(cells, x, y, null)) return null;
  pushUndo();
  const p: Placement = { id: polyState.nextPlacementId++, key: e.key, entry: e.id, cells: normalize(cells), x, y };
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
  /* 제자리에 머물도록 원점 보정: 피스를 감싸는 사각형의 중심을 맞춘다.
     (칸들의 무게중심을 쓰면 칸이 떨어진 자작 피스는 무게중심이 한쪽으로 쏠려 돌릴 때마다 피스가 밀린다) */
  const cx = (s: Shape) => (Math.min(...s.map(c => c[0])) + Math.max(...s.map(c => c[0]))) / 2, cy = (s: Shape) => (Math.min(...s.map(c => c[1])) + Math.max(...s.map(c => c[1]))) / 2;
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
/** 구멍 토글. batch=true 면 되돌리기 스냅샷·전체 재렌더 없이 상태만 바꾼다 (드래그로 칠하는 동안 — 끝날 때 한 번 재렌더) */
export function setHole(x: number, y: number, on: boolean, batch = false): boolean {
  const k = cellKey(x, y);
  const has = polyState.holes.includes(k);
  if (has === on) return false;
  if (!batch) pushUndo();
  polyState.holes = on ? [...polyState.holes, k] : polyState.holes.filter(h => h !== k);
  polySaveState();
  if (!batch) polyRender();
  return true;
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
/** 항목 개수 설정. 0 이하면 항목을 없앤다. 개수를 줄이면 초과 배치는 뒤에서부터 트레이로 */
function setEntryCount(e: PieceEntry, v: number | 'inf'): void {
  if (v !== 'inf') {
    const n = Math.max(0, Math.min(99, Math.floor(v)));
    const placed = polyState.placements.filter(p => p.entry === e.id);
    const over = placed.length - n;
    if (over > 0) { pushUndo(); const drop = new Set(placed.slice(-over).map(p => p.id)); polyState.placements = polyState.placements.filter(p => !drop.has(p.id)); if (polyUi.selectedId !== null && drop.has(polyUi.selectedId)) polyUi.selectedId = null; }
    if (n <= 0) { polyState.entries = polyState.entries.filter(x => x.id !== e.id); delete polyState.trayOrient[e.id]; }
    else e.count = n;
  } else e.count = 'inf';
}
function addEntry(key: string, shape: Shape, count: number | 'inf'): PieceEntry {
  const e: PieceEntry = { id: polyState.nextEntryId++, key, shape: normalize(shape), count };
  polyState.entries.push(e);
  return e;
}
/** 피스 선택 카드(보이는 방향)의 개수 ±d */
export function bumpPick(key: string, d: number): void {
  const p = pieceByKey(key); if (!p) return;
  const e = pickEntry(p);
  if (!e) { if (d > 0) addEntry(key, pickShape(p), d); }
  else if (e.count === 'inf') { if (d < 0) setEntryCount(e, polyState.placements.filter(q => q.entry === e.id).length); }
  else setEntryCount(e, e.count + d);
  polySaveState(); polyRender();
}
export function togglePickInf(key: string): void {
  const p = pieceByKey(key); if (!p) return;
  const e = pickEntry(p);
  if (!e) addEntry(key, pickShape(p), 'inf');
  else setEntryCount(e, e.count === 'inf' ? polyState.placements.filter(q => q.entry === e.id).length : 'inf');
  polySaveState(); polyRender();
}
/** 트레이 카드(항목)의 개수 ±d */
export function bumpEntry(entryId: number, d: number): void {
  const e = entryById(entryId); if (!e) return;
  if (e.count === 'inf') { if (d < 0) setEntryCount(e, polyState.placements.filter(q => q.entry === e.id).length); }
  else setEntryCount(e, e.count + d);
  polySaveState(); polyRender();
}
/** 피스 선택 패널에 지금 보이는 피스인가 (6칸 탭의 「주사위 전개도만」 필터 반영) */
export function isPickerVisible(p: CatalogPiece, size: number): boolean {
  if (size === 0) return !!p.custom;
  if (p.custom || p.size !== size) return false;
  if (size === 6 && polyState.cubeNetsOnly && !p.cubeNet) return false;
  return true;
}
/** 「이 크기 전부 1개씩」: 아직 고르지 않은 피스를 카드에 보이는 방향으로 1개씩 · n=0 이면 이 크기 피스를 모든 방향에서 뺀다 */
export function setAllOfSize(size: number, n: number): void {
  for (const p of catalog()) {
    if (!isPickerVisible(p, size)) continue;
    if (n > 0) { if (!entriesOfKey(p.key).length) addEntry(p.key, pickShape(p), n); }
    else for (const e of entriesOfKey(p.key)) setEntryCount(e, 0);
  }
  polySaveState(); polyRender();
}
export function setCubeNetsOnly(on: boolean): void { polyState.cubeNetsOnly = on; polySaveState(); polyRender(); }

/* ---- 옵션 ---- */
/* 회전·뒤집기 허용: 고른 방향에서 얼마나 돌릴 수 있는지만 바뀐다 (항목·놓인 피스는 그대로) */
export function setAllowFlip(on: boolean): void { polyState.allowFlip = on; polyState.trayOrient = {}; polySaveState(); polyRender(); }
export function setAllowRotate(on: boolean): void { polyState.allowRotate = on; polyState.trayOrient = {}; polySaveState(); polyRender(); }
export function setForbidOverlap(on: boolean): void { polyState.forbidOverlap = on; polySaveState(); polyRender(); }
export function setCoverLetters(on: boolean): void { polyState.coverLetters = on; polySaveState(); polyRender(); }
/** 도면 편집 모드. rerender=false 면 전체를 다시 그리지 않고 세그먼트·도면 클래스만 맞춘다 (드래그 도중 전환용) */
export function setEditMode(mode: EditMode, rerender = true): void {
  polyState.editMode = mode;
  polySaveState();
  if (rerender) { polyRender(); return; }
  document.querySelectorAll<HTMLButtonElement>('#poly-edit-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const svg = document.querySelector('svg.poly-board');
  if (svg) svg.setAttribute('class', 'poly-board mode-' + mode);
}

/* ---- 자작 피스 ---- */
export function addCustom(rows: string): number {
  const id = polyState.nextCustomId++;
  polyState.customs.push({ id, rows });
  const p = pieceByKey('u:' + id);
  if (p) addEntry(p.key, p.shape, 1);
  polySaveState(); polyRender();
  return id;
}
export function removeCustom(id: number): void {
  const key = 'u:' + id;
  if (polyState.placements.some(p => p.key === key)) pushUndo();
  polyState.customs = polyState.customs.filter(c => c.id !== id);
  polyState.entries = polyState.entries.filter(e => e.key !== key);
  delete polyState.pickOrient[key];
  polyState.placements = polyState.placements.filter(p => p.key !== key);
  polySaveState(); polyRender();
}

/** 전체 삭제: 도면·피스·배치 모두 초기화 (옵션은 유지) */
export function clearAll(): void {
  pushUndo();
  polyState.holes = []; polyState.letters = {}; polyState.placements = []; polyState.entries = []; polyState.trayOrient = {};
  polyUi.selectedId = null;
  polySaveState(); polyRender();
}
