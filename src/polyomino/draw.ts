/* 폴리오미노 — 그리기 헬퍼: 피스 색, 작은 피스 SVG(카드·썸네일), 외곽선 path */
import { svgEl } from '../shared/dom';
import type { Cell, Shape } from './model';

/** 피스 종류별 고정 파스텔 색 (참고 도구와 비슷한 톤, 라이트·다크 공통) */
export const PALETTE = ['#f4a3a3', '#f7d08a', '#a9e0a0', '#9fd8e8', '#b9b3f2', '#f3b6dc', '#c9e38a', '#ffc69e', '#8fd4c8', '#d6bfa8', '#e6c6ff', '#c7d2f5'];
export function pieceColor(idx: number): string { return PALETTE[((idx % PALETTE.length) + PALETTE.length) % PALETTE.length]; }

/** 칸 집합의 바깥 테두리 path (피스 안쪽 격자선은 그리지 않음) */
export function outlinePath(cells: Cell[], px: number, ox = 0, oy = 0): string {
  const set = new Set(cells.map(c => c[0] + ',' + c[1]));
  const segs: string[] = [];
  for (const [x, y] of cells) {
    const X = ox + x * px, Y = oy + y * px;
    if (!set.has(x + ',' + (y - 1))) segs.push('M' + X + ' ' + Y + 'h' + px);
    if (!set.has(x + ',' + (y + 1))) segs.push('M' + X + ' ' + (Y + px) + 'h' + px);
    if (!set.has((x - 1) + ',' + y)) segs.push('M' + X + ' ' + Y + 'v' + px);
    if (!set.has((x + 1) + ',' + y)) segs.push('M' + (X + px) + ' ' + Y + 'v' + px);
  }
  return segs.join('');
}

/** 피스 하나를 그린 작은 SVG (카드·썸네일용) */
export function shapeSvg(shape: Shape, color: string, px: number, label?: string): SVGSVGElement {
  let w = 0, h = 0; for (const [x, y] of shape) { if (x + 1 > w) w = x + 1; if (y + 1 > h) h = y + 1; }
  const svg = svgEl('svg', { width: w * px + 2, height: h * px + 2, viewBox: '-1 -1 ' + (w * px + 2) + ' ' + (h * px + 2) });
  for (const [x, y] of shape) svg.appendChild(svgEl('rect', { x: x * px, y: y * px, width: px, height: px, fill: color, stroke: 'rgba(0,0,0,.18)', 'stroke-width': 1 }));
  svg.appendChild(svgEl('path', { d: outlinePath(shape, px), fill: 'none', stroke: 'rgba(0,0,0,.55)', 'stroke-width': Math.max(1.2, px * 0.09), 'stroke-linejoin': 'round' }));
  if (label) {
    const t = svgEl('text', { x: (w * px) / 2, y: (h * px) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': Math.max(9, px * 0.55), 'font-weight': '700', fill: 'rgba(0,0,0,.7)', 'font-family': 'var(--jp)' });
    t.textContent = label; svg.appendChild(t);
  }
  return svg;
}

/** 도면 전체 썸네일 (답 미리보기·목록) */
export function boardThumb(w: number, h: number, holes: Set<string>, pieces: { cells: Cell[]; color: string }[], px: number): SVGSVGElement {
  const svg = svgEl('svg', { width: w * px + 2, height: h * px + 2, viewBox: '-1 -1 ' + (w * px + 2) + ' ' + (h * px + 2) });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    svg.appendChild(svgEl('rect', { x: x * px, y: y * px, width: px, height: px, fill: holes.has(x + ',' + y) ? 'var(--text)' : 'var(--panel)', stroke: 'var(--border)', 'stroke-width': 0.6 }));
  }
  for (const p of pieces) {
    for (const [x, y] of p.cells) svg.appendChild(svgEl('rect', { x: x * px, y: y * px, width: px, height: px, fill: p.color }));
    svg.appendChild(svgEl('path', { d: outlinePath(p.cells, px), fill: 'none', stroke: 'rgba(0,0,0,.55)', 'stroke-width': Math.max(0.8, px * 0.08), 'stroke-linejoin': 'round' }));
  }
  return svg;
}
