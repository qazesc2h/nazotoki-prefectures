/* 공작 — 상태를 바꾸는 동작 (되돌리기 기록 · 단계 설명 · 저장 · 다시 그리기). UI 는 이 함수들만 호출한다. */
import { craftState, pushUndo, craftSaveState, undo, redo, newSheet, sheetById, currentSheet } from './state';
import type { Tool, Side } from './state';
import { addSheet, removeSheet, cutPolyline, foldPiece, movePiece, rotatePiece, flipPiece, flipAll, raisePiece, lowerPiece, deletePiece, components, docBounds, sheetBounds, facetById, stackOf, cloneDoc } from './model';
import { applyPoly, compose, translate, bbox } from './geom';
import type { Doc } from './model';
import type { Pt } from './geom';
import { PALETTE_SIZE } from './palette';

let renderer: () => void = () => {};
export function setCraftRenderer(fn: () => void): void { renderer = fn; }
export function craftRender(): void { renderer(); }

/** 선택·도구 진행 등 저장하지 않는 UI 상태 */
export const craftUi = {
  selected: [] as number[],      /* 선택 조각의 면 id */
  textSide: 'front' as Side,     /* 오른쪽 패널에서 편집 중인 면 */
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const fmtPt = (p: Pt) => '(' + fmt(p[0]) + ', ' + fmt(p[1]) + ')';
const sheetLabel = (id: number) => craftState.sheets.length > 1 ? '종이 ' + id + ' ' : '';

function commit(next: Doc, step?: string): void {
  pushUndo();
  craftState.doc = next;
  if (step) craftState.steps.push(step);
  craftSaveState();
  craftRender();
}

/** 아무 조작도 안 한 상태 (모든 장이 평평한 한 면) */
export function isPristine(): boolean {
  const d = craftState.doc;
  return d.cuts.length === 0 && craftState.sheets.every(s => { const fs = d.facets.filter(f => f.sheet === s.id); return fs.length === 1 && isFlatAt(fs[0].xf); });
}
/* 평평하되 어디에 놓였든 상관없음: 회전·반사가 없는 변환 */
function isFlatAt(xf: number[]): boolean { return Math.abs(xf[0] - 1) < 1e-9 && Math.abs(xf[1]) < 1e-9 && Math.abs(xf[2]) < 1e-9 && Math.abs(xf[3] - 1) < 1e-9; }
export function sheetIsPristine(id: number): boolean {
  const d = craftState.doc;
  const fs = d.facets.filter(f => f.sheet === id);
  return fs.length === 1 && isFlatAt(fs[0].xf) && !d.cuts.some(c => c.sheet === id);
}
export function pieceCount(): number { return components(craftState.doc).length; }
export function sheetOfFacet(facetId: number): number | null { const f = facetById(craftState.doc, facetId); return f ? f.sheet : null; }

export function setTool(t: Tool): void { craftState.tool = t; craftSaveState(); craftRender(); }
export function setFoldOver(v: boolean): void { craftState.foldOver = v; craftSaveState(); craftRender(); }
export function setShowGrid(v: boolean): void { craftState.showGrid = v; craftSaveState(); craftRender(); }
export function setShowBackThrough(v: boolean): void { craftState.showBackThrough = v; craftSaveState(); craftRender(); }
export function setZoom(z: number): void { craftState.zoom = Math.max(16, Math.min(160, z)); craftSaveState(); craftRender(); }
export function setSheetColor(id: number, color: number): void { const sh = sheetById(id); if (!sh || sh.color === color) return; pushUndo(); sh.color = color; craftSaveState(); craftRender(); }
export function setCurSheet(id: number): void { if (sheetById(id)) { craftState.curSheet = id; craftSaveState(); craftRender(); } }

/** 새 장을 놓을 자리: 지금 있는 종이들의 오른쪽 */
function nextSheetSpot(): Pt {
  if (!craftState.doc.facets.length) return [0, 0];
  const b = docBounds(craftState.doc);
  return [Math.ceil(b.maxX) + 1, Math.floor(b.minY)];
}
/** 장 추가 (현재 장과 같은 크기) → 그 장이 현재 장이 된다 */
export function addNewSheet(): void {
  const cur = currentSheet();
  const id = Math.max(0, ...craftState.sheets.map(s => s.id)) + 1;
  const used = new Set(craftState.sheets.map(s => s.color));
  let color = 0; while (used.has(color) && color < PALETTE_SIZE) color++;   /* 아직 안 쓴 색 */
  pushUndo();
  craftState.sheets.push(newSheet(id, cur.w, cur.h, color % PALETTE_SIZE));
  craftState.doc = addSheet(craftState.doc, id, cur.w, cur.h, nextSheetSpot());
  craftState.curSheet = id;
  craftState.steps.push('종이 ' + id + ' 추가 (' + cur.w + '×' + cur.h + ')');
  craftSaveState(); craftRender();
}
/** 장 삭제 (마지막 한 장이면 처음 상태로 되돌리기만) */
export function removeCurrentSheet(): void {
  const cur = currentSheet();
  craftUi.selected = [];
  if (craftState.sheets.length <= 1) { resetSheet(); return; }
  pushUndo();
  craftState.doc = removeSheet(craftState.doc, cur.id);
  craftState.sheets = craftState.sheets.filter(s => s.id !== cur.id);
  craftState.curSheet = craftState.sheets[0].id;
  craftState.steps.push('종이 ' + cur.id + ' 삭제');
  craftSaveState(); craftRender();
}
/** 현재 장 크기 변경 — 그 장의 자르기·접기는 초기화 (글자·사진은 유지) */
export function resize(w: number, h: number): void {
  w = Math.max(1, Math.min(30, w)); h = Math.max(1, Math.min(30, h));
  const cur = currentSheet();
  if (w === cur.w && h === cur.h) return;
  pushUndo();
  const fs = craftState.doc.facets.filter(f => f.sheet === cur.id);
  const at: Pt = fs.length ? (() => { const b = sheetBounds(craftState.doc, cur.id); return [b.minX, b.minY] as Pt; })() : nextSheetSpot();
  cur.w = w; cur.h = h;
  craftState.doc = addSheet(removeSheet(craftState.doc, cur.id), cur.id, w, h, at);
  craftUi.selected = [];
  craftState.steps.push(sheetLabel(cur.id) + '크기 ' + w + '×' + h + ' 로 새 종이');
  craftSaveState(); craftRender();
}
/** 처음 상태로: 모든 장을 평평하게 가로로 나란히 (글자·사진은 유지) */
export function resetSheet(): void {
  craftUi.selected = [];
  let d: Doc = { facets: [], cuts: [], nextId: 1 };
  let x = 0;
  for (const s of craftState.sheets) { d = addSheet(d, s.id, s.w, s.h, [x, 0]); x += s.w + 1; }
  commit(d, '처음으로');
}

export function doCut(pts: Pt[]): boolean {
  if (pts.length < 2) return false;
  const next = cutPolyline(craftState.doc, pts);
  if (next.facets.length === craftState.doc.facets.length) return false;   /* 아무 면도 갈리지 않음 */
  craftUi.selected = [];
  commit(next, '자르기 ' + pts.map(fmtPt).join('→'));
  return true;
}
export function doFold(pieceIds: number[], a: Pt, b: Pt, movePt: Pt): boolean {
  const next = foldPiece(craftState.doc, pieceIds, a, b, movePt, craftState.foldOver);
  if (next === craftState.doc) return false;
  craftUi.selected = [];
  const sh = sheetOfFacet(pieceIds[0]);
  commit(next, (sh ? sheetLabel(sh) : '') + '접기 ' + fmtPt(a) + '–' + fmtPt(b) + ' ' + fmtPt(movePt) + ' 쪽을 ' + (craftState.foldOver ? '위로' : '아래로'));
  return true;
}
/** 끌어 옮기기 끝: 시작 문서를 되돌리기 기록으로 남기고 결과를 반영 */
export function commitMove(startDoc: Doc, finalDoc: Doc, dx: number, dy: number): void {
  const cur = craftState.doc;
  craftState.doc = startDoc; pushUndo(); craftState.doc = cur;
  craftState.doc = finalDoc;
  craftState.steps.push('조각 이동 (' + (dx >= 0 ? '+' : '') + fmt(dx) + ', ' + (dy >= 0 ? '+' : '') + fmt(dy) + ')');
  craftSaveState(); craftRender();
}
export function nudge(dx: number, dy: number): void {
  if (!craftUi.selected.length) return;
  commit(movePiece(craftState.doc, craftUi.selected, dx, dy), '조각 이동 (' + (dx >= 0 ? '+' : '') + fmt(dx) + ', ' + (dy >= 0 ? '+' : '') + fmt(dy) + ')');
}
export function rotateSelected(deg: number): void {
  if (!craftUi.selected.length) return;
  commit(rotatePiece(craftState.doc, craftUi.selected, deg * Math.PI / 180), '조각 회전 ' + deg + '°');
}
export function flipSelected(): void {
  if (!craftUi.selected.length) return;
  commit(flipPiece(craftState.doc, craftUi.selected), '조각 뒤집기');
}
/** 선택 조각과 포개진 조각들을 한 묶음으로 뒤집기: 묶음 전체의 층 순서가 반전된다 (맨 위 종이가 바닥으로, 바닥 종이의 뒷면이 맨 위로) */
export function flipStackSelected(): void {
  if (!craftUi.selected.length) return;
  const ids = stackOf(craftState.doc, craftUi.selected);
  const pieces = components(craftState.doc).filter(c => c.some(id => ids.includes(id))).length;
  commit(flipPiece(craftState.doc, ids), pieces > 1 ? '겹친 조각 ' + pieces + '개 통째로 뒤집기' : '조각 뒤집기');
}
/** 선택 조각을 보관함으로 (작업대에서 치움) */
export function stashSelected(): void {
  if (!craftUi.selected.length) return;
  const ids = craftUi.selected; craftUi.selected = [];
  const facets = craftState.doc.facets.filter(f => ids.includes(f.id)).map(f => JSON.parse(JSON.stringify(f)) as typeof f);
  const id = Math.max(0, ...craftState.stash.map(it => it.id)) + 1;
  pushUndo();
  craftState.stash.push({ id, facets });
  craftState.doc = deletePiece(craftState.doc, ids);
  craftState.steps.push('조각을 보관함에 (#' + id + ')');
  craftSaveState(); craftRender();
}
/** 보관함에서 꺼내 작업대 오른쪽 빈 자리에 맨 위층으로 놓기 */
export function unstash(id: number): void {
  const it = craftState.stash.find(x => x.id === id); if (!it) return;
  pushUndo();
  const b = bbox(it.facets.map(f => f.poly));
  const at = nextSheetSpot();
  const m = translate(at[0] - b.minX, at[1] - b.minY);
  const doc = cloneDoc(craftState.doc);
  const maxZ = doc.facets.length ? Math.max(...doc.facets.map(f => f.z)) : -1;
  const sorted = it.facets.slice().sort((x, y) => x.z - y.z);
  sorted.forEach((f, i) => { doc.facets.push({ ...f, id: doc.nextId++, poly: applyPoly(m, f.poly), xf: compose(m, f.xf), z: maxZ + 1 + i }); });
  craftState.doc = doc;
  craftState.stash = craftState.stash.filter(x => x.id !== id);
  craftUi.selected = doc.facets.slice(-sorted.length).map(f => f.id);
  craftState.steps.push('보관함에서 꺼냄 (#' + id + ')');
  craftSaveState(); craftRender();
}
/** 보관함을 전부 꺼내 작업대 오른쪽에 차례로 놓기 (되돌리기 한 번) */
export function unstashAll(): void {
  if (!craftState.stash.length) return;
  pushUndo();
  const doc = cloneDoc(craftState.doc);
  const placed: number[] = [];
  for (const it of craftState.stash) {
    const b = bbox(it.facets.map(f => f.poly));
    const at: Pt = doc.facets.length ? (() => { const db = docBounds(doc); return [Math.ceil(db.maxX) + 1, Math.floor(db.minY)] as Pt; })() : [0, 0];
    const m = translate(at[0] - b.minX, at[1] - b.minY);
    const maxZ = doc.facets.length ? Math.max(...doc.facets.map(f => f.z)) : -1;
    it.facets.slice().sort((x, y) => x.z - y.z).forEach((f, i) => { const nf = { ...f, id: doc.nextId++, poly: applyPoly(m, f.poly), xf: compose(m, f.xf), z: maxZ + 1 + i }; doc.facets.push(nf); placed.push(nf.id); });
  }
  const n = craftState.stash.length;
  craftState.doc = doc;
  craftState.stash = [];
  craftUi.selected = [];
  craftState.steps.push('보관함 모두 꺼냄 (' + n + '개)');
  craftSaveState(); craftRender();
}
export function deleteAllStash(): void {
  if (!craftState.stash.length) return;
  pushUndo();
  const n = craftState.stash.length;
  craftState.stash = [];
  craftState.steps.push('보관함 모두 삭제 (' + n + '개)');
  craftSaveState(); craftRender();
}
export function deleteStash(id: number): void {
  if (!craftState.stash.some(x => x.id === id)) return;
  pushUndo();
  craftState.stash = craftState.stash.filter(x => x.id !== id);
  craftState.steps.push('보관함 #' + id + ' 삭제');
  craftSaveState(); craftRender();
}
export function raiseSelected(): void { if (craftUi.selected.length) commit(raisePiece(craftState.doc, craftUi.selected), '조각을 맨 위로'); }
export function lowerSelected(): void { if (craftUi.selected.length) commit(lowerPiece(craftState.doc, craftUi.selected), '조각을 맨 아래로'); }
export function deleteSelected(): void {
  if (!craftUi.selected.length) return;
  const ids = craftUi.selected; craftUi.selected = [];
  commit(deletePiece(craftState.doc, ids), '조각 삭제');
}
export function doFlipAll(): void { craftUi.selected = []; commit(flipAll(craftState.doc), '전체 뒤집어 보기'); }

export function setCellText(sheet: number, side: Side, r: number, c: number, s: string): void {
  const sh = sheetById(sheet); if (!sh) return;
  const key = r + ',' + c;
  const cur = sh.texts[side][key] || '';
  if (cur === s) return;
  pushUndo();
  if (s) sh.texts[side][key] = s; else delete sh.texts[side][key];
  craftSaveState(); craftRender();
}
/** 일괄 입력: 줄 = 행, 공백·쉼표 = 칸 구분, _ 또는 - 는 빈 칸 */
export function setTextsBulk(sheet: number, side: Side, text: string): void {
  const sh = sheetById(sheet); if (!sh) return;
  const out: Record<string, string> = {};
  text.replace(/\r/g, '').split('\n').forEach((line, r) => {
    if (r >= sh.h) return;
    const cells = line.trim().split(/[\s,、，]+/).filter(Boolean);
    cells.forEach((cell, c) => { if (c < sh.w && cell !== '_' && cell !== '-' && cell !== '＿' && cell !== '－') out[r + ',' + c] = cell; });
  });
  pushUndo();
  sh.texts[side] = out;
  craftSaveState(); craftRender();
}
export function textsToBulk(sheet: number, side: Side): string {
  const sh = sheetById(sheet); if (!sh) return '';
  const t = sh.texts[side];
  const rows: string[] = [];
  for (let r = 0; r < sh.h; r++) {
    const cells: string[] = [];
    for (let c = 0; c < sh.w; c++) cells.push(t[r + ',' + c] || '_');
    rows.push(cells.join(' '));
  }
  return rows.join('\n');
}
export function clearSteps(): void { craftState.steps = []; craftSaveState(); craftRender(); }
export function doUndo(): void { if (undo()) { craftUi.selected = []; craftSaveState(); craftRender(); } }
export function doRedo(): void { if (redo()) { craftUi.selected = []; craftSaveState(); craftRender(); } }
