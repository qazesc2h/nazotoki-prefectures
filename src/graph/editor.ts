/* 규칙 그래프 — 한 글자 셀 편집기 (캔버스 셀 + 목록 슬롯 공용 플로팅 입력) */
import { kataToHira, toAsciiLetters } from '../shared/kana';
import { graphUpdateCellChar } from './model';
import { graphState, graphFindLetter, graphSaveState } from './state';
import { cellTypeConvert } from './engine';
import { graphComputeEngine } from './engine-run';
import { graphApplyEngineVisuals, graphRenderEdges } from './edges';

/** 현재 선택된 cellId (편집 중인 칸) */
export let graphSelectedCellId: string | null = null;

/**
 * 캔버스 SVG에서 특정 cellId 칸의 글자 텍스트를 업데이트한다 (전체 재렌더 없이).
 * @param {string} cellId
 * @param {string} char
 */
export function graphUpdateCanvasCell(cellId: string, char: string): void {
  var cellG = document.querySelector('svg.graph-canvas [data-cell-id="' + cellId + '"]');
  if (!cellG) return;
  var t = cellG.querySelector('text.graph-cell-char');
  if (t) t.textContent = char || '';
}

/**
 * 우측 단어 목록에서 특정 cellId 슬롯의 텍스트와 클래스를 업데이트한다 (전체 재렌더 없이).
 * @param {string} cellId
 * @param {string} char
 */
export function graphUpdateWordListSlot(cellId: string, char: string): void {
  var slot = document.querySelector('#graph-word-list [data-cell-id="' + cellId + '"]');
  if (!slot) return;
  slot.textContent = char || '_';
  slot.classList.toggle('filled', !!char);
}

/**
 * 글자 커밋: 카타카나→히라가나 정규화 후 데이터 모델·캔버스·목록 동기화 및 저장.
 * @param {string} cellId
 * @param {string} rawChar - 사용자가 입력한 글자 (히라가나/카타카나/빈 문자열)
 */
export function graphCommitCellChar(cellId: string, rawChar: string): void {
  var ch = toAsciiLetters(kataToHira((rawChar || '').trim())).slice(0, 1);
  var _l = graphFindLetter(cellId);
  if (ch && _l && _l.cellType) ch = cellTypeConvert(ch, _l.cellType);  /* 칸 타입: 입력을 작은/탁점/반탁점 형태로 변환 */
  graphState.words = graphUpdateCellChar(graphState.words, cellId, ch, 'user');
  graphSaveState();
  /* 제약 엔진 재계산 후 파생값·충돌·규칙선 갱신 (편집기는 유지) */
  graphComputeEngine();
  graphApplyEngineVisuals();
  graphRenderEdges();
}

/**
 * 캔버스 셀과 단어 목록 슬롯의 선택 하이라이트를 설정/해제한다.
 * @param {string|null} cellId - null이면 선택 해제
 */
export function graphHighlightCell(cellId: string | null): void {
  /* 캔버스 — 모든 셀 스트로크 초기화 */
  document.querySelectorAll('svg.graph-canvas [data-cell-id] rect').forEach(function(r) {
    r.setAttribute('stroke', 'var(--border)');
    r.setAttribute('stroke-width', '1.5');
  });
  /* 단어 목록 — 모든 슬롯 선택 클래스 제거 */
  document.querySelectorAll('#graph-word-list [data-cell-id]').forEach(function(s) {
    s.classList.remove('sel');
  });

  if (!cellId) return;

  /* 캔버스 선택 하이라이트 */
  var cellG = document.querySelector('svg.graph-canvas [data-cell-id="' + cellId + '"]');
  if (cellG) {
    var rect = cellG.querySelector('rect');
    if (rect) {
      rect.setAttribute('stroke', 'var(--accent)');
      rect.setAttribute('stroke-width', '2.5');
    }
  }
  /* 단어 목록 선택 하이라이트 */
  var slot = document.querySelector('#graph-word-list [data-cell-id="' + cellId + '"]');
  if (slot) slot.classList.add('sel');
}

/**
 * 플로팅 편집기를 특정 DOM/SVG 요소 위에 위치시키고 활성화한다.
 * @param {Element} targetEl - 기준 요소 (getBoundingClientRect 사용)
 * @param {string} cellId
 * @param {string} currentChar
 */
export function graphShowCellEditor(targetEl: Element, cellId: string, currentChar: string): void {
  const editor = document.getElementById('graph-cell-editor') as HTMLInputElement | null;
  if (!editor) return;

  graphSelectedCellId = cellId;
  graphHighlightCell(cellId);

  var bb = targetEl.getBoundingClientRect();
  var edW = 44, edH = 44;
  var left = bb.left + (bb.width - edW) / 2;
  var top  = bb.top  + (bb.height - edH) / 2;
  /* 뷰포트 클램프 */
  left = Math.max(4, Math.min(left, window.innerWidth  - edW - 4));
  top  = Math.max(4, Math.min(top,  window.innerHeight - edH - 4));

  editor.style.left = left + 'px';
  editor.style.top  = top  + 'px';
  editor.value = currentChar || '';
  editor.classList.add('visible');
  try { editor.focus(); editor.select(); } catch (_) {}
}

/**
 * 플로팅 편집기를 닫고 선택 하이라이트를 해제한다.
 */
export function graphHideCellEditor(): void {
  const editor = document.getElementById('graph-cell-editor');
  if (editor) editor.classList.remove('visible');
  graphHighlightCell(null);
  graphSelectedCellId = null;
}

/**
 * 현재 선택 셀에서 dir 방향(+1: 다음, -1: 이전)으로 선택을 이동한다.
 * @param {number} dir
 */
export function graphMoveSelection(dir: number): void {
  if (!graphSelectedCellId) return;
  var allCells: string[] = [];
  graphState.words.forEach(function(w) {
    w.letters.forEach(function(l) { allCells.push(l.cellId); });
  });
  var idx = allCells.indexOf(graphSelectedCellId);
  var nextIdx = idx + dir;
  if (nextIdx < 0 || nextIdx >= allCells.length) {
    graphHideCellEditor();
    return;
  }
  var nextCellId = allCells[nextIdx];
  var nextLetter = graphFindLetter(nextCellId);
  if (!nextLetter) { graphHideCellEditor(); return; }

  /* 캔버스 셀 rect를 기준으로 편집기 표시 (fallback: 단어 목록 슬롯) */
  var canvasCellG = document.querySelector('svg.graph-canvas [data-cell-id="' + nextCellId + '"]');
  var rectEl = canvasCellG ? canvasCellG.querySelector('rect') : null;
  if (rectEl) {
    graphShowCellEditor(rectEl, nextCellId, nextLetter.char);
  } else {
    var slot = document.querySelector('#graph-word-list [data-cell-id="' + nextCellId + '"]');
    if (slot) graphShowCellEditor(slot, nextCellId, nextLetter.char);
  }
}

/**
 * 플로팅 편집기 이벤트 핸들러를 초기화한다.
 * graphInit에서 한 번 호출.
 */
export function graphInitCellEditor(): void {
  const editor = document.getElementById('graph-cell-editor') as HTMLInputElement | null;
  if (!editor) return;

  var composing = false;

  editor.addEventListener('compositionstart', function() { composing = true; });
  /* 포커스가 새로 들어오면 조합 플래그 초기화 — compositionend 를 내지 않는 IME 에서 플래그가 끼는 것 방지 */
  editor.addEventListener('focus', function() { composing = false; });

  editor.addEventListener('compositionend', function() {
    composing = false;
    var ch = toAsciiLetters(kataToHira(editor.value.trim())).slice(-1);
    if (graphSelectedCellId) {
      graphCommitCellChar(graphSelectedCellId, ch);
      editor.value = ch;
      try { editor.select(); } catch (_) {}
    }
  });

  editor.addEventListener('input', function(e: Event) {
    /* 매 입력마다 마지막 글자를 커밋한다(조합 플래그가 끼어도 입력이 반영되도록).
       단, IME 조합 중(촉음 'tt'→っ, 요음 'lya'→ゃ 처럼 여러 키로 한 글자를 만드는 중)에는
       입력창 값을 건드리지 않는다 — 값을 덮어쓰면 조합이 끊겨 't'·'あ' 같은 조각만 남는다.
       조합이 끝나면 compositionend 에서 최종 글자로 정리한다. */
    var val = toAsciiLetters(kataToHira(editor.value));
    if (val.length > 1) val = val.slice(-1);
    if (graphSelectedCellId) graphCommitCellChar(graphSelectedCellId, val);
    if (!(composing || (e as InputEvent).isComposing)) editor.value = val;
  });

  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      graphHideCellEditor();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (graphSelectedCellId) {
        graphCommitCellChar(graphSelectedCellId, '');
        editor.value = '';
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      graphMoveSelection(1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      graphMoveSelection(e.shiftKey ? -1 : 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      graphMoveSelection(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      graphMoveSelection(-1);
    }
  });

  /* blur 시 편집기 닫기 (setTimeout: 다른 셀 클릭 시 새 편집기가 먼저 열릴 수 있도록) */
  editor.addEventListener('blur', function() {
    setTimeout(function() {
      /* 에디터가 다시 포커스 받지 않았으면 닫기 */
      if (document.activeElement !== editor) {
        graphHideCellEditor();
      }
    }, 0);
  });

  /* 편집기 외부 클릭 시 닫기 */
  document.addEventListener('pointerdown', function(e) {
    var ed = document.getElementById('graph-cell-editor');
    if (ed && ed.classList.contains('visible') && e.target !== ed) {
      /* SVG 셀이나 단어목록 슬롯 클릭은 해당 핸들러에서 다시 열 것이므로 여기서는 무조건 닫기 */
      ed.classList.remove('visible');
      graphHighlightCell(null);
      /* graphSelectedCellId 는 graphShowCellEditor가 다시 설정함 */
    }
  }, true /* capture: 다른 핸들러보다 먼저 실행 */);
}
