/* 공작 — 진입점: 탭 초기화 · 컨트롤 · 패널 렌더. 작업대 조작은 canvas.ts, 상태 변경은 actions.ts, 그리기는 render.ts */
import { bindNumericInput } from '../shared/inputs';
import { esc } from '../shared/dom';
import { askConfirm, notify } from '../shared/dialog';
import { craftState, craftLoadState, canUndo, canRedo, savePhoto, loadPhoto, sheetById, currentSheet, photoKey } from './state';
import type { Side, Tool } from './state';
import type { Layer } from './model';
import { isBack } from './model';
import { bbox } from './geom';
import { photos, paperColor, PALETTE_HUES } from './render';
import { initCanvas, redrawCanvas, cancelTool, finishCut, hasPendingCut, overlay, fitView } from './canvas';
import { setCraftRenderer, craftRender, craftUi, setTool, setFoldOver, setShowGrid, setShowBackThrough, setZoom, resize, resetSheet, isPristine, sheetIsPristine, pieceCount, setCurSheet, addNewSheet, removeCurrentSheet, sheetOfFacet, setSheetColor,
  nudge, rotateSelected, flipSelected, flipStackSelected, stashSelected, unstash, deleteStash, raiseSelected, lowerSelected, deleteSelected, doFlipAll, setCellText, setTextsBulk, textsToBulk, clearSteps, doUndo, doRedo } from './actions';

export { craftRender } from './actions';

let isActive: () => boolean = () => false;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const TOOL_HINT: Record<Tool, string> = {
  select: '조각을 누르면 선택, 끌면 0.5칸 단위로 이동(Alt 로 자유 이동). 선택 후 아래 도구나 R / Shift+R / F / Shift+F(겹친 것 함께) / S(보관함) / Delete / 화살표.',
  cut: '점을 눌러 선을 긋습니다(격자점·변 중점·칸 중심에 스냅). 마지막 점을 다시 누르거나 엔터로 자릅니다. 겹친 층은 한 번에 잘립니다.',
  fold: '접는 선의 두 점을 누른 뒤, 넘어갈 쪽의 조각을 누릅니다. 「넘어간 쪽」으로 위로 올릴지 아래로 넣을지 정합니다.',
  text: '칸을 누르면 글자를 적을 수 있습니다. 뒷면이 보이는 칸은 뒷면 글자로 저장됩니다.',
  inspect: '지점을 누르면 그 자리에 겹친 층을 위에서부터 보여줍니다.',
};

function renderAll(): void {
  const cur = currentSheet();
  const wIn = el<HTMLInputElement>('craft-w'), hIn = el<HTMLInputElement>('craft-h');
  if (wIn && document.activeElement !== wIn) wIn.value = String(cur.w);
  if (hIn && document.activeElement !== hIn) hIn.value = String(cur.h);
  document.querySelectorAll<HTMLButtonElement>('#craft-tool button').forEach(b => b.classList.toggle('on', b.dataset.tool === craftState.tool));
  const syncBtn = (id: string, on: boolean, label: string) => { const b = el(id); if (!b) return; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = label; };
  syncBtn('craft-fold-over', craftState.foldOver, '넘어간 쪽: ' + (craftState.foldOver ? '위로' : '아래로'));
  syncBtn('craft-grid', craftState.showGrid, '격자: ' + (craftState.showGrid ? '켬' : '끔'));
  syncBtn('craft-through', craftState.showBackThrough, '투시: ' + (craftState.showBackThrough ? '켬' : '끔'));
  const zl = el('craft-zoom-label'); if (zl) zl.textContent = String(craftState.zoom);
  const ub = el<HTMLButtonElement>('craft-undo'), rb = el<HTMLButtonElement>('craft-redo');
  if (ub) ub.disabled = !canUndo(); if (rb) rb.disabled = !canRedo();
  const rs = el<HTMLButtonElement>('craft-reset'); if (rs) rs.disabled = isPristine() && craftState.sheets.length <= 1;

  /* 상태 줄 · 힌트 */
  const st = el('craft-status');
  if (st) {
    const d = craftState.doc;
    const backs = d.facets.filter(isBack).length;
    const selSheet = craftUi.selected.length ? sheetOfFacet(craftUi.selected[0]) : null;
    st.innerHTML = (craftState.sheets.length > 1 ? '종이 <b>' + craftState.sheets.length + '</b>장 · ' : '') + '조각 <b>' + pieceCount() + '</b> · 면 <b>' + d.facets.length + '</b>' + (backs ? ' (뒷면 ' + backs + ')' : '') + ' · 자른 선 ' + d.cuts.length
      + (selSheet !== null && craftState.sheets.length > 1 ? ' · <b>종이 ' + selSheet + '</b>의 조각 선택' : '');
  }
  const hint = el('craft-hint'); if (hint) hint.textContent = TOOL_HINT[craftState.tool];

  /* 작업대 */
  redrawCanvas();
  const cellIn = el<HTMLInputElement>('craft-cell-input');
  if (cellIn && craftState.tool !== 'text') hideCellInput();

  /* 선택 조각 도구 · 자르기 도구 */
  el('craft-sel-tools')?.classList.toggle('hidden', !(craftState.tool === 'select' && craftUi.selected.length));
  el('craft-cut-tools')?.classList.toggle('hidden', !(craftState.tool === 'cut' && hasPendingCut()));
  if (craftState.tool !== 'inspect') { el('craft-inspect-wrap')?.classList.add('hidden'); overlay.inspectPt = null; }

  /* 보관함 */
  renderStash();

  /* 단계 목록 */
  const steps = el('craft-steps');
  if (steps) steps.innerHTML = craftState.steps.length ? craftState.steps.map(s => '<li>' + esc(s) + '</li>').join('') : '<li class="hint">아직 없음</li>';

  /* 오른쪽: 종이 목록 · 내용 */
  const list = el('craft-sheets');
  if (list) {
    list.innerHTML = craftState.sheets.map(sh => '<button type="button" data-sheet="' + sh.id + '" class="' + (sh.id === cur.id ? 'on' : '') + '" title="' + sh.w + '×' + sh.h + '">종이 ' + sh.id + '</button>').join('')
      + '<button type="button" data-add="1" title="현재 장과 같은 크기의 종이를 한 장 더 놓습니다">＋</button>';
  }
  const colors = el('craft-colors');
  if (colors) colors.innerHTML = PALETTE_HUES.map((_, i) => '<button type="button" data-color="' + i + '" class="craft-swatch' + (i === cur.color ? ' on' : '') + '" style="background:' + paperColor(i, 'front', false) + ';border-color:' + paperColor(i, 'back', false) + '" aria-label="색 ' + (i + 1) + '"></button>').join('');
  const rm = el<HTMLButtonElement>('craft-sheet-remove'); if (rm) rm.textContent = craftState.sheets.length > 1 ? '종이 ' + cur.id + ' 삭제' : '종이 삭제';
  const sideTitle = el('craft-content-title'); if (sideTitle) sideTitle.textContent = (craftState.sheets.length > 1 ? '종이 ' + cur.id + ' ' : '종이 ') + '내용';
  document.querySelectorAll<HTMLButtonElement>('#craft-side button').forEach(b => b.classList.toggle('on', b.dataset.side === craftUi.textSide));
  const bulk = el<HTMLTextAreaElement>('craft-bulk');
  if (bulk && document.activeElement !== bulk) bulk.value = textsToBulk(cur.id, craftUi.textSide);
  const info = el('craft-photo-info');
  if (info) { const p = cur.photo[craftUi.textSide]; info.textContent = p ? '사진 ' + p.w + '×' + p.h + ' px (격자 전체에 맞춤)' : '사진 없음'; }
  const pc = el<HTMLButtonElement>('craft-photo-clear'); if (pc) pc.disabled = !cur.photo[craftUi.textSide];
}

/* ---- 보관함 ---- */
function renderStash(): void {
  const wrap = el('craft-stash-wrap'), box = el('craft-stash');
  if (!wrap || !box) return;
  const items = craftState.stash;
  wrap.classList.toggle('hidden', !items.length);
  const cnt = el('craft-stash-count'); if (cnt) cnt.textContent = items.length ? '(' + items.length + ')' : '';
  box.innerHTML = '';
  for (const it of items) {
    const card = document.createElement('div'); card.className = 'craft-stash-card';
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 72; cv.className = 'craft-stash-thumb';
    drawThumb(cv, it.facets);
    const sheets = [...new Set(it.facets.map(f => f.sheet))].sort((a, b) => a - b);
    const info = document.createElement('div'); info.className = 'craft-stash-info';
    info.innerHTML = '<b>#' + it.id + '</b> <span class="hint">' + (craftState.sheets.length > 1 ? '종이 ' + sheets.join('·') + ' · ' : '') + '면 ' + it.facets.length + '</span>';
    const btns = document.createElement('div'); btns.className = 'craft-stash-btns';
    const out = document.createElement('button'); out.type = 'button'; out.className = 'btn'; out.textContent = '꺼내기'; out.title = '작업대 오른쪽 빈 자리에 맨 위층으로 놓습니다';
    out.addEventListener('click', () => { cancelTool(); setTool('select'); unstash(it.id); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn'; del.textContent = '삭제';
    del.addEventListener('click', () => { askConfirm('보관함 #' + it.id + ' 조각을 없앨까요? (되돌리기 가능)', { ok: '삭제' }).then(ok => { if (ok) deleteStash(it.id); }); });
    btns.appendChild(out); btns.appendChild(del);
    card.appendChild(cv); card.appendChild(info); card.appendChild(btns);
    box.appendChild(card);
  }
}
function drawThumb(cv: HTMLCanvasElement, facets: { poly: [number, number][]; xf: number[]; z: number }[]): void {
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const b = bbox(facets.map(f => f.poly));
  const w = Math.max(1e-6, b.maxX - b.minX), h = Math.max(1e-6, b.maxY - b.minY);
  const sc = Math.min((cv.width - 8) / w, (cv.height - 8) / h);
  const ox = (cv.width - w * sc) / 2 - b.minX * sc, oy = (cv.height - h * sc) / 2 - b.minY * sc;
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (const f of facets.slice().sort((x, y) => x.z - y.z)) {
    const back = f.xf[0] * f.xf[3] - f.xf[1] * f.xf[2] < 0;
    ctx.beginPath();
    f.poly.forEach((p, i) => { const x = p[0] * sc + ox, y = p[1] * sc + oy; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = back ? '#c9d0d6' : '#fff6cf'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
  }
}

/* ---- 글자 칸 입력 (캔버스 위 떠 있는 입력란) ---- */
let cellTarget: { sheet: number; side: Side; r: number; c: number } | null = null;
function showCellInput(sheet: number, side: Side, r: number, c: number, px: [number, number]): void {
  const input = el<HTMLInputElement>('craft-cell-input'), canvas = el<HTMLCanvasElement>('craft-canvas');
  const sh = sheetById(sheet);
  if (!input || !canvas || !sh) return;
  cellTarget = { sheet, side, r, c };
  const w = Math.max(44, craftState.zoom * 0.95);
  input.style.left = (canvas.offsetLeft + px[0] - w / 2) + 'px';
  input.style.top = (canvas.offsetTop + px[1] - 14) + 'px';
  input.style.width = w + 'px';
  input.value = sh.texts[side][r + ',' + c] || '';
  input.classList.remove('hidden');
  setTimeout(() => { if (cellTarget) { input.focus(); input.select(); } }, 0);
}
function hideCellInput(): void { const input = el<HTMLInputElement>('craft-cell-input'); if (input) input.classList.add('hidden'); cellTarget = null; }
function commitCellInput(): void {
  const input = el<HTMLInputElement>('craft-cell-input');
  if (!input || !cellTarget) return;
  const t = cellTarget; hideCellInput();
  setCellText(t.sheet, t.side, t.r, t.c, input.value.trim());
}

function renderInspect(layers: Layer[]): void {
  const wrap = el('craft-inspect-wrap'), box = el('craft-inspect');
  if (!wrap || !box) return;
  wrap.classList.remove('hidden');
  if (!layers.length) { box.innerHTML = '<p class="hint">그 자리에는 종이가 없습니다.</p>'; return; }
  const multi = craftState.sheets.length > 1;
  box.innerHTML = layers.map((l, i) => {
    const sh = sheetById(l.facet.sheet);
    const W = sh ? sh.w : 0;
    const u = Math.floor(l.sheetPt[0] + 1e-9), r = Math.floor(l.sheetPt[1] + 1e-9);
    const c = l.back ? W - 1 - u : u;
    const side: Side = l.back ? 'back' : 'front';
    const txt = sh ? sh.texts[side][r + ',' + c] : '';
    return '<div class="row"><span class="craft-layer-no">' + (i + 1) + (i === 0 ? '층 (맨 위)' : i === layers.length - 1 ? '층 (바닥)' : '층') + '</span>'
      + '<span class="craft-side ' + side + '">' + (l.back ? '뒷면' : '앞면') + '</span>'
      + '<span class="count" style="margin:0">' + (multi ? '종이 ' + l.facet.sheet + ' ' : '') + (r + 1) + '행 ' + (c + 1) + '열</span>'
      + (txt ? '<b>' + esc(txt) + '</b>' : '') + '</div>';
  }).join('');
}

/* ---- 사진 ---- */
function setPhotoImage(sheet: number, side: Side, dataUrl: string | null): Promise<void> {
  return new Promise(resolve => {
    const sh = sheetById(sheet); const key = photoKey(sheet, side);
    if (!dataUrl || !sh) { photos[key] = null; if (sh) sh.photo[side] = null; resolve(); return; }
    const img = new Image();
    img.onload = () => { photos[key] = img; sh.photo[side] = { w: img.naturalWidth, h: img.naturalHeight }; resolve(); };
    img.onerror = () => { photos[key] = null; sh.photo[side] = null; resolve(); };
    img.src = dataUrl;
  });
}
async function importPhoto(sheet: number, side: Side, file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('이미지를 읽을 수 없습니다')); img.src = url; });
  URL.revokeObjectURL(url);
  /* 큰 사진은 1600px 로 줄여 저장 (그리기·저장 용량) */
  const MAX = 1600;
  const sc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.naturalWidth * sc)); cv.height = Math.max(1, Math.round(img.naturalHeight * sc));
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
  const dataUrl = cv.toDataURL('image/jpeg', 0.88);
  await setPhotoImage(sheet, side, dataUrl);
  await savePhoto(photoKey(sheet, side), dataUrl);
}

export function craftInit(opts: { isActive: () => boolean }): void {
  isActive = opts.isActive;
  craftLoadState();
  setCraftRenderer(renderAll);
  const canvas = el<HTMLCanvasElement>('craft-canvas');
  if (canvas) initCanvas(canvas, {
    onStatus: msg => { const m = el('craft-toolmsg'); if (!m) return; m.textContent = msg; m.classList.toggle('hidden', !msg); el('craft-cut-tools')?.classList.toggle('hidden', !(craftState.tool === 'cut' && hasPendingCut())); },
    onTextCell: (sheet, side, r, c, px) => showCellInput(sheet, side, r, c, px),
    onInspect: renderInspect,
  });
  /* 저장된 사진 복원 */
  for (const sh of craftState.sheets) (['front', 'back'] as Side[]).forEach(side => {
    loadPhoto(photoKey(sh.id, side)).then(url => { if (url) setPhotoImage(sh.id, side, url).then(() => craftRender()); else if (sh.photo[side]) { sh.photo[side] = null; craftRender(); } });
  });

  /* 종이 크기 */
  const wIn = el<HTMLInputElement>('craft-w'), hIn = el<HTMLInputElement>('craft-h');
  const applySize = () => {
    if (!wIn || !hIn) return;
    const cur = currentSheet();
    const w = readW(), h = readH();
    if (w === cur.w && h === cur.h) return;
    const go = () => { cancelTool(); resize(w, h); };
    if (sheetIsPristine(cur.id)) { go(); return; }
    askConfirm((craftState.sheets.length > 1 ? '종이 ' + cur.id + '의 ' : '') + '크기를 바꾸면 그 종이의 자르기·접기가 초기화됩니다 (글자·사진은 유지, 되돌리기 가능). 계속할까요?')
      .then(ok => { if (ok) go(); else { wIn.value = String(cur.w); hIn.value = String(cur.h); } });
  };
  const readW = wIn ? bindNumericInput(wIn, { min: 1, max: 30, fallback: () => currentSheet().w, onCommit: applySize }) : () => currentSheet().w;
  const readH = hIn ? bindNumericInput(hIn, { min: 1, max: 30, fallback: () => currentSheet().h, onCommit: applySize }) : () => currentSheet().h;
  /* 종이 목록 */
  el('craft-sheets')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button'); if (!b) return;
    cancelTool();
    if (b.dataset.add) { addNewSheet(); return; }
    if (b.dataset.sheet) setCurSheet(Number(b.dataset.sheet));
  });
  el('craft-colors')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-color]'); if (!b) return;
    setSheetColor(currentSheet().id, Number(b.dataset.color));
  });
  el('craft-sheet-remove')?.addEventListener('click', () => {
    const cur = currentSheet();
    const msg = craftState.sheets.length > 1 ? '종이 ' + cur.id + '을(를) 조각·글자·사진까지 모두 지울까요? (되돌리기 가능)' : '마지막 한 장은 지울 수 없어 처음 상태로 되돌립니다. 계속할까요? (되돌리기 가능)';
    askConfirm(msg).then(ok => { if (ok) { cancelTool(); removeCurrentSheet(); } });
  });

  /* 도구·옵션 */
  el('craft-tool')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-tool]'); if (!b) return;
    cancelTool(); hideCellInput();
    setTool(b.dataset.tool as Tool);
  });
  el('craft-fold-over')?.addEventListener('click', () => setFoldOver(!craftState.foldOver));
  el('craft-grid')?.addEventListener('click', () => setShowGrid(!craftState.showGrid));
  el('craft-through')?.addEventListener('click', () => setShowBackThrough(!craftState.showBackThrough));
  el('craft-flip-all')?.addEventListener('click', () => { cancelTool(); doFlipAll(); });
  el('craft-zoom-out')?.addEventListener('click', () => { fitView(); setZoom(craftState.zoom - 8); });
  el('craft-zoom-in')?.addEventListener('click', () => { fitView(); setZoom(craftState.zoom + 8); });
  el('craft-fit')?.addEventListener('click', () => { fitView(); craftRender(); });
  el('craft-undo')?.addEventListener('click', () => { cancelTool(); doUndo(); });
  el('craft-redo')?.addEventListener('click', () => { cancelTool(); doRedo(); });
  el('craft-reset')?.addEventListener('click', () => { askConfirm('자르기·접기·이동을 모두 지우고 평평한 종이로 되돌릴까요? (글자·사진은 유지, 되돌리기 가능)').then(ok => { if (ok) { cancelTool(); fitView(); resetSheet(); } }); });

  /* 선택 조각 도구 */
  el('craft-rot-ccw')?.addEventListener('click', () => rotateSelected(-90));
  el('craft-rot-cw')?.addEventListener('click', () => rotateSelected(90));
  el('craft-rot-45')?.addEventListener('click', () => rotateSelected(45));
  el('craft-sel-flip')?.addEventListener('click', flipSelected);
  el('craft-sel-flip-stack')?.addEventListener('click', flipStackSelected);
  el('craft-sel-stash')?.addEventListener('click', stashSelected);
  el('craft-sel-raise')?.addEventListener('click', raiseSelected);
  el('craft-sel-lower')?.addEventListener('click', lowerSelected);
  el('craft-sel-delete')?.addEventListener('click', deleteSelected);
  el('craft-sel-clear')?.addEventListener('click', () => { craftUi.selected = []; craftRender(); });
  /* 자르기 도구 */
  el('craft-cut-done')?.addEventListener('click', finishCut);
  el('craft-cut-cancel')?.addEventListener('click', cancelTool);

  /* 글자 칸 입력 */
  const cellIn = el<HTMLInputElement>('craft-cell-input');
  cellIn?.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commitCellInput(); }
    else if (e.key === 'Escape') { e.preventDefault(); hideCellInput(); }
  });
  cellIn?.addEventListener('blur', () => { if (cellTarget) commitCellInput(); });

  /* 오른쪽 패널: 면 선택 · 사진 · 일괄 글자 */
  el('craft-side')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-side]'); if (!b) return;
    craftUi.textSide = b.dataset.side as Side; craftRender();
  });
  const photoIn = el<HTMLInputElement>('craft-photo');
  photoIn?.addEventListener('change', async () => {
    const f = photoIn.files && photoIn.files[0]; if (!f) return;
    try { await importPhoto(currentSheet().id, craftUi.textSide, f); } catch (err) { await notify(err instanceof Error ? err.message : String(err)); }
    photoIn.value = '';
    craftRender();
  });
  el('craft-photo-clear')?.addEventListener('click', async () => { const id = currentSheet().id; await setPhotoImage(id, craftUi.textSide, null); await savePhoto(photoKey(id, craftUi.textSide), null); craftRender(); });
  el('craft-bulk-apply')?.addEventListener('click', () => { const t = el<HTMLTextAreaElement>('craft-bulk'); if (t) setTextsBulk(currentSheet().id, craftUi.textSide, t.value); });
  el('craft-steps-clear')?.addEventListener('click', clearSteps);

  /* 키보드 */
  document.addEventListener('keydown', e => {
    if (!isActive()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); cancelTool(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); cancelTool(); doRedo(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelTool(); craftUi.selected = []; craftRender(); return; }
    if (e.key === 'Enter' && craftState.tool === 'cut') { e.preventDefault(); finishCut(); return; }
    if (craftState.tool !== 'select' || !craftUi.selected.length) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateSelected(e.shiftKey ? -90 : 90); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (e.shiftKey) flipStackSelected(); else flipSelected(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); stashSelected(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-0.5, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(0.5, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -0.5); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, 0.5); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (isActive()) craftRender(); });
  renderAll();
}
