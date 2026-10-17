/* 규칙 그래프 — 🔗 규칙 연결 모드: 셀에서 셀로 드래그해 규칙 만들기 + 우클릭 셀 메뉴 */
import { NS } from '../shared/dom';
import { uiState } from './ui-state';
import { graphCellCenter } from './edges';
import { graphOpenRuleMenu, graphOpenCellMenu } from './menus';

export function graphCellIdFromPoint(clientX: number, clientY: number): string | null {
  var el: Element | null = document.elementFromPoint(clientX, clientY);
  while (el && el !== document.body){
    if (el.getAttribute && el.getAttribute('data-cell-id')) return el.getAttribute('data-cell-id');
    el = (el.parentElement || el.parentNode) as Element | null;
  }
  return null;
}

export function graphInitConnect(): void {
  var wrap = document.getElementById('graph-canvas-wrap');
  if (!wrap) return;
  var drawing = false, srcCell: string | null = null, tempLine: SVGLineElement | null = null;

  function svgPt(svg: SVGSVGElement, clientX: number, clientY: number){
    var bb = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    return { x: (clientX - bb.left) * (vb.width / (bb.width || 1)), y: (clientY - bb.top) * (vb.height / (bb.height || 1)) };
  }
  wrap.addEventListener('pointerdown', function(e){
    if (!uiState.connectMode || e.button === 2) return;
    var cid = graphCellIdFromPoint(e.clientX, e.clientY);
    if (!cid) return;
    e.preventDefault(); e.stopPropagation();   /* 박스 드래그/편집기 방지 */
    var svg = wrap!.querySelector<SVGSVGElement>('svg.graph-canvas'); if (!svg) return;
    var c = graphCellCenter(cid); if (!c) return;
    drawing = true; srcCell = cid;
    tempLine = document.createElementNS(NS, 'line');
    tempLine.setAttribute('x1', String(c.x)); tempLine.setAttribute('y1', String(c.y));
    tempLine.setAttribute('x2', String(c.x)); tempLine.setAttribute('y2', String(c.y));
    tempLine.setAttribute('stroke', 'var(--accent)'); tempLine.setAttribute('stroke-width', '2.5');
    tempLine.setAttribute('stroke-dasharray', '5 4'); tempLine.setAttribute('pointer-events', 'none');
    svg.appendChild(tempLine);
  }, true);
  wrap.addEventListener('pointermove', function(e){
    if (!drawing || !tempLine) return;
    var svg = wrap!.querySelector<SVGSVGElement>('svg.graph-canvas'); if (!svg) return;
    var p = svgPt(svg, e.clientX, e.clientY);
    tempLine.setAttribute('x2', String(p.x)); tempLine.setAttribute('y2', String(p.y));
  }, true);
  function finish(e: PointerEvent){
    if (!drawing) return;
    drawing = false;
    if (tempLine && tempLine.parentNode) tempLine.parentNode.removeChild(tempLine);
    tempLine = null;
    var tgt = graphCellIdFromPoint(e.clientX, e.clientY);
    var src = srcCell; srcCell = null;
    if (tgt && src && tgt !== src) graphOpenRuleMenu(src, tgt, e.clientX, e.clientY);
  }
  wrap.addEventListener('pointerup', finish, true);
  wrap.addEventListener('pointercancel', function(){ drawing = false; if (tempLine && tempLine.parentNode) tempLine.parentNode.removeChild(tempLine); tempLine = null; srcCell = null; }, true);
  /* 우클릭(데스크톱) → 셀 컨텍스트 메뉴 (작은 글자만 토글). 셀 위에서만 기본 메뉴 차단 */
  wrap.addEventListener('contextmenu', function(e){
    var cid = graphCellIdFromPoint(e.clientX, e.clientY);
    if (cid){ e.preventDefault(); graphOpenCellMenu(cid, e.clientX, e.clientY); }
  });
}
