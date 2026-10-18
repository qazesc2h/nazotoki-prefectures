/* 공작 — 작업대(캔버스) 포인터 조작: 선택·끌어 옮기기 / 자르기 점 찍기 / 접기 선·방향 / 글자 칸 / 층 검사 */
import { apply, invert } from './geom';
import type { Pt } from './geom';
import { topFacetAt, pieceOf, movePiece, snapPoints, nearestSnap, isBack, layersAt } from './model';
import type { Doc, Layer } from './model';
import { craftState } from './state';
import type { Side } from './state';
import { drawCraft, fromPx, toPx } from './render';
import type { Overlay, View } from './render';
import { craftUi, doCut, doFold, commitMove, craftRender } from './actions';

export const overlay: Overlay = { selected: new Set(), cutPts: [], foldPts: [], hover: null, snap: null, inspectPt: null, showSnaps: false };
let canvas: HTMLCanvasElement | null = null;
let view: View | null = null;
let drag: { startDoc: Doc; start: Pt; ids: number[]; dx: number; dy: number; moved: boolean } | null = null;
let raf = 0;
const SNAP_R = 0.32;

export interface CanvasHooks {
  onStatus(msg: string): void;                                  /* 도구 진행 안내 */
  onTextCell(side: Side, r: number, c: number, px: Pt): void;   /* 글자 도구: 칸을 눌렀을 때 */
  onInspect(layers: Layer[]): void;                             /* 층 검사 결과 */
}
let hooks: CanvasHooks = { onStatus: () => {}, onTextCell: () => {}, onInspect: () => {} };

export function initCanvas(el: HTMLCanvasElement, h: CanvasHooks): void {
  canvas = el; hooks = h;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', () => { drag = null; });
  el.addEventListener('pointerleave', () => { overlay.hover = null; overlay.snap = null; scheduleDraw(); });
  el.addEventListener('dblclick', e => { e.preventDefault(); if (craftState.tool === 'cut') finishCut(); });
}
export function redrawCanvas(): View | null {
  if (!canvas) return null;
  overlay.selected = new Set(craftUi.selected);
  overlay.showSnaps = craftState.tool === 'cut' || craftState.tool === 'fold';
  view = drawCraft(canvas, overlay);
  return view;
}
function scheduleDraw(): void { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; redrawCanvas(); }); }
export function currentView(): View | null { return view; }
export function workspacePt(e: PointerEvent | MouseEvent): Pt | null {
  if (!canvas || !view) return null;
  const r = canvas.getBoundingClientRect();
  return fromPx(view, [e.clientX - r.left, e.clientY - r.top]);
}
function snapped(p: Pt): Pt { return nearestSnap(snapPoints(craftState.doc), p, SNAP_R) || p; }
const same = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/* ---- 도구 진행 취소/완료 ---- */
export function cancelTool(): void {
  overlay.cutPts = []; overlay.foldPts = []; overlay.inspectPt = null;
  hooks.onStatus('');
  scheduleDraw();
}
export function finishCut(): void {
  if (craftState.tool !== 'cut') return;
  const pts = overlay.cutPts.slice();
  overlay.cutPts = [];
  if (pts.length < 2) { hooks.onStatus('점을 두 개 이상 찍어야 자를 수 있습니다'); scheduleDraw(); return; }
  if (!doCut(pts)) hooks.onStatus('그 선은 종이를 가르지 않습니다 (종이 안을 지나야 합니다)');
  else hooks.onStatus('');
}
export function hasPendingCut(): boolean { return overlay.cutPts.length > 0; }

/* ---- 포인터 ---- */
function onDown(e: PointerEvent): void {
  if (e.button !== 0 || !canvas) return;
  const wp = workspacePt(e); if (!wp) return;
  const doc = craftState.doc;
  const tool = craftState.tool;
  if (tool === 'select') {
    const f = topFacetAt(doc, wp);
    if (!f) { craftUi.selected = []; craftRender(); return; }
    const ids = pieceOf(doc, f.id);
    craftUi.selected = ids;
    drag = { startDoc: doc, start: wp, ids, dx: 0, dy: 0, moved: false };
    canvas.setPointerCapture(e.pointerId);
    craftRender();
    return;
  }
  if (tool === 'cut') {
    const p = snapped(wp);
    const last = overlay.cutPts[overlay.cutPts.length - 1];
    if (last && same(last, p)) { finishCut(); return; }   /* 같은 점을 다시 누르면 완료 */
    overlay.cutPts.push(p);
    hooks.onStatus(overlay.cutPts.length === 1 ? '다음 점을 누르세요 (점을 이어 꺾인 선도 가능). 끝내려면 마지막 점을 다시 누르거나 엔터' : '점 ' + overlay.cutPts.length + '개 — 마지막 점을 다시 누르거나 엔터로 자릅니다');
    scheduleDraw();
    return;
  }
  if (tool === 'fold') {
    if (overlay.foldPts.length < 2) {
      const p = snapped(wp);
      if (overlay.foldPts.length === 1 && same(overlay.foldPts[0], p)) return;
      overlay.foldPts.push(p);
      hooks.onStatus(overlay.foldPts.length === 1 ? '접는 선의 두 번째 점을 누르세요' : '넘어갈 쪽(접어 올릴 쪽)의 조각 위를 누르세요 — 「넘어간 쪽: ' + (craftState.foldOver ? '위로' : '아래로') + '」');
      scheduleDraw();
      return;
    }
    const f = topFacetAt(doc, wp);
    if (!f) { hooks.onStatus('조각 위를 눌러야 합니다 (넘어갈 쪽)'); return; }
    const [a, b] = overlay.foldPts;
    overlay.foldPts = [];
    if (!doFold(pieceOf(doc, f.id), a, b, wp)) hooks.onStatus('그 선으로는 조각이 접히지 않습니다 (선이 조각을 지나야 합니다)');
    else hooks.onStatus('');
    return;
  }
  if (tool === 'text') {
    e.preventDefault();   /* mousedown 기본 동작(포커스 이동)으로 입력란이 바로 blur 되지 않게 */
    const f = topFacetAt(doc, wp);
    if (!f) return;
    const sp = apply(invert(f.xf), wp);
    const back = isBack(f);
    const u = Math.floor(sp[0] + 1e-9), r = Math.floor(sp[1] + 1e-9);
    if (u < 0 || u >= doc.w || r < 0 || r >= doc.h) return;
    const c = back ? doc.w - 1 - u : u;
    /* 칸 중심의 화면 위치 */
    const centerW = apply(f.xf, [u + 0.5, r + 0.5]);
    hooks.onTextCell(back ? 'back' : 'front', r, c, view ? toPx(view, centerW) : [0, 0]);
    return;
  }
  if (tool === 'inspect') {
    overlay.inspectPt = wp;
    hooks.onInspect(layersAt(doc, wp));
    scheduleDraw();
  }
}
function onMove(e: PointerEvent): void {
  const wp = workspacePt(e); if (!wp) return;
  overlay.hover = wp;
  const tool = craftState.tool;
  overlay.snap = (tool === 'cut' || (tool === 'fold' && overlay.foldPts.length < 2)) ? nearestSnap(snapPoints(craftState.doc), wp, SNAP_R) : null;
  if (drag && tool === 'select') {
    /* 0.5칸 단위로 스냅 (Alt 를 누르면 자유 이동) */
    let dx = wp[0] - drag.start[0], dy = wp[1] - drag.start[1];
    if (!e.altKey) { dx = Math.round(dx * 2) / 2; dy = Math.round(dy * 2) / 2; }
    if (dx !== drag.dx || dy !== drag.dy) {
      drag.dx = dx; drag.dy = dy; drag.moved = drag.moved || dx !== 0 || dy !== 0;
      craftState.doc = (dx === 0 && dy === 0) ? drag.startDoc : movePiece(drag.startDoc, drag.ids, dx, dy);
    }
  }
  scheduleDraw();
}
function onUp(e: PointerEvent): void {
  if (!drag) return;
  const d = drag; drag = null;
  try { canvas?.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
  if (d.moved && (d.dx !== 0 || d.dy !== 0)) commitMove(d.startDoc, craftState.doc, d.dx, d.dy);
  else { craftState.doc = d.startDoc; craftRender(); }
}
