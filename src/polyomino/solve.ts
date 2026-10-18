/* 폴리오미노 — 답 탐색 패널: 현재 도면·피스로 모든 답을 찾아 앞뒤로 넘기고, 도면에 적용 */
import { polyState, polySaveState, boardOf, pushUndo } from './state';
import { computeCoverage, absCells, cellKey } from './model';
import type { Placement } from './model';
import { solve } from './solver';
import type { SolverPlacement } from './solver';
import { boardThumb, pieceColor } from './draw';
import { catalog, pieceByKey, polyUi, polyRender, symOpts } from './actions';

interface SolveView { solutions: SolverPlacement[][]; truncated: boolean; fixed: Placement[]; idx: number; w: number; h: number; holes: string[]; }
let view: SolveView | null = null;

function els() {
  return {
    btn: document.getElementById('poly-solve') as HTMLButtonElement | null,
    status: document.getElementById('poly-solve-status'),
    nav: document.getElementById('poly-solve-nav'),
    label: document.getElementById('poly-solve-label'),
    preview: document.getElementById('poly-solve-preview'),
    thumbs: document.getElementById('poly-solve-thumbs'),
  };
}

export function runSolve(): void {
  const e = els();
  const b = boardOf();
  const cov = computeCoverage(b, polyState.placements);
  if (cov.conflictIds.size) { if (e.status) e.status.textContent = '겹치거나 도면 밖에 걸린 피스가 있어 탐색할 수 없습니다. 먼저 정리해 주세요.'; return; }
  const fixed = polyState.placements.slice();
  const fixedCells = new Set<string>();
  for (const p of fixed) for (const [x, y] of absCells(p)) fixedCells.add(cellKey(x, y));
  const placedCount: Record<string, number> = {};
  for (const p of fixed) placedCount[p.key] = (placedCount[p.key] || 0) + 1;
  const pieces = catalog().filter(p => polyState.counts[p.key] !== undefined).map(p => {
    const c = polyState.counts[p.key];
    return { key: p.key, shape: p.shape, count: c === 'inf' ? 'inf' as const : Math.max(0, (c as number) - (placedCount[p.key] || 0)) };
  });
  if (e.status) e.status.textContent = '탐색 중…';
  if (e.btn) e.btn.disabled = true;
  const seq = ++polyUi.solveSeq;
  setTimeout(() => {
    const t0 = performance.now();
    const r = solve(b, pieces, { ...symOpts(), maxSolutions: 500, maxSteps: 3000000, fixedCells });
    const ms = Math.round(performance.now() - t0);
    if (seq !== polyUi.solveSeq) return;
    if (e.btn) e.btn.disabled = false;
    view = { solutions: r.solutions, truncated: r.truncated, fixed, idx: 0, w: b.w, h: b.h, holes: polyState.holes.slice() };
    if (e.status) {
      if (r.reason) e.status.textContent = '답 없음 — ' + r.reason;
      else if (!r.solutions.length) e.status.textContent = r.truncated ? '탐색 상한에 걸렸지만 답을 찾지 못했습니다 (' + ms + 'ms).' : '답이 없습니다 (' + ms + 'ms, ' + r.steps.toLocaleString() + '단계).';
      else e.status.textContent = '답 ' + r.solutions.length + (r.truncated ? '+' : '') + '가지' + (fixed.length ? ' (놓인 피스 ' + fixed.length + '개 고정)' : '') + ' · ' + ms + 'ms' + (r.truncated ? ' · 상한에서 중단했습니다' : ' · 전부 조사했습니다');
    }
    renderSolveView();
  }, 20);
}

export function renderSolveView(): void {
  const e = els();
  const nav = e.nav, preview = e.preview, thumbs = e.thumbs, label = e.label;
  if (!nav || !preview || !thumbs || !label) return;
  const v = view;
  const has = !!(v && v.solutions.length);
  nav.classList.toggle('hidden', !has);
  preview.innerHTML = ''; thumbs.innerHTML = '';
  if (!v || !has) return;
  if (v.idx >= v.solutions.length) v.idx = 0;
  label.innerHTML = '<b>' + (v.idx + 1) + '</b> / ' + v.solutions.length + (v.truncated ? '+' : '');
  const colorOf = (key: string) => { const p = pieceByKey(key); return p ? pieceColor(p.colorIdx) : '#bbb'; };
  const pieces = (sol: SolverPlacement[]) => [
    ...v.fixed.map(p => ({ cells: absCells(p), color: colorOf(p.key) })),
    ...sol.map(p => ({ cells: p.cells.map(([dx, dy]) => [p.x + dx, p.y + dy] as [number, number]), color: colorOf(p.key) })),
  ];
  const holes = new Set(v.holes);
  preview.appendChild(boardThumb(v.w, v.h, holes, pieces(v.solutions[v.idx]), Math.max(10, Math.min(26, Math.floor(360 / Math.max(v.w, v.h))))));
  const thumbPx = Math.max(3, Math.min(8, Math.floor(72 / Math.max(v.w, v.h))));
  v.solutions.slice(0, 60).forEach((sol, i) => {
    const t = document.createElement('div'); t.className = 'thumb' + (i === v.idx ? ' on' : '');
    t.appendChild(boardThumb(v.w, v.h, holes, pieces(sol), thumbPx));
    const n = document.createElement('span'); n.textContent = String(i + 1); t.appendChild(n);
    t.addEventListener('click', () => { v.idx = i; renderSolveView(); });
    thumbs.appendChild(t);
  });
  if (v.solutions.length > 60) { const more = document.createElement('span'); more.className = 'hint'; more.textContent = '… 썸네일은 60개까지. ◀ ▶ 로 나머지도 볼 수 있습니다.'; thumbs.appendChild(more); }
}

function applyCurrent(): void {
  const v = view; if (!v || !v.solutions.length) return;
  pushUndo();
  const sol = v.solutions[v.idx];
  for (const p of sol) polyState.placements.push({ id: polyState.nextPlacementId++, key: p.key, cells: p.cells, x: p.x, y: p.y });
  polySaveState(); polyRender();
}

export function initSolve(): void {
  const e = els();
  e.btn?.addEventListener('click', runSolve);
  document.getElementById('poly-solve-prev')?.addEventListener('click', () => { if (view && view.solutions.length) { view.idx = (view.idx - 1 + view.solutions.length) % view.solutions.length; renderSolveView(); } });
  document.getElementById('poly-solve-next')?.addEventListener('click', () => { if (view && view.solutions.length) { view.idx = (view.idx + 1) % view.solutions.length; renderSolveView(); } });
  document.getElementById('poly-solve-apply')?.addEventListener('click', applyCurrent);
}
/** 도면·피스가 바뀌면 이전 결과는 더 이상 맞지 않으므로 지운다 */
export function invalidateSolve(): void {
  if (!view) return;
  view = null;
  const e = els();
  if (e.status) e.status.textContent = '도면이나 피스가 바뀌었습니다. 「답 찾기」를 다시 누르세요.';
  renderSolveView();
}
