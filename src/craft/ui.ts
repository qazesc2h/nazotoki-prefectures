/* 공작 — 진입점: 탭 초기화 · 컨트롤 · 패널 렌더. 작업대 조작은 canvas.ts, 상태 변경은 actions.ts, 그리기는 render.ts */
import { bindNumericInput } from '../shared/inputs';
import { esc } from '../shared/dom';
import { craftState, craftLoadState, canUndo, canRedo, savePhoto, loadPhoto } from './state';
import type { Side, Tool } from './state';
import type { Layer } from './model';
import { isBack } from './model';
import { photos } from './render';
import { initCanvas, redrawCanvas, cancelTool, finishCut, hasPendingCut, overlay } from './canvas';
import { setCraftRenderer, craftRender, craftUi, setTool, setFoldOver, setShowGrid, setShowBackThrough, setZoom, resize, resetSheet, isPristine, pieceCount,
  nudge, rotateSelected, flipSelected, raiseSelected, lowerSelected, deleteSelected, doFlipAll, setCellText, setTextsBulk, textsToBulk, clearSteps, doUndo, doRedo } from './actions';

export { craftRender } from './actions';

let isActive: () => boolean = () => false;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const TOOL_HINT: Record<Tool, string> = {
  select: '조각을 누르면 선택, 끌면 0.5칸 단위로 이동(Alt 로 자유 이동). 선택 후 아래 도구나 R / Shift+R / F / Delete / 화살표.',
  cut: '점을 눌러 선을 긋습니다(격자점·변 중점·칸 중심에 스냅). 마지막 점을 다시 누르거나 엔터로 자릅니다. 겹친 층은 한 번에 잘립니다.',
  fold: '접는 선의 두 점을 누른 뒤, 넘어갈 쪽의 조각을 누릅니다. 「넘어간 쪽」으로 위로 올릴지 아래로 넣을지 정합니다.',
  text: '칸을 누르면 글자를 적을 수 있습니다. 뒷면이 보이는 칸은 뒷면 글자로 저장됩니다.',
  inspect: '지점을 누르면 그 자리에 겹친 층을 위에서부터 보여줍니다.',
};

function renderAll(): void {
  const wIn = el<HTMLInputElement>('craft-w'), hIn = el<HTMLInputElement>('craft-h');
  if (wIn && document.activeElement !== wIn) wIn.value = String(craftState.w);
  if (hIn && document.activeElement !== hIn) hIn.value = String(craftState.h);
  document.querySelectorAll<HTMLButtonElement>('#craft-tool button').forEach(b => b.classList.toggle('on', b.dataset.tool === craftState.tool));
  const syncBtn = (id: string, on: boolean, label: string) => { const b = el(id); if (!b) return; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = label; };
  syncBtn('craft-fold-over', craftState.foldOver, '넘어간 쪽: ' + (craftState.foldOver ? '위로' : '아래로'));
  syncBtn('craft-grid', craftState.showGrid, '격자: ' + (craftState.showGrid ? '켬' : '끔'));
  syncBtn('craft-through', craftState.showBackThrough, '투시: ' + (craftState.showBackThrough ? '켬' : '끔'));
  const zl = el('craft-zoom-label'); if (zl) zl.textContent = String(craftState.zoom);
  const ub = el<HTMLButtonElement>('craft-undo'), rb = el<HTMLButtonElement>('craft-redo');
  if (ub) ub.disabled = !canUndo(); if (rb) rb.disabled = !canRedo();
  const rs = el<HTMLButtonElement>('craft-reset'); if (rs) rs.disabled = isPristine();

  /* 상태 줄 · 힌트 */
  const st = el('craft-status');
  if (st) {
    const d = craftState.doc;
    const backs = d.facets.filter(isBack).length;
    st.innerHTML = '조각 <b>' + pieceCount() + '</b> · 면 <b>' + d.facets.length + '</b>' + (backs ? ' (뒷면 ' + backs + ')' : '') + ' · 자른 선 ' + d.cuts.length;
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

  /* 단계 목록 */
  const steps = el('craft-steps');
  if (steps) steps.innerHTML = craftState.steps.length ? craftState.steps.map(s => '<li>' + esc(s) + '</li>').join('') : '<li class="hint">아직 없음</li>';

  /* 오른쪽: 종이 내용 */
  document.querySelectorAll<HTMLButtonElement>('#craft-side button').forEach(b => b.classList.toggle('on', b.dataset.side === craftUi.textSide));
  const bulk = el<HTMLTextAreaElement>('craft-bulk');
  if (bulk && document.activeElement !== bulk) bulk.value = textsToBulk(craftUi.textSide);
  const info = el('craft-photo-info');
  if (info) { const p = craftState.photo[craftUi.textSide]; info.textContent = p ? '사진 ' + p.w + '×' + p.h + ' px (격자 전체에 맞춤)' : '사진 없음'; }
  const pc = el<HTMLButtonElement>('craft-photo-clear'); if (pc) pc.disabled = !craftState.photo[craftUi.textSide];
}

/* ---- 글자 칸 입력 (캔버스 위 떠 있는 입력란) ---- */
let cellTarget: { side: Side; r: number; c: number } | null = null;
function showCellInput(side: Side, r: number, c: number, px: [number, number]): void {
  const input = el<HTMLInputElement>('craft-cell-input'), canvas = el<HTMLCanvasElement>('craft-canvas');
  if (!input || !canvas) return;
  cellTarget = { side, r, c };
  const w = Math.max(44, craftState.zoom * 0.95);
  input.style.left = (canvas.offsetLeft + px[0] - w / 2) + 'px';
  input.style.top = (canvas.offsetTop + px[1] - 14) + 'px';
  input.style.width = w + 'px';
  input.value = craftState.texts[side][r + ',' + c] || '';
  input.classList.remove('hidden');
  setTimeout(() => { if (cellTarget) { input.focus(); input.select(); } }, 0);
}
function hideCellInput(): void { const input = el<HTMLInputElement>('craft-cell-input'); if (input) input.classList.add('hidden'); cellTarget = null; }
function commitCellInput(): void {
  const input = el<HTMLInputElement>('craft-cell-input');
  if (!input || !cellTarget) return;
  const t = cellTarget; hideCellInput();
  setCellText(t.side, t.r, t.c, input.value.trim());
}

function renderInspect(layers: Layer[]): void {
  const wrap = el('craft-inspect-wrap'), box = el('craft-inspect');
  if (!wrap || !box) return;
  wrap.classList.remove('hidden');
  if (!layers.length) { box.innerHTML = '<p class="hint">그 자리에는 종이가 없습니다.</p>'; return; }
  const W = craftState.doc.w;
  box.innerHTML = layers.map((l, i) => {
    const u = Math.floor(l.sheetPt[0] + 1e-9), r = Math.floor(l.sheetPt[1] + 1e-9);
    const c = l.back ? W - 1 - u : u;
    const side: Side = l.back ? 'back' : 'front';
    const txt = craftState.texts[side][r + ',' + c];
    return '<div class="row"><span class="craft-layer-no">' + (i + 1) + (i === 0 ? '층 (맨 위)' : i === layers.length - 1 ? '층 (바닥)' : '층') + '</span>'
      + '<span class="craft-side ' + side + '">' + (l.back ? '뒷면' : '앞면') + '</span>'
      + '<span class="count" style="margin:0">' + (l.back ? '뒷면' : '앞면') + ' ' + (r + 1) + '행 ' + (c + 1) + '열</span>'
      + (txt ? '<b>' + esc(txt) + '</b>' : '') + '</div>';
  }).join('');
}

/* ---- 사진 ---- */
function setPhotoImage(side: Side, dataUrl: string | null): Promise<void> {
  return new Promise(resolve => {
    if (!dataUrl) { photos[side] = null; craftState.photo[side] = null; resolve(); return; }
    const img = new Image();
    img.onload = () => { photos[side] = img; craftState.photo[side] = { w: img.naturalWidth, h: img.naturalHeight }; resolve(); };
    img.onerror = () => { photos[side] = null; craftState.photo[side] = null; resolve(); };
    img.src = dataUrl;
  });
}
async function importPhoto(side: Side, file: File): Promise<void> {
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
  await setPhotoImage(side, dataUrl);
  await savePhoto(side, dataUrl);
}

export function craftInit(opts: { isActive: () => boolean }): void {
  isActive = opts.isActive;
  craftLoadState();
  setCraftRenderer(renderAll);
  const canvas = el<HTMLCanvasElement>('craft-canvas');
  if (canvas) initCanvas(canvas, {
    onStatus: msg => { const m = el('craft-toolmsg'); if (!m) return; m.textContent = msg; m.classList.toggle('hidden', !msg); el('craft-cut-tools')?.classList.toggle('hidden', !(craftState.tool === 'cut' && hasPendingCut())); },
    onTextCell: (side, r, c, px) => showCellInput(side, r, c, px),
    onInspect: renderInspect,
  });
  /* 저장된 사진 복원 */
  (['front', 'back'] as Side[]).forEach(side => { loadPhoto(side).then(url => { if (url) setPhotoImage(side, url).then(() => craftRender()); else if (craftState.photo[side]) { craftState.photo[side] = null; craftRender(); } }); });

  /* 종이 크기 */
  const wIn = el<HTMLInputElement>('craft-w'), hIn = el<HTMLInputElement>('craft-h');
  const applySize = () => {
    if (!wIn || !hIn) return;
    const w = readW(), h = readH();
    if ((w !== craftState.w || h !== craftState.h) && !isPristine() && !confirm('종이 크기를 바꾸면 자르기·접기·이동이 초기화됩니다 (글자·사진은 유지, 되돌리기 가능). 계속할까요?')) { wIn.value = String(craftState.w); hIn.value = String(craftState.h); return; }
    cancelTool(); resize(w, h);
  };
  const readW = wIn ? bindNumericInput(wIn, { min: 1, max: 30, fallback: () => craftState.w, onCommit: applySize }) : () => craftState.w;
  const readH = hIn ? bindNumericInput(hIn, { min: 1, max: 30, fallback: () => craftState.h, onCommit: applySize }) : () => craftState.h;

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
  el('craft-zoom-out')?.addEventListener('click', () => setZoom(craftState.zoom - 8));
  el('craft-zoom-in')?.addEventListener('click', () => setZoom(craftState.zoom + 8));
  el('craft-undo')?.addEventListener('click', () => { cancelTool(); doUndo(); });
  el('craft-redo')?.addEventListener('click', () => { cancelTool(); doRedo(); });
  el('craft-reset')?.addEventListener('click', () => { if (confirm('자르기·접기·이동을 모두 지우고 평평한 종이로 되돌릴까요? (글자·사진은 유지, 되돌리기 가능)')) { cancelTool(); resetSheet(); } });

  /* 선택 조각 도구 */
  el('craft-rot-ccw')?.addEventListener('click', () => rotateSelected(-90));
  el('craft-rot-cw')?.addEventListener('click', () => rotateSelected(90));
  el('craft-rot-45')?.addEventListener('click', () => rotateSelected(45));
  el('craft-sel-flip')?.addEventListener('click', flipSelected);
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
    try { await importPhoto(craftUi.textSide, f); } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
    photoIn.value = '';
    craftRender();
  });
  el('craft-photo-clear')?.addEventListener('click', async () => { await setPhotoImage(craftUi.textSide, null); await savePhoto(craftUi.textSide, null); craftRender(); });
  el('craft-bulk-apply')?.addEventListener('click', () => { const t = el<HTMLTextAreaElement>('craft-bulk'); if (t) setTextsBulk(craftUi.textSide, t.value); });
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
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flipSelected(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-0.5, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(0.5, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -0.5); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, 0.5); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (isActive()) craftRender(); });
  renderAll();
}
