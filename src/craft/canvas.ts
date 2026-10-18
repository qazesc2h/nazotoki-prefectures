/* 공작 — 작업대(캔버스) 포인터 조작: 선택·끌어 옮기기 / 자르기 점 찍기 / 접기 선·방향 / 글자 칸 / 층 검사 */
import { apply, invert } from './geom';
import type { Pt } from './geom';
import { topFacetAt, pieceOf, movePiece, snapPoints, nearestSnap, isBack, layersAt } from './model';
import type { Doc, Layer } from './model';
import { craftState, sheetById } from './state';
import type { Side } from './state';
import { drawCraft, fromPx, toPx, computeView, MARGIN } from './render';
import { docBounds } from './model';
import type { Overlay, View } from './render';
import { craftUi, doCut, doFold, commitMove, craftRender } from './actions';

export const overlay: Overlay = { selected: new Set(), cutPts: [], foldPts: [], hover: null, snap: null, inspectPt: null, showSnaps: false };
let canvas: HTMLCanvasElement | null = null;
let view: View | null = null;
let drag: { startDoc: Doc; start: Pt; ids: number[]; dx: number; dy: number; moved: boolean; view: View; rect: { left: number; top: number } } | null = null;
/* 원점은 한 번 넓어지면(왼쪽·위로) 줄이지 않는다 — 줄이면 화면이 밀려 끌던 조각이 튄다. fitView() 로만 다시 맞춘다 */
let sticky: { ox: number; oy: number; zoom: number } | null = null;
let raf = 0;
const SNAP_R = 0.32;

export interface CanvasHooks {
  onStatus(msg: string): void;                                  /* 도구 진행 안내 */
  onTextCell(sheet: number, side: Side, r: number, c: number, px: Pt): void;   /* 글자 도구: 칸을 눌렀을 때 */
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
/** 원점을 다시 종이 범위에 맞춤 (확대 변경·처음으로·맞춤 버튼) */
export function fitView(): void { sticky = null; }
function nextView(): View {
  const doc = craftState.doc;
  const v = computeView(doc, craftState.zoom);
  const stage = canvas ? canvas.parentElement : null;
  if (sticky && sticky.zoom === v.zoom) { v.ox = Math.min(v.ox, sticky.ox); v.oy = Math.min(v.oy, sticky.oy); }
  const b = docBounds(doc);
  v.cssW = Math.max(v.zoom, Math.ceil((b.maxX + MARGIN - v.ox) * v.zoom));
  v.cssH = Math.max(v.zoom, Math.ceil((b.maxY + MARGIN - v.oy) * v.zoom));
  /* 캔버스는 작업대(스크롤 영역)보다 작지 않게 — 그래야 왼쪽·위로 넓어질 때 스크롤로 보정할 수 있다 */
  if (stage) { v.cssW = Math.max(v.cssW, stage.clientWidth); v.cssH = Math.max(v.cssH, stage.clientHeight); }
  sticky = { ox: v.ox, oy: v.oy, zoom: v.zoom };
  return v;
}
export function redrawCanvas(): View | null {
  if (!canvas) return null;
  overlay.selected = new Set(craftUi.selected);
  overlay.showSnaps = craftState.tool === 'cut' || craftState.tool === 'fold';
  const prev = view;
  const v = nextView();
  view = drawCraft(canvas, overlay, v);
  if (drag && prev && prev.zoom === v.zoom) {
    /* 캔버스가 왼쪽·위로 자라면 캔버스 왼쪽 위가 화면에서 그만큼 이동한다 → 고정 좌표계의 기준점도 함께 옮긴다 */
    drag.rect.left -= (prev.ox - v.ox) * v.zoom; drag.rect.top -= (prev.oy - v.oy) * v.zoom;
    drag.view = { ...drag.view, ox: v.ox, oy: v.oy };
  }
  /* 원점이 왼쪽·위로 옮겨졌으면 그만큼 스크롤해 화면에 보이는 내용은 그대로 두기 */
  const stage = canvas.parentElement;
  if (stage && prev && prev.zoom === v.zoom) {
    const dx = (prev.ox - v.ox) * v.zoom, dy = (prev.oy - v.oy) * v.zoom;
    if (dx > 0.5) stage.scrollLeft += dx;
    if (dy > 0.5) stage.scrollTop += dy;
  }
  return view;
}
function scheduleDraw(): void { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; redrawCanvas(); }); }
export function currentView(): View | null { return view; }
export function workspacePt(e: PointerEvent | MouseEvent): Pt | null {
  if (!canvas || !view) return null;
  /* 끄는 동안은 시작 시점의 좌표계를 고정해 쓴다 (캔버스가 넓어져도 포인터→작업대 대응이 흔들리지 않게) */
  if (drag) return fromPx(drag.view, [e.clientX - drag.rect.left, e.clientY - drag.rect.top]);
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
    const r0 = canvas.getBoundingClientRect();
    drag = { startDoc: doc, start: wp, ids, dx: 0, dy: 0, moved: false, view: view!, rect: { left: r0.left, top: r0.top } };
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
    const sheet = sheetById(f.sheet); if (!sheet) return;
    const sp = apply(invert(f.xf), wp);
    const back = isBack(f);
    const u = Math.floor(sp[0] + 1e-9), r = Math.floor(sp[1] + 1e-9);
    if (u < 0 || u >= sheet.w || r < 0 || r >= sheet.h) return;
    const c = back ? sheet.w - 1 - u : u;
    /* 칸 중심의 화면 위치 */
    const centerW = apply(f.xf, [u + 0.5, r + 0.5]);
    hooks.onTextCell(f.sheet, back ? 'back' : 'front', r, c, view ? toPx(view, centerW) : [0, 0]);
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
