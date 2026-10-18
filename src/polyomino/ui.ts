/* 폴리오미노 — 진입점: 전체 렌더 조립 + 상단 컨트롤·선택 피스 도구·키보드 초기화.
   세부는 board(도면) · tray(트레이) · picker(피스 선택/자작) · solve(답 탐색) · drag(드래그) · actions(상태 변경) 참고 */
import { bindNumericInput } from '../shared/inputs';
import { polyState, polyLoadState, polySaveState, boardOf, undo, redo, canUndo, canRedo } from './state';
import { computeCoverage, isComplete, openCellCount, readLetters } from './model';
import { setPolyRenderer, polyRender, polyUi, selectedArea, pieceByKey, resize, setEditMode, setAllowRotate, setAllowFlip, setForbidOverlap, setCoverLetters, resetPlacements, clearAll, rotatePlacement, flipPlacement, removePlacement, setMemo, selectPlacement, movePlacement, hasLetters } from './actions';
import { renderBoard, closeLetterEditor } from './board';
import { renderTray } from './tray';
import { renderPicker, initPicker } from './picker';
import { initSolve, invalidateSolve } from './solve';
import { pieceColor } from './draw';

export { polyRender } from './actions';

let isActive: () => boolean = () => false;
let lastSig = '';

function signature(): string {
  return JSON.stringify([polyState.w, polyState.h, polyState.holes, polyState.counts, polyState.customs, polyState.allowRotate, polyState.allowFlip]);
}

function renderAll(): void {
  const b = boardOf();
  const cov = computeCoverage(b, polyState.placements);

  /* 상단 컨트롤 상태 */
  const wIn = document.getElementById('poly-w') as HTMLInputElement | null, hIn = document.getElementById('poly-h') as HTMLInputElement | null;
  if (wIn && document.activeElement !== wIn) wIn.value = String(polyState.w);
  if (hIn && document.activeElement !== hIn) hIn.value = String(polyState.h);
  document.querySelectorAll<HTMLButtonElement>('#poly-edit-mode button').forEach(x => x.classList.toggle('on', x.dataset.mode === polyState.editMode));
  const syncBtn = (id: string, on: boolean, label: string) => { const el = document.getElementById(id); if (!el) return; el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); el.textContent = label + ': ' + (on ? '켬' : '끔'); };
  syncBtn('poly-opt-rotate', polyState.allowRotate, '회전 허용');
  syncBtn('poly-opt-flip', polyState.allowFlip, '뒤집기 허용');
  syncBtn('poly-opt-overlap', polyState.forbidOverlap, '겹침 금지');
  syncBtn('poly-opt-cover', polyState.coverLetters, '피스로 글자 가리기');
  const ub = document.getElementById('poly-undo') as HTMLButtonElement | null, rb = document.getElementById('poly-redo') as HTMLButtonElement | null;
  if (ub) ub.disabled = !canUndo(); if (rb) rb.disabled = !canRedo();

  /* 상태 줄 */
  const open = openCellCount(b);
  const { area, hasInf } = selectedArea();
  const st = document.getElementById('poly-status');
  if (st) {
    let s = '채울 칸 <b>' + open + '</b> · 선택한 피스 합계 <b>' + area + (hasInf ? '+∞' : '') + '</b>칸';
    if (!hasInf && area !== open && area > 0) s += ' <span style="color:#ef4444">⚠ ' + (area > open ? area - open + '칸 많음' : open - area + '칸 부족') + '</span>';
    if (polyState.placements.length) s += ' · 남은 빈칸 ' + cov.uncovered;
    if (cov.conflictIds.size) s += ' · <span style="color:#ef4444">충돌 ' + cov.conflictIds.size + '</span>';
    if (polyState.placements.length && isComplete(cov)) s += ' <span class="poly-done">완성!</span>';
    st.innerHTML = s;
  }
  const areaEl = document.getElementById('poly-area');
  if (areaEl) areaEl.textContent = '합계 ' + area + (hasInf ? '+∞' : '') + '칸 / 채울 칸 ' + open;

  renderBoard();
  renderTray();
  renderPicker();

  /* 선택 피스 도구 */
  const tools = document.getElementById('poly-sel-tools');
  const sel = polyUi.selectedId !== null ? polyState.placements.find(p => p.id === polyUi.selectedId) : undefined;
  if (tools) {
    tools.classList.toggle('hidden', !sel);
    if (sel) {
      const cat = pieceByKey(sel.key);
      const nm = document.getElementById('poly-sel-name'); if (nm) nm.textContent = (cat ? cat.name + ' (' + cat.size + '칸)' : sel.key);
      const memo = document.getElementById('poly-sel-memo') as HTMLInputElement | null;
      if (memo && document.activeElement !== memo) memo.value = sel.memo || '';
      const rot = document.getElementById('poly-sel-rotate') as HTMLButtonElement | null, flp = document.getElementById('poly-sel-flip') as HTMLButtonElement | null;
      if (rot) rot.disabled = !polyState.allowRotate; if (flp) flp.disabled = !polyState.allowFlip;
    }
  }

  /* 글자 읽기 */
  const lw = document.getElementById('poly-letters-wrap'), lt = document.getElementById('poly-letters');
  if (lw && lt) {
    const show = hasLetters();
    lw.classList.toggle('hidden', !show);
    lt.innerHTML = '';
    if (show) {
      const r = readLetters(b, polyState.placements);
      for (const row of r.byPiece) {
        if (!row.text) continue;
        const cat = pieceByKey(row.key);
        const div = document.createElement('div'); div.className = 'row';
        const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = cat ? pieceColor(cat.colorIdx) : '#bbb';
        const nm = document.createElement('span'); nm.className = 'count'; nm.style.margin = '0'; nm.textContent = (cat ? cat.name : row.key) + (row.memo ? ' 「' + row.memo + '」' : '');
        const tx = document.createElement('b'); tx.textContent = row.text;
        div.appendChild(sw); div.appendChild(nm); div.appendChild(tx);
        lt.appendChild(div);
      }
      const un = document.createElement('div'); un.className = 'row';
      un.innerHTML = '<span class="count" style="margin:0">덮이지 않은 글자</span><b>' + (r.uncovered || '—') + '</b>';
      lt.appendChild(un);
    }
  }

  /* 도면·피스가 바뀌면 이전 답 탐색 결과는 무효 */
  const sig = signature();
  if (lastSig && sig !== lastSig) invalidateSolve();
  lastSig = sig;
}

export function polyInit(opts: { isActive: () => boolean }): void {
  isActive = opts.isActive;
  polyLoadState();
  setPolyRenderer(renderAll);
  initPicker();
  initSolve();

  /* 도면 크기 */
  const wIn = document.getElementById('poly-w') as HTMLInputElement | null, hIn = document.getElementById('poly-h') as HTMLInputElement | null;
  /* 숫자 입력 공용 동작: 전각 숫자 즉시 반각, 숫자만, change·엔터 때 1~20 으로 잘라 적용 */
  const applySize = () => { if (!wIn || !hIn) return; resize(readW(), readH()); wIn.value = String(polyState.w); hIn.value = String(polyState.h); };
  const readW = wIn ? bindNumericInput(wIn, { min: 1, max: 20, fallback: () => polyState.w, onCommit: applySize }) : () => polyState.w;
  const readH = hIn ? bindNumericInput(hIn, { min: 1, max: 20, fallback: () => polyState.h, onCommit: applySize }) : () => polyState.h;

  /* 편집 모드 */
  document.getElementById('poly-edit-mode')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-mode]'); if (!b) return;
    const mode = b.dataset.mode as typeof polyState.editMode;
    if (mode !== 'letter') closeLetterEditor();
    setEditMode(mode);
  });
  document.getElementById('poly-opt-rotate')?.addEventListener('click', () => setAllowRotate(!polyState.allowRotate));
  document.getElementById('poly-opt-flip')?.addEventListener('click', () => setAllowFlip(!polyState.allowFlip));
  document.getElementById('poly-opt-overlap')?.addEventListener('click', () => setForbidOverlap(!polyState.forbidOverlap));
  document.getElementById('poly-opt-cover')?.addEventListener('click', () => setCoverLetters(!polyState.coverLetters));
  document.getElementById('poly-undo')?.addEventListener('click', () => { if (undo()) { polySaveState(); polyRender(); } });
  document.getElementById('poly-redo')?.addEventListener('click', () => { if (redo()) { polySaveState(); polyRender(); } });
  document.getElementById('poly-reset')?.addEventListener('click', resetPlacements);
  document.getElementById('poly-clear')?.addEventListener('click', () => { if (confirm('도면(구멍·글자)·선택한 피스·놓인 피스를 모두 지울까요? (되돌리기 가능)')) clearAll(); });

  /* 선택 피스 도구 */
  document.getElementById('poly-sel-rotate')?.addEventListener('click', () => { if (polyUi.selectedId !== null) rotatePlacement(polyUi.selectedId); });
  document.getElementById('poly-sel-flip')?.addEventListener('click', () => { if (polyUi.selectedId !== null) flipPlacement(polyUi.selectedId); });
  document.getElementById('poly-sel-remove')?.addEventListener('click', () => { if (polyUi.selectedId !== null) removePlacement(polyUi.selectedId); });
  const memo = document.getElementById('poly-sel-memo') as HTMLInputElement | null;
  memo?.addEventListener('change', () => { if (polyUi.selectedId !== null) setMemo(polyUi.selectedId, memo.value); });
  memo?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); memo.blur(); } });

  /* 키보드: R 돌리기 · F 뒤집기 · Delete 트레이로 · 화살표 이동 · Esc 선택 해제 · Ctrl+Z/Y */
  document.addEventListener('keydown', e => {
    if (!isActive()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey ? redo() : undo()) { polySaveState(); polyRender(); } return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); if (redo()) { polySaveState(); polyRender(); } return; }
    const id = polyUi.selectedId;
    if (id === null) return;
    const p = polyState.placements.find(q => q.id === id); if (!p) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotatePlacement(id); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flipPlacement(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePlacement(id); }
    else if (e.key === 'Escape') { e.preventDefault(); selectPlacement(null); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); movePlacement(id, p.x - 1, p.y); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); movePlacement(id, p.x + 1, p.y); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePlacement(id, p.x, p.y - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); movePlacement(id, p.x, p.y + 1); }
  });

  window.addEventListener('resize', () => { if (isActive()) polyRender(); });
  lastSig = signature();
  renderAll();
}
