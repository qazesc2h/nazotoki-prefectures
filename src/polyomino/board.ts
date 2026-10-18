/* 폴리오미노 — 도면 SVG: 칸·구멍·글자·놓인 피스 그리기, 구멍 칠하기, 글자 입력, 피스 선택/드래그 시작 */
import { NS } from '../shared/dom';
import { polyState, boardOf, pushUndo } from './state';
import { computeCoverage, cellKey, isHole, inBoard, absCells } from './model';
import { boardGeom, cellAtClient } from './geom';
import { outlinePath, pieceColor } from './draw';
import { polyUi, pieceByKey, setHole, setLetter, selectPlacement, polyRender } from './actions';
import { startDrag } from './drag';
import { kataToHira } from '../shared/kana';

let painting: { on: boolean } | null = null;
let letterCell: { x: number; y: number } | null = null;

export function renderBoard(): void {
  const stage = document.getElementById('poly-board-stage');
  if (!stage) return;
  const b = boardOf();
  const cov = computeCoverage(b, polyState.placements);
  const pad = 6;
  const avail = stage.clientWidth > 0 ? stage.clientWidth : 600;
  const px = Math.max(16, Math.min(52, Math.floor((avail - pad * 2 - 2) / b.w)));
  boardGeom.px = px; boardGeom.pad = pad;
  const W = b.w * px + pad * 2, H = b.h * px + pad * 2;

  let svg = stage.querySelector<SVGSVGElement>('svg.poly-board');
  if (!svg) { svg = document.createElementNS(NS, 'svg'); stage.appendChild(svg); attachBoardEvents(svg); }   /* 리스너는 한 번만 */
  svg.setAttribute('class', 'poly-board mode-' + polyState.editMode);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
  svg.innerHTML = '';
  boardGeom.svg = svg;

  /* 칸 */
  const cellsG = document.createElementNS(NS, 'g');
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const k = cellKey(x, y);
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', 'poly-cell' + (isHole(b, x, y) ? ' hole' : '') + (cov.overlapCells.has(k) ? ' overlap' : ''));
    r.setAttribute('x', String(pad + x * px)); r.setAttribute('y', String(pad + y * px));
    r.setAttribute('width', String(px)); r.setAttribute('height', String(px));
    r.dataset.x = String(x); r.dataset.y = String(y);
    cellsG.appendChild(r);
  }
  svg.appendChild(cellsG);

  /* 놓인 피스 */
  const piecesG = document.createElementNS(NS, 'g');
  for (const p of polyState.placements) {
    const cat = pieceByKey(p.key);
    const color = cat ? pieceColor(cat.colorIdx) : '#bbb';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'poly-piece' + (polyUi.selectedId === p.id ? ' sel' : '') + (cov.conflictIds.has(p.id) ? ' conflict' : ''));
    g.dataset.id = String(p.id);
    const cells = absCells(p);
    for (const [x, y] of cells) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(pad + x * px)); r.setAttribute('y', String(pad + y * px));
      r.setAttribute('width', String(px)); r.setAttribute('height', String(px));
      r.setAttribute('fill', color); r.setAttribute('fill-opacity', polyState.coverLetters ? '1' : '0.78');
      g.appendChild(r);
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'outline');
    path.setAttribute('d', outlinePath(cells, px, pad, pad));
    g.appendChild(path);
    if (p.memo) {
      const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length + 0.5, cy = cells.reduce((a, c) => a + c[1], 0) / cells.length + 0.5;
      /* 무게중심이 피스 밖(ㄱ자 등)이면 가장 가까운 칸 중심으로 */
      let best = cells[0], bd = Infinity;
      for (const c of cells) { const d = Math.hypot(c[0] + 0.5 - cx, c[1] + 0.5 - cy); if (d < bd) { bd = d; best = c; } }
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(pad + (best[0] + 0.5) * px)); t.setAttribute('y', String(pad + (best[1] + 0.5) * px));
      t.setAttribute('font-size', String(Math.max(9, px * 0.42)));
      t.textContent = p.memo;
      g.appendChild(t);
    }
    g.addEventListener('pointerdown', e => {
      if (polyState.editMode !== 'place') return;
      e.preventDefault(); e.stopPropagation();
      const c = cellAtClient(e.clientX, e.clientY);
      if (!c) return;
      startDrag({ key: p.key, cells: p.cells, grabDx: c.fx - p.x - 0.5, grabDy: c.fy - p.y - 0.5, fromId: p.id, startX: e.clientX, startY: e.clientY }, e);
    });
    piecesG.appendChild(g);
  }
  svg.appendChild(piecesG);

  /* 글자 (피스 위에 — 가리기 옵션이면 덮인 글자는 숨김) */
  const lettersG = document.createElementNS(NS, 'g');
  for (const k of Object.keys(b.letters)) {
    const ch = b.letters[k]; if (!ch) continue;
    const [x, y] = k.split(',').map(Number);
    if (!inBoard(b, x, y)) continue;
    const covered = !!cov.count.get(k);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'poly-letter' + (polyState.coverLetters && covered ? ' hidden-by-piece' : ''));
    t.setAttribute('x', String(pad + (x + 0.5) * px)); t.setAttribute('y', String(pad + (y + 0.5) * px));
    t.setAttribute('font-size', String(Math.max(10, px * 0.5)));
    if (isHole(b, x, y)) t.setAttribute('fill', 'var(--bg)');
    t.textContent = ch;
    lettersG.appendChild(t);
  }
  svg.appendChild(lettersG);

  /* 글자 편집기가 열려 있으면 위치 갱신 */
  if (letterCell) positionLetterEditor();
}


/** 도면 SVG 포인터 처리 (SVG 생성 시 한 번만 등록 — 재렌더마다 겹쳐 붙지 않도록):
 *  구멍 칠하기(누르고 끌기, 끝날 때 한 번 재렌더) / 글자 입력 / 배치 모드에서 빈 곳 클릭 = 선택 해제 */
function attachBoardEvents(svg: SVGSVGElement): void {
  const paintCell = (x: number, y: number, on: boolean) => {
    if (!setHole(x, y, on, true)) return;
    const r = svg.querySelector<SVGRectElement>('.poly-cell[data-x="' + x + '"][data-y="' + y + '"]');
    if (r) r.classList.toggle('hole', on);
  };
  const endPaint = (e?: PointerEvent) => {
    if (!painting) return;
    painting = null;
    if (e && e.pointerId !== undefined) { try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* 무시 */ } }
    polyRender();   /* 커버리지·상태 줄 갱신 */
  };
  svg.addEventListener('pointerdown', e => {
    const b = boardOf();
    const c = cellAtClient(e.clientX, e.clientY);
    if (!c || !inBoard(b, c.x, c.y)) return;
    if (polyState.editMode === 'hole') {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      pushUndo();
      painting = { on: !isHole(b, c.x, c.y) };
      paintCell(c.x, c.y, painting.on);
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    } else if (polyState.editMode === 'letter') {
      e.preventDefault();
      openLetterEditor(c.x, c.y);
    } else if (polyUi.selectedId !== null) {
      selectPlacement(null);
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!painting) return;
    const c = cellAtClient(e.clientX, e.clientY);
    if (c && inBoard(boardOf(), c.x, c.y)) paintCell(c.x, c.y, painting.on);
  });
  svg.addEventListener('pointerup', endPaint);
  svg.addEventListener('pointercancel', endPaint);
  svg.addEventListener('lostpointercapture', () => endPaint());
}

/* ---- 글자 입력 (떠 있는 한 글자 입력창, 규칙 그래프 셀 편집기와 같은 방식) ---- */
function editorEl(): HTMLInputElement {
  let ed = document.getElementById('poly-letter-editor') as HTMLInputElement | null;
  if (ed) return ed;
  ed = document.createElement('input');
  ed.type = 'text'; ed.id = 'poly-letter-editor'; ed.maxLength = 8;
  ed.setAttribute('autocomplete', 'off'); ed.setAttribute('autocapitalize', 'off'); ed.setAttribute('spellcheck', 'false');
  ed.setAttribute('aria-label', '칸 글자');
  Object.assign(ed.style, { position: 'fixed', zIndex: '9999', textAlign: 'center', fontFamily: 'var(--jp)', fontSize: '18px', padding: '0', border: '2.5px solid var(--accent)', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', outline: 'none', display: 'none', boxShadow: '0 2px 12px rgba(0,0,0,.22)' });
  document.body.appendChild(ed);
  let composing = false;
  ed.addEventListener('compositionstart', () => { composing = true; });
  ed.addEventListener('compositionend', () => { composing = false; commit(); });
  ed.addEventListener('input', (e) => { if (!(composing || (e as InputEvent).isComposing)) commit(); });
  ed.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLetterEditor(); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); commit(); step(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); commit(); step(-1, 0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); commit(); step(0, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commit(); step(0, -1); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { if (!ed!.value) { e.preventDefault(); if (letterCell) setLetter(letterCell.x, letterCell.y, ''); } }
  });
  ed.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== ed) closeLetterEditor(); }, 0); });
  function commit(): void {
    if (!letterCell) return;
    const v = Array.from(kataToHira(ed!.value.trim())).slice(-1)[0] || '';
    setLetter(letterCell.x, letterCell.y, v);
    ed!.value = v;
  }
  function step(dx: number, dy: number): void {
    if (!letterCell) return;
    const b = boardOf();
    let x = letterCell.x + dx, y = letterCell.y + dy;
    if (x >= b.w) { x = 0; y++; } if (x < 0) { x = b.w - 1; y--; }
    if (y < 0 || y >= b.h) { closeLetterEditor(); return; }
    openLetterEditor(x, y);
  }
  return ed;
}
export function openLetterEditor(x: number, y: number): void {
  letterCell = { x, y };
  const ed = editorEl();
  ed.value = polyState.letters[cellKey(x, y)] || '';
  positionLetterEditor();
  ed.style.display = 'block';
  try { ed.focus(); ed.select(); } catch (_) { /* 무시 */ }
}
function positionLetterEditor(): void {
  if (!letterCell || !boardGeom.svg) return;
  const ed = editorEl();
  const bb = boardGeom.svg.getBoundingClientRect();
  const vb = boardGeom.svg.viewBox.baseVal;
  const sx = (bb.width || 1) / vb.width, sy = (bb.height || 1) / vb.height;
  const size = Math.max(28, Math.min(44, boardGeom.px * sx));
  const cx = bb.left + (boardGeom.pad + (letterCell.x + 0.5) * boardGeom.px) * sx;
  const cy = bb.top + (boardGeom.pad + (letterCell.y + 0.5) * boardGeom.px) * sy;
  ed.style.width = size + 'px'; ed.style.height = size + 'px';
  ed.style.left = Math.max(4, Math.min(cx - size / 2, window.innerWidth - size - 4)) + 'px';
  ed.style.top = Math.max(4, Math.min(cy - size / 2, window.innerHeight - size - 4)) + 'px';
}
export function closeLetterEditor(): void {
  letterCell = null;
  const ed = document.getElementById('poly-letter-editor');
  if (ed) ed.style.display = 'none';
}
