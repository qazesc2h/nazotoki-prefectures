/* 폴리오미노 — 피스 드래그 컨트롤러 (트레이→도면, 도면 위 이동, 도면 밖으로 끌어 트레이 복귀).
   고스트는 도면 SVG 위에 직접 그린다. 포인터 이벤트 공용(마우스·터치). */
import { NS } from '../shared/dom';
import { boardGeom, cellAtClient } from './geom';
import { outlinePath, pieceColor } from './draw';
import { placePiece, movePlacement, removePlacement, selectPlacement, canPlaceHere, pieceByKey } from './actions';
import type { Shape } from './model';

export interface DragSpec {
  key: string; cells: Shape;
  grabDx: number; grabDy: number;   /* 피스 안에서 잡은 위치 (칸 단위, 소수) */
  fromId: number | null;            /* 도면 위 피스를 옮기는 중이면 그 id */
  startX: number; startY: number;   /* 포인터 시작 좌표 (임계값 판정) */
}
let active: DragSpec | null = null;
let moved = false;
let ghost: SVGGElement | null = null;
let lastOrigin: { x: number; y: number } | null = null;

function originFrom(clientX: number, clientY: number, spec: DragSpec): { x: number; y: number } | null {
  const c = cellAtClient(clientX, clientY);
  if (!c) return null;
  return { x: Math.round(c.fx - spec.grabDx - 0.5), y: Math.round(c.fy - spec.grabDy - 0.5) };
}
function pointerOverBoard(clientX: number, clientY: number): boolean {
  const svg = boardGeom.svg; if (!svg) return false;
  const bb = svg.getBoundingClientRect();
  return clientX >= bb.left && clientX <= bb.right && clientY >= bb.top && clientY <= bb.bottom;
}
function drawGhost(spec: DragSpec, x: number, y: number): void {
  const svg = boardGeom.svg; if (!svg) return;
  if (!ghost) { ghost = document.createElementNS(NS, 'g'); ghost.setAttribute('class', 'poly-ghost'); svg.appendChild(ghost); }
  ghost.innerHTML = '';
  const px = boardGeom.px, pad = boardGeom.pad;
  const p = pieceByKey(spec.key);
  const color = p ? pieceColor(p.colorIdx) : '#ccc';
  const bad = !canPlaceHere(spec.cells, x, y, spec.fromId);
  ghost.setAttribute('class', 'poly-ghost' + (bad ? ' bad' : ''));
  for (const [dx, dy] of spec.cells) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(pad + (x + dx) * px)); r.setAttribute('y', String(pad + (y + dy) * px));
    r.setAttribute('width', String(px)); r.setAttribute('height', String(px)); r.setAttribute('fill', color);
    ghost.appendChild(r);
  }
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', outlinePath(spec.cells, px, pad + x * px, pad + y * px));
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'rgba(0,0,0,.6)'); path.setAttribute('stroke-width', '2.5');
  ghost.appendChild(path);
  /* 옮기는 중인 원래 피스는 흐리게 */
  if (spec.fromId !== null) { const g = svg.querySelector('.poly-piece[data-id="' + spec.fromId + '"]'); if (g) g.classList.add('dragging'); }
}
export function clearGhost(): void { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); ghost = null; }

function onMove(e: PointerEvent): void {
  if (!active) return;
  if (!moved && Math.hypot(e.clientX - active.startX, e.clientY - active.startY) < 5) return;
  moved = true;
  e.preventDefault();
  const o = originFrom(e.clientX, e.clientY, active);
  if (!o) return;
  lastOrigin = o;
  if (pointerOverBoard(e.clientX, e.clientY)) drawGhost(active, o.x, o.y); else clearGhost();
}
function onUp(e: PointerEvent): void {
  if (!active) return;
  const spec = active; active = null;
  document.removeEventListener('pointermove', onMove, true);
  document.removeEventListener('pointerup', onUp, true);
  document.removeEventListener('pointercancel', onUp, true);
  clearGhost();
  if (!moved) { if (spec.fromId !== null) selectPlacement(spec.fromId); return; }   /* 이동 없는 탭 = 선택 */
  const over = pointerOverBoard(e.clientX, e.clientY);
  const o = originFrom(e.clientX, e.clientY, spec) || lastOrigin;
  if (spec.fromId !== null) {
    if (over && o) movePlacement(spec.fromId, o.x, o.y); else removePlacement(spec.fromId);
  } else if (over && o) {
    placePiece(spec.key, spec.cells, o.x, o.y);
  }
}

/** 드래그 시작 (pointerdown 핸들러에서 호출) */
export function startDrag(spec: DragSpec, e: PointerEvent): void {
  if (e.button !== undefined && e.button !== 0) return;
  active = spec; moved = false; lastOrigin = null;
  try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch (_) { /* 무시 */ }
  /* 캡처는 요소에 걸되 이벤트는 문서에서 받는다 (요소가 재렌더로 사라져도 끝까지 추적) */
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onUp, true);
}
export function isDragging(): boolean { return active !== null && moved; }
