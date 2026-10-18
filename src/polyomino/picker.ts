/* 폴리오미노 — 피스 선택 패널 (크기 탭 · 피스 카드 −/＋/∞ · 자작 피스 그리기/저장/삭제) */
import { polyState, polySaveState } from './state';
import { askConfirm, notify } from '../shared/dialog';
import { shapeSvg, pieceColor } from './draw';
import { catalog, bumpCount, toggleInf, setAllOfSize, addCustom, removeCustom, polyRender, isPickerVisible, setCubeNetsOnly } from './actions';
import { normalize, isConnected, shapeSize } from './model';
import type { Cell } from './model';

const CARD_PX = 12;
/* 자작 피스 편집 중인 칸 (저장 전, 저장하지 않음) */
let drawn = new Set<string>();
let paint: boolean | null = null;

export function renderPicker(): void {
  const tabs = document.getElementById('poly-size-tabs');
  const wrap = document.getElementById('poly-picker');
  const custom = document.getElementById('poly-custom');
  if (!tabs || !wrap || !custom) return;
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === polyState.sizeTab));
  const isCustom = polyState.sizeTab === 0;
  custom.classList.toggle('hidden', !isCustom);
  wrap.classList.toggle('hidden', isCustom);
  wrap.innerHTML = '';
  const filt = document.getElementById('poly-cube-filter') as HTMLElement | null;
  const filtCb = document.getElementById('poly-cube-only') as HTMLInputElement | null;
  if (filt) filt.classList.toggle('hidden', polyState.sizeTab !== 6);
  if (filtCb) filtCb.checked = polyState.cubeNetsOnly;
  if (!isCustom) {
    for (const p of catalog()) {
      if (!isPickerVisible(p, polyState.sizeTab)) continue;
      wrap.appendChild(pieceCard(p.key, p.name + (p.cubeNet ? ' 🎲' : ''), p.shape, pieceColor(p.colorIdx)));
    }
  } else {
    renderCustomEditor();
  }
}

function pieceCard(key: string, name: string, shape: Cell[], color: string, onDelete?: () => void): HTMLDivElement {
  const c = polyState.counts[key];
  const card = document.createElement('div');
  card.className = 'poly-card' + (c ? ' has' : '');
  card.dataset.key = key;
  card.appendChild(shapeSvg(normalize(shape), color, CARD_PX));
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name; card.appendChild(nm);
  const cnt = document.createElement('div'); cnt.className = 'cnt';
  const minus = document.createElement('button'); minus.type = 'button'; minus.className = 'btn'; minus.textContent = '−'; minus.setAttribute('aria-label', name + ' 1개 줄이기');
  minus.addEventListener('click', () => bumpCount(key, -1));
  const num = document.createElement('b'); num.textContent = c === 'inf' ? '∞' : String(c || 0);
  const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'btn'; plus.textContent = '＋'; plus.setAttribute('aria-label', name + ' 1개 늘리기');
  plus.addEventListener('click', () => bumpCount(key, 1));
  cnt.appendChild(minus); cnt.appendChild(num); cnt.appendChild(plus);
  card.appendChild(cnt);
  const inf = document.createElement('label'); inf.className = 'inf';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c === 'inf';
  cb.addEventListener('change', () => toggleInf(key));
  inf.appendChild(cb); inf.appendChild(document.createTextNode('제한 없음'));
  card.appendChild(inf);
  if (onDelete) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn'; del.textContent = '삭제'; del.style.cssText = 'font-size:11px; padding:1px 7px';
    del.addEventListener('click', onDelete);
    card.appendChild(del);
  }
  return card;
}

function renderCustomEditor(): void {
  const grid = document.getElementById('poly-custom-grid');
  const sizeEl = document.getElementById('poly-custom-size'), sizeEl2 = document.getElementById('poly-custom-size2');
  const list = document.getElementById('poly-custom-list');
  if (!grid || !list) return;
  const n = polyState.customGrid;
  if (sizeEl) sizeEl.textContent = String(n); if (sizeEl2) sizeEl2.textContent = String(n);
  /* 패널 폭에 맞춰 칸 크기 결정 (최대 22px) — 20×20 도 패널을 넘지 않게 */
  const avail = (grid.parentElement ? grid.parentElement.clientWidth : 0) || 276;
  const cellPx = Math.max(8, Math.min(22, Math.floor((avail - (n - 1)) / n)));
  grid.style.gridTemplateColumns = 'repeat(' + n + ', ' + cellPx + 'px)';
  grid.style.width = (cellPx * n + (n - 1)) + 'px';
  grid.innerHTML = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const b = document.createElement('button'); b.type = 'button';
    b.dataset.x = String(x); b.dataset.y = String(y);
    b.setAttribute('aria-label', (x + 1) + '열 ' + (y + 1) + '행');
    if (drawn.has(x + ',' + y)) b.classList.add('on');
    grid.appendChild(b);
  }
  list.innerHTML = '';
  for (const p of catalog()) {
    if (!p.custom) continue;
    const id = Number(p.key.slice(2));
    list.appendChild(pieceCard(p.key, p.name, p.shape, pieceColor(p.colorIdx), () => { askConfirm('자작 피스 「' + p.name + '」를 삭제할까요? 놓인 것도 함께 사라집니다.', { ok: '삭제' }).then(ok => { if (ok) removeCustom(id); }); }));
  }
}

function cellOf(e: PointerEvent): { x: number; y: number } | null {
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  const b = el && el.closest<HTMLElement>('#poly-custom-grid button');
  if (!b) return null;
  return { x: Number(b.dataset.x), y: Number(b.dataset.y) };
}
function setDrawn(x: number, y: number, on: boolean): void {
  const k = x + ',' + y;
  if (on) drawn.add(k); else drawn.delete(k);
  const b = document.querySelector<HTMLButtonElement>('#poly-custom-grid button[data-x="' + x + '"][data-y="' + y + '"]');
  if (b) b.classList.toggle('on', on);
}

/** 한 번만 호출: 자작 편집기 이벤트 */
export function initPicker(): void {
  const tabs = document.getElementById('poly-size-tabs');
  tabs?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-size]'); if (!b) return;
    polyState.sizeTab = Number(b.dataset.size); polySaveState(); polyRender();
  });
  document.getElementById('poly-all-one')?.addEventListener('click', () => setAllOfSize(polyState.sizeTab, 1));
  document.getElementById('poly-cube-only')?.addEventListener('change', e => setCubeNetsOnly((e.target as HTMLInputElement).checked));
  document.getElementById('poly-size-zero')?.addEventListener('click', () => setAllOfSize(polyState.sizeTab, 0));

  const grid = document.getElementById('poly-custom-grid');
  grid?.addEventListener('pointerdown', e => {
    const c = cellOf(e); if (!c) return;
    e.preventDefault();
    paint = !drawn.has(c.x + ',' + c.y);
    setDrawn(c.x, c.y, paint);
    try { grid.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  });
  grid?.addEventListener('pointermove', e => { if (paint === null) return; const c = cellOf(e); if (c) setDrawn(c.x, c.y, paint); });
  const end = () => { paint = null; };
  grid?.addEventListener('pointerup', end); grid?.addEventListener('pointercancel', end);

  document.getElementById('poly-custom-clear')?.addEventListener('click', () => { drawn = new Set(); renderCustomEditor(); });
  document.getElementById('poly-custom-save')?.addEventListener('click', () => {
    const cells = [...drawn].map(k => k.split(',').map(Number) as Cell);
    const shape = normalize(cells);
    if (!shape.length) { notify('칸을 하나 이상 칠하세요.'); return; }
    if (!isConnected(shape)) { notify('칸이 변으로 모두 이어져 있어야 합니다.'); return; }
    const { w, h } = shapeSize(shape);
    const rows: string[] = [];
    for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += shape.some(c => c[0] === x && c[1] === y) ? '#' : '.'; rows.push(r); }
    addCustom(rows.join('/'));
    drawn = new Set();
    renderCustomEditor();
  });
  const resizeGrid = (d: number) => {
    const n = Math.max(10, Math.min(20, polyState.customGrid + d));
    if (n === polyState.customGrid) return;
    polyState.customGrid = n;
    drawn = new Set([...drawn].filter(k => { const [x, y] = k.split(',').map(Number); return x < n && y < n; }));
    polySaveState(); renderCustomEditor();
  };
  document.getElementById('poly-custom-smaller')?.addEventListener('click', () => resizeGrid(-2));
  document.getElementById('poly-custom-larger')?.addEventListener('click', () => resizeGrid(2));
}
