/* 공작 — 상태를 바꾸는 동작 (되돌리기 기록 · 단계 설명 · 저장 · 다시 그리기). UI 는 이 함수들만 호출한다. */
import { craftState, pushUndo, craftSaveState, undo, redo } from './state';
import type { Tool, Side } from './state';
import { newDoc, cutPolyline, foldPiece, movePiece, rotatePiece, flipPiece, flipAll, raisePiece, lowerPiece, deletePiece, components } from './model';
import type { Doc } from './model';
import type { Pt } from './geom';

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

function commit(next: Doc, step?: string): void {
  pushUndo();
  craftState.doc = next;
  if (step) craftState.steps.push(step);
  craftSaveState();
  craftRender();
}

export function isPristine(): boolean {
  const d = craftState.doc;
  return d.facets.length === 1 && d.cuts.length === 0 && d.facets[0].xf.every((v, i) => v === [1, 0, 0, 1, 0, 0][i]);
}
export function pieceCount(): number { return components(craftState.doc).length; }
export function maxLayers(): number {
  /* 겹친 층 수는 지점마다 다르니, 면 수를 상한으로 간단히 보인다 */
  return craftState.doc.facets.length;
}

export function setTool(t: Tool): void { craftState.tool = t; craftSaveState(); craftRender(); }
export function setFoldOver(v: boolean): void { craftState.foldOver = v; craftSaveState(); craftRender(); }
export function setShowGrid(v: boolean): void { craftState.showGrid = v; craftSaveState(); craftRender(); }
export function setShowBackThrough(v: boolean): void { craftState.showBackThrough = v; craftSaveState(); craftRender(); }
export function setZoom(z: number): void { craftState.zoom = Math.max(16, Math.min(160, z)); craftSaveState(); craftRender(); }

/** 종이 크기 변경 — 자르기·접기는 초기화 (글자·사진은 유지) */
export function resize(w: number, h: number): void {
  w = Math.max(1, Math.min(30, w)); h = Math.max(1, Math.min(30, h));
  if (w === craftState.w && h === craftState.h) return;
  craftState.w = w; craftState.h = h;
  craftUi.selected = [];
  commit(newDoc(w, h), '새 종이 ' + w + '×' + h);
}
/** 처음 상태로 (글자·사진은 유지) */
export function resetSheet(): void {
  craftUi.selected = [];
  commit(newDoc(craftState.w, craftState.h), '처음으로');
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
  commit(next, '접기 ' + fmtPt(a) + '–' + fmtPt(b) + ' ' + fmtPt(movePt) + ' 쪽을 ' + (craftState.foldOver ? '위로' : '아래로'));
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
export function raiseSelected(): void { if (craftUi.selected.length) commit(raisePiece(craftState.doc, craftUi.selected), '조각을 맨 위로'); }
export function lowerSelected(): void { if (craftUi.selected.length) commit(lowerPiece(craftState.doc, craftUi.selected), '조각을 맨 아래로'); }
export function deleteSelected(): void {
  if (!craftUi.selected.length) return;
  const ids = craftUi.selected; craftUi.selected = [];
  const next = deletePiece(craftState.doc, ids);
  if (!next.facets.length) { commit(newDoc(craftState.w, craftState.h), '마지막 조각 삭제 → 새 종이'); return; }
  commit(next, '조각 삭제');
}
export function doFlipAll(): void { craftUi.selected = []; commit(flipAll(craftState.doc), '전체 뒤집어 보기'); }

export function setCellText(side: Side, r: number, c: number, s: string): void {
  const key = r + ',' + c;
  const cur = craftState.texts[side][key] || '';
  if (cur === s) return;
  pushUndo();
  if (s) craftState.texts[side][key] = s; else delete craftState.texts[side][key];
  craftSaveState(); craftRender();
}
/** 일괄 입력: 줄 = 행, 공백·쉼표 = 칸 구분, _ 또는 - 는 빈 칸 */
export function setTextsBulk(side: Side, text: string): void {
  const out: Record<string, string> = {};
  text.replace(/\r/g, '').split('\n').forEach((line, r) => {
    if (r >= craftState.h) return;
    const cells = line.trim().split(/[\s,、，]+/).filter(Boolean);
    cells.forEach((cell, c) => { if (c < craftState.w && cell !== '_' && cell !== '-' && cell !== '＿' && cell !== '－') out[r + ',' + c] = cell; });
  });
  pushUndo();
  craftState.texts[side] = out;
  craftSaveState(); craftRender();
}
export function textsToBulk(side: Side): string {
  const t = craftState.texts[side];
  const rows: string[] = [];
  for (let r = 0; r < craftState.h; r++) {
    const cells: string[] = [];
    for (let c = 0; c < craftState.w; c++) cells.push(t[r + ',' + c] || '_');
    rows.push(cells.join(' '));
  }
  return rows.join('\n');
}
export function clearSteps(): void { craftState.steps = []; craftSaveState(); craftRender(); }
export function doUndo(): void { if (undo()) { craftUi.selected = []; craftSaveState(); craftRender(); } }
export function doRedo(): void { if (redo()) { craftUi.selected = []; craftSaveState(); craftRender(); } }
