/* 규칙 그래프 — DOM 레이어: 단어 목록 · 캔버스 · 셀 편집기 · 규칙 연결 · 메뉴 · 범례 */
import { NS } from '../shared/dom';
import { kataToHira, toAsciiDigits, toAsciiLetters } from '../shared/kana';
import {
  graphValidateCharCount, graphAddWord, graphAddWordFromText, graphRemoveWord, graphCountWordRules,
  graphWordUserText, graphParseWordInput, graphApplyWordChars, graphUpdateCellChar,
} from './model';
import type { Word, Rule, RuleType, SeqOrder } from './model';
import {
  GRAPH_CELL_W, GRAPH_CELL_H, GRAPH_CELL_GAP, GRAPH_BOX_PAD_X, GRAPH_BOX_PAD_TOP, GRAPH_CANVAS_PAD, GRAPH_CHAR_FONT, GRAPH_SLOT_FONT,
  graphUpdateMetrics, graphBoxSize, graphComputeLayout, graphRemapPositions,
} from './layout';
import { graphState, graphFindLetter, graphLoadState, graphSaveState, graphResetContent } from './state';
import { GRAPH_RULE_DEFS, GRAPH_CELL_TYPE_BADGE, computeEngine, cellTypeConvert } from './engine';
import type { CellType, EngineResult } from './engine';

/** 엔진 계산 결과 (저장하지 않음 — 매번 재계산) */
let graphEngine: EngineResult = { value: {}, state: {}, conflict: {}, ruleViol: {} };
function graphComputeEngine(): void {
  graphEngine = computeEngine(graphState.words, graphState.rules, graphState);
}

/* ---------------- 단어 목록 ---------------- */

/**
 * 우측 단어 목록 패널 DOM 요소를 빌드한다 (순수 렌더링 — 이벤트 핸들러 없음).
 * 각 단어의 글자 슬롯을 밑줄 빈칸(_) 형태로 표시하며, 글자가 있으면 해당 글자를 보여준다.
 * DOM 렌더링 테스트에서 직접 호출 가능하다.
 *
 * @param {Array} words  - graphState.words 형태의 단어 배열
 * @param {{index:number, draft:(string|null)}|null} [edit] - 단어 입력 모드가 열린 단어(있으면 그 행에 입력창)
 * @returns {HTMLElement} - 렌더링된 패널 컨테이너 요소
 */
export function graphBuildWordListEl(words: Word[], edit?: WordEdit | null): HTMLDivElement {
  const container = document.createElement('div');
  if (!words.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.style.cssText = 'font-size:13px; padding:20px 12px; text-align:center';
    empty.textContent = '단어를 추가하세요';
    container.appendChild(empty);
    return container;
  }

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.cssText = 'padding:12px';

  const hdr = document.createElement('p');
  hdr.className = 'count';
  hdr.style.marginBottom = '8px';
  hdr.textContent = words.length + '개 단어';
  panel.appendChild(hdr);

  words.forEach(function(w) {
    const isEditing = !!(edit && edit.index === w.index);
    const row = document.createElement('div');
    row.className = 'graph-word-row' + (isEditing ? ' editing' : '');
    row.setAttribute('data-word-index', String(w.index));
    row.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--border)';

    /* 단어 헤더: "W0  3자  [✎ 단어 입력] [삭제]" */
    const rowHdr = document.createElement('div');
    rowHdr.style.cssText = 'display:flex; align-items:center; justify-content:flex-end; margin-bottom:2px';

    const lbl = document.createElement('span');
    lbl.className = 'graph-word-label';
    lbl.style.display = 'none';
    lbl.textContent = 'W' + w.index;
    rowHdr.appendChild(lbl);

    const cnt = document.createElement('span');
    cnt.style.cssText = 'display:none';
    cnt.textContent = w.charCount + '자';
    rowHdr.appendChild(cnt);

    const tools = document.createElement('span');
    tools.className = 'graph-word-tools';

    /* 단어 입력 모드 토글 — 이벤트 핸들러는 graphRenderWordList에서 부착 */
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn' + (isEditing ? ' on' : '');
    editBtn.dataset.editWord = String(w.index);
    editBtn.title = '단어 전체를 한 번에 입력합니다 (한 글자씩 누르지 않아도 됨)';
    editBtn.textContent = '✎ 단어 입력';
    tools.appendChild(editBtn);

    /* 삭제 버튼 — 이벤트 핸들러는 graphRenderWordList에서 부착 */
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn';
    del.dataset.delWord = String(w.index);
    del.textContent = '삭제';
    tools.appendChild(del);

    rowHdr.appendChild(tools);
    row.appendChild(rowHdr);

    /* 밑줄 빈칸 슬롯: 비어 있으면 "_", 글자가 있으면 해당 글자 */
    const blanks = document.createElement('div');
    blanks.className = 'graph-word-blanks';
    blanks.setAttribute('data-char-count', String(w.charCount));

    w.letters.forEach(function(l) {
      const slot = document.createElement('span');
      slot.className = 'graph-word-slot' + (l.char ? ' filled' : '');
      slot.setAttribute('data-cell-id', l.cellId);
      slot.textContent = l.char || '_';
      blanks.appendChild(slot);
    });

    row.appendChild(blanks);

    /* 단어 입력 모드: 단어 전체 텍스트 입력창 + 저장/취소 */
    if (isEditing) {
      const box = document.createElement('div');
      box.className = 'graph-word-edit';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'graph-word-edit-input';
      inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('spellcheck', 'false');
      inp.setAttribute('aria-label', '단어 입력');
      inp.placeholder = '예: きって / さ＿ら';
      inp.value = (edit.draft != null) ? edit.draft : graphWordUserText(w);
      box.appendChild(inp);
      const save = document.createElement('button');
      save.type = 'button'; save.className = 'btn'; save.dataset.saveWord = String(w.index); save.textContent = '저장';
      box.appendChild(save);
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.className = 'btn'; cancel.dataset.cancelWord = String(w.index); cancel.textContent = '취소';
      box.appendChild(cancel);
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.innerHTML = '엔터 = 저장 · Esc = 취소. <code>＿</code>·<code>?</code>·<code>○</code>는 빈 칸. 글자가 칸보다 많으면 칸이 늘어나고, 적으면 뒤 칸은 비워집니다.';
      box.appendChild(hint);
      row.appendChild(box);
    }
    panel.appendChild(row);
  });

  container.appendChild(panel);
  return container;
}

/** 단어 입력 모드 상태: 열린 단어 인덱스 + 입력 중 임시 텍스트 (재렌더 후 복원용). 저장하지 않음. */
interface WordEdit { index: number; draft: string | null; }
let graphWordEdit: WordEdit | null = null;

/** 단어 입력 모드를 열거나(index) 닫는다(null). 다른 단어로 바꾸면 이전 임시 입력은 버린다. */
function graphSetWordEdit(index: number | null): void {
  if (index === null || index === undefined) graphWordEdit = null;
  else graphWordEdit = { index: index, draft: null };
  graphHideCellEditor();
  graphRenderWordList();
  graphApplyEngineVisuals();   /* 새로 그린 슬롯에 추론값·충돌 다시 반영 */
  if (graphWordEdit) {
    var inp = document.getElementById('graph-word-edit-input') as HTMLInputElement | null;
    if (inp) { try { inp.focus(); inp.select(); } catch (_) {} }
  }
}

/** 단어 입력 모드 저장: 입력 텍스트를 칸에 반영하고 모드를 닫는다. */
function graphSaveWordEdit(index: number): void {
  var inp = document.getElementById('graph-word-edit-input') as HTMLInputElement | null;
  if (!inp) return;
  var chars = graphParseWordInput(inp.value);
  var newWords = graphApplyWordChars(graphState.words, index, chars);
  if (!newWords) {
    alert('단어는 1~12글자까지 넣을 수 있습니다.');
    try { inp.focus(); } catch (_) {}
    return;
  }
  graphState.words = newWords;
  graphWordEdit = null;
  graphSaveState();
  graphRender();   /* 칸 수가 바뀔 수 있으므로 캔버스까지 전체 재렌더 */
}

/**
 * 우측 단어 목록 패널을 렌더링하고 삭제 버튼 및 슬롯 클릭 이벤트 핸들러를 부착한다.
 */
function graphRenderWordList(): void {
  const wrap = document.getElementById('graph-word-list');
  if (!wrap) return;
  /* 열려 있던 단어 입력 모드가 가리키는 단어가 사라졌으면 닫기 */
  if (graphWordEdit && !graphState.words.some(function(w) { return w.index === graphWordEdit!.index; })) graphWordEdit = null;
  wrap.innerHTML = '';
  wrap.appendChild(graphBuildWordListEl(graphState.words, graphWordEdit));

  /* 삭제 버튼 이벤트 핸들러 부착 — 입력한 글자나 연결된 규칙선이 있으면 한 번 확인 */
  wrap.querySelectorAll<HTMLButtonElement>('[data-del-word]').forEach(function(btn) {
    var idx = parseInt(btn.dataset.delWord!, 10);
    btn.addEventListener('click', function() {
      var w = graphState.words.find(function(x) { return x.index === idx; });
      if (!w) return;
      var userChars = w.letters.filter(function(l) { return l.source === 'user' && l.char; }).length;
      var ruleCount = graphCountWordRules(graphState.rules, idx);
      if (userChars > 0 || ruleCount > 0) {
        var shown = graphWordUserText(w);
        var what = [];
        if (userChars > 0) what.push('입력한 글자 ' + userChars + '개');
        if (ruleCount > 0) what.push('연결된 규칙선 ' + ruleCount + '개');
        if (!confirm('단어 「' + shown + '」(' + w.charCount + '자)를 삭제할까요?\n' + what.join(' · ') + '가 함께 사라집니다.')) return;
      }
      if (graphWordEdit && graphWordEdit.index === idx) graphWordEdit = null;
      var result = graphRemoveWord(graphState.words, graphState.rules, idx);
      graphState.words = result.words;
      graphState.rules = result.rules;
      graphState.positions = graphRemapPositions(graphState.positions, idx);
      if (graphWordEdit && graphWordEdit.index > idx) graphWordEdit.index -= 1;   /* 뒤 단어 인덱스가 1씩 당겨짐 */
      graphSaveState();
      graphRender();
    });
  });

  /* 단어 입력 모드 열기/닫기 토글 */
  wrap.querySelectorAll<HTMLButtonElement>('[data-edit-word]').forEach(function(btn) {
    var idx = parseInt(btn.dataset.editWord!, 10);
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      graphSetWordEdit(graphWordEdit && graphWordEdit.index === idx ? null : idx);
    });
  });
  wrap.querySelectorAll<HTMLButtonElement>('[data-save-word]').forEach(function(btn) {
    var idx = parseInt(btn.dataset.saveWord!, 10);
    btn.addEventListener('click', function(e) { e.stopPropagation(); graphSaveWordEdit(idx); });
  });
  wrap.querySelectorAll<HTMLButtonElement>('[data-cancel-word]').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); graphSetWordEdit(null); });
  });
  const editInp = document.getElementById('graph-word-edit-input') as HTMLInputElement | null;
  if (editInp && graphWordEdit) {
    var editIdx = graphWordEdit.index;
    editInp.addEventListener('input', function() { if (graphWordEdit) graphWordEdit.draft = editInp.value; });
    editInp.addEventListener('keydown', function(e) {
      /* IME 변환 확정용 엔터(isComposing / keyCode 229)는 저장으로 취급하지 않음 */
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); graphSaveWordEdit(editIdx); }
      else if (e.key === 'Escape') { e.preventDefault(); graphSetWordEdit(null); }
    });
    /* 셀 편집기의 바깥 클릭 핸들러가 이 입력창을 셀 클릭으로 오해하지 않도록 */
    editInp.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  }

  /* 글자 슬롯 클릭 → 편집기 표시 (Sub-AC 5) */
  wrap.querySelectorAll<HTMLElement>('[data-cell-id]').forEach(function(slot) {
    var cellId = slot.getAttribute('data-cell-id')!;
    slot.addEventListener('click', function(e) {
      e.stopPropagation(); /* 상위 클릭 이벤트 방지 */
      var letter = graphFindLetter(cellId);
      if (letter !== null) {
        graphShowCellEditor(slot, cellId, letter.char);
      }
    });
  });
}

/* ----------------------------------------------------------------
   SVG 캔버스 렌더링 (Sub-AC 2)
   ---------------------------------------------------------------- */

/**
 * SVG 캔버스에 단어 박스를 렌더링한다.
 * - 위치가 없는 단어는 graphComputeLayout으로 자동 배치하고 저장한다.
 * - 이미 위치가 있는 단어는 그 위치를 유지한다.
 * - 각 단어 박스는 드래그로 이동 가능하다.
 */
function graphRenderCanvas(): void {
  var wrap = document.getElementById('graph-canvas-wrap');
  if (!wrap) return;

  /* 빈 상태 메시지 표시 제어 */
  var emptyEl = document.getElementById('graph-empty');
  if (emptyEl) emptyEl.style.display = graphState.words.length ? 'none' : '';

  if (!graphState.words.length) {
    var oldSvg = wrap.querySelector('svg.graph-canvas');
    if (oldSvg) oldSvg.remove();
    return;
  }

  /* 캔버스 폭은 가용 폭에 맞춤 — 모바일에선 화면 폭 내에서 박스가 줄바꿈·세로로 쌓이게.
     (탭이 숨겨져 clientWidth=0 일 때만 600 폴백) */
  var canvasW = wrap.clientWidth > 0 ? Math.max(wrap.clientWidth - 8, 240) : 600;

  /* 레이아웃 계산: 위치 없는 단어만 자동 배치 */
  var layout = graphComputeLayout(graphState.words, graphState.positions, canvasW);

  /* 새로 계산된 위치를 graphState.positions에 저장 (처음 추가된 단어만) */
  var posChanged = false;
  graphState.words.forEach(function(w) {
    if (graphState.positions[w.index] === undefined && layout[w.index] !== undefined) {
      graphState.positions[w.index] = layout[w.index];
      posChanged = true;
    }
  });
  if (posChanged) graphSaveState();

  /* SVG 뷰박스 크기 계산 */
  var maxRight = canvasW, maxBottom = 280;
  graphState.words.forEach(function(w) {
    var pos = layout[w.index];
    if (!pos) return;
    var sz = graphBoxSize(w.charCount);
    maxRight = Math.max(maxRight, pos.x + sz.w + GRAPH_CANVAS_PAD);
    maxBottom = Math.max(maxBottom, pos.y + sz.h + GRAPH_CANVAS_PAD);
  });

  /* SVG 요소 생성 또는 재사용 */
  var svg = wrap.querySelector<SVGSVGElement>('svg.graph-canvas');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'graph-canvas');
    wrap.appendChild(svg);
  }
  svg.setAttribute('viewBox', '0 0 ' + maxRight + ' ' + maxBottom);
  svg.setAttribute('width', String(maxRight));
  svg.setAttribute('height', String(maxBottom));
  svg.innerHTML = '';

  /* 단어 박스 렌더링 */
  graphState.words.forEach(function(w) {
    var pos = layout[w.index];
    if (!pos) return;
    var sz = graphBoxSize(w.charCount);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'graph-word-box');
    g.setAttribute('data-word-index', String(w.index));
    g.setAttribute('transform', 'translate(' + pos.x + ',' + pos.y + ')');

    /* 박스 배경 */
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(sz.w)); bg.setAttribute('height', String(sz.h));
    bg.setAttribute('rx', '8'); bg.setAttribute('ry', '8');
    bg.setAttribute('fill', 'var(--panel)');
    bg.setAttribute('stroke', 'var(--border)');
    bg.setAttribute('stroke-width', '1.5');
    g.appendChild(bg);

    /* 단어 레이블 */
    var lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', String(GRAPH_BOX_PAD_X));
    lbl.setAttribute('y', '20');
    lbl.setAttribute('font-size', '12');
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('fill', 'var(--muted)');
    lbl.setAttribute('font-family', 'var(--jp)');
    lbl.setAttribute('pointer-events', 'none');
    lbl.setAttribute('display', 'none'); /* 단어 타이틀 숨김 */
    lbl.textContent = 'W' + w.index + ' (' + w.charCount + '자)';
    g.appendChild(lbl);

    /* 셀 박스 렌더링 */
    w.letters.forEach(function(letter, si) {
      var cx = GRAPH_BOX_PAD_X + si * (GRAPH_CELL_W + GRAPH_CELL_GAP);
      var cy = GRAPH_BOX_PAD_TOP;

      var cellG = document.createElementNS(NS, 'g');
      cellG.setAttribute('data-cell-id', letter.cellId);

      /* 셀 배경 사각형 */
      var cellRect = document.createElementNS(NS, 'rect');
      cellRect.setAttribute('x', String(cx));
      cellRect.setAttribute('y', String(cy));
      cellRect.setAttribute('width', String(GRAPH_CELL_W));
      cellRect.setAttribute('height', String(GRAPH_CELL_H));
      cellRect.setAttribute('rx', '6'); cellRect.setAttribute('ry', '6');
      cellRect.setAttribute('fill', 'var(--panel-2)');
      var typeColor: string | null = letter.cellType === 'handakuten' ? '#db2777' : letter.cellType === 'dakuten' ? '#7c3aed' : letter.cellType === 'small' ? '#0ea5e9' : null;
      cellRect.setAttribute('stroke', typeColor || 'var(--border)');
      cellRect.setAttribute('stroke-width', typeColor ? '2' : '1.5');
      if (letter.cellType) cellRect.setAttribute('stroke-dasharray', '3 2');
      cellG.appendChild(cellRect);
      if (letter.cellType){
        var badgeFont = Math.max(11, Math.round(GRAPH_CELL_H * 0.3));
        var sbadge = document.createElementNS(NS, 'text');
        sbadge.setAttribute('x', String(cx + GRAPH_CELL_W - 2));
        sbadge.setAttribute('y', String(cy + badgeFont + 1));  /* 오른쪽 위 — 탁점/반탁점이 실제로 붙는 위치 */
        sbadge.setAttribute('text-anchor', 'end');
        sbadge.setAttribute('font-size', String(badgeFont));
        sbadge.setAttribute('font-weight', '700');
        sbadge.setAttribute('fill', typeColor || '');
        sbadge.setAttribute('pointer-events', 'none');
        sbadge.textContent = GRAPH_CELL_TYPE_BADGE[letter.cellType] || '';
        cellG.appendChild(sbadge);
      }

      /* 가나 글자 */
      var charTxt = document.createElementNS(NS, 'text');
      charTxt.setAttribute('x', String(cx + GRAPH_CELL_W / 2));
      charTxt.setAttribute('y', String(cy + GRAPH_CELL_H / 2 + GRAPH_CHAR_FONT * 0.36));
      charTxt.setAttribute('text-anchor', 'middle');
      charTxt.setAttribute('font-size', String(GRAPH_CHAR_FONT));
      charTxt.setAttribute('class', 'graph-cell-char');
      charTxt.setAttribute('font-family', 'var(--jp)');
      charTxt.setAttribute('fill', 'var(--text)');
      charTxt.setAttribute('pointer-events', 'none');
      charTxt.textContent = letter.char || '';
      cellG.appendChild(charTxt);

      /* 슬롯 인덱스 (작게) */
      var slotTxt = document.createElementNS(NS, 'text');
      slotTxt.setAttribute('x', String(cx + 3));
      slotTxt.setAttribute('y', String(cy + GRAPH_SLOT_FONT + 3));
      slotTxt.setAttribute('font-size', String(GRAPH_SLOT_FONT));
      slotTxt.setAttribute('fill', 'var(--muted)');
      slotTxt.setAttribute('pointer-events', 'none');
      slotTxt.textContent = String(si);
      cellG.appendChild(slotTxt);

      g.appendChild(cellG);
    });

    /* 드래그 이벤트 연결 */
    graphAttachWordBoxDrag(svg!, g, w.index);

    svg!.appendChild(g);
  });
}

/**
 * 단어 박스 드래그 핸들러 (포인터 이벤트, 마우스 + 터치 공통).
 * 이동 없는 클릭은 셀 편집기를 여는 것으로 처리한다.
 * @param {SVGSVGElement} svg
 * @param {SVGGElement} boxGroup
 * @param {number} wordIndex
 */
function graphAttachWordBoxDrag(svg: SVGSVGElement, boxGroup: SVGGElement, wordIndex: number): void {
  var dragging = false;
  var moved = false;           /* 실제 이동이 4px 이상 있었는지 여부 */
  var pendingCellClick: Element | null = null; /* 이동 없는 클릭 시 편집기를 열 cellId */
  var longPressTimer: ReturnType<typeof setTimeout> | null = null;   /* 길게 누르기 → 셀 메뉴 */
  var startClientX = 0, startClientY = 0;
  var startPosX = 0, startPosY = 0;

  /* SVG 좌표계 스케일: clientPx → SVG user unit */
  function getSvgScale() {
    var bb = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return {
      sx: vb.width / (bb.width || 1),
      sy: vb.height / (bb.height || 1)
    };
  }

  /* SVG <g>의 touch-action을 무시하는 브라우저 폴백 — 박스 터치가 스크롤로 넘어가 드래그가 끊기는 것 방지 */
  boxGroup.addEventListener('touchstart', function(e) { e.preventDefault(); }, { passive: false });

  boxGroup.addEventListener('pointerdown', function(e) {
    /* 오른쪽 클릭(컨텍스트 메뉴용)은 드래그 시작하지 않음 */
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    moved = false;
    pendingCellClick = null;

    try { boxGroup.setPointerCapture(e.pointerId); } catch (_) {}
    startClientX = e.clientX;
    startClientY = e.clientY;
    var curPos = graphState.positions[wordIndex] || { x: 0, y: 0 };
    startPosX = curPos.x;
    startPosY = curPos.y;
    boxGroup.style.cursor = 'grabbing';

    /* 클릭 대상이 셀 안에 있으면 pendingCellClick 기록 */
    var target = e.target as Element | null;
    while (target && target !== boxGroup) {
      if (target.getAttribute && target.getAttribute('data-cell-id')) {
        pendingCellClick = target;
        break;
      }
      target = (target.parentElement || target.parentNode) as Element | null;
    }
    /* 셀 위에서 길게 누르기(터치) → 셀 컨텍스트 메뉴 (작은 글자만 토글) */
    if (pendingCellClick && !graphConnectMode) {
      var cidLP = pendingCellClick.getAttribute('data-cell-id')!;
      longPressTimer = setTimeout(function() {
        moved = true; pendingCellClick = null;   /* 편집기/드래그 억제 */
        graphOpenCellMenu(cidLP, startClientX, startClientY);
      }, 500);
    }
  });

  boxGroup.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    var dx = Math.abs(e.clientX - startClientX);
    var dy = Math.abs(e.clientY - startClientY);
    if (dx > 4 || dy > 4) {
      moved = true;
      pendingCellClick = null; /* 이동했으므로 셀 클릭 취소 */
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
    if (!moved) return; /* 아직 임계값 미달이면 이동하지 않음 */
    e.preventDefault();
    var sc = getSvgScale();
    var ddx = (e.clientX - startClientX) * sc.sx;
    var ddy = (e.clientY - startClientY) * sc.sy;
    var newX = Math.max(0, startPosX + ddx);
    var newY = Math.max(0, startPosY + ddy);
    boxGroup.setAttribute('transform', 'translate(' + newX + ',' + newY + ')');
    graphState.positions[wordIndex] = { x: newX, y: newY };
    graphRenderEdges(); /* 규칙선이 박스를 따라 이동 */
  });

  function endDrag(e: PointerEvent) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!dragging) return;
    dragging = false;
    if (e && e.pointerId !== undefined) {
      try { boxGroup.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    boxGroup.style.cursor = 'grab';

    if (moved) {
      /* 실제 드래그: 위치 저장 */
      graphSaveState();
    } else if (pendingCellClick) {
      /* 이동 없는 클릭: 해당 셀 편집기 열기 */
      var cellId = pendingCellClick.getAttribute('data-cell-id')!;
      var letter = graphFindLetter(cellId);
      if (letter !== null) {
        var rectEl = pendingCellClick.querySelector('rect') || pendingCellClick;
        graphShowCellEditor(rectEl, cellId, letter.char);
      }
    }

    moved = false;
    pendingCellClick = null;
  }

  boxGroup.addEventListener('pointerup', endDrag);
  boxGroup.addEventListener('pointercancel', endDrag);
}

export function graphRender(): void {
  graphUpdateMetrics();
  graphComputeEngine();
  graphRenderWordList();
  graphRenderCanvas();
  graphRenderEdges();
  graphApplyEngineVisuals();
  graphRenderLegend();
}

/* ---------------- 셀 편집기 (캔버스 셀 + 목록 슬롯 공용) ---------------- */

/** 현재 선택된 cellId (편집 중인 칸) */
let graphSelectedCellId: string | null = null;

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
function graphCommitCellChar(cellId: string, rawChar: string): void {
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
function graphHighlightCell(cellId: string | null): void {
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
function graphShowCellEditor(targetEl: Element, cellId: string, currentChar: string): void {
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
function graphHideCellEditor(): void {
  const editor = document.getElementById('graph-cell-editor');
  if (editor) editor.classList.remove('visible');
  graphHighlightCell(null);
  graphSelectedCellId = null;
}

/**
 * 현재 선택 셀에서 dir 방향(+1: 다음, -1: 이전)으로 선택을 이동한다.
 * @param {number} dir
 */
function graphMoveSelection(dir: number): void {
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
function graphInitCellEditor(): void {
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

/* ---------------- 폼 ---------------- */

function graphInitForm(): void {
  const addBtn = document.getElementById('graphAddWord');
  const clearBtn = document.getElementById('graphClearAll');
  const charCountInput = document.getElementById('graphCharCount') as HTMLInputElement | null;

  /* 전각 숫자 입력 시 즉시 반각으로 정규화 */
  if (charCountInput) {
    charCountInput.addEventListener('input', function() {
      const a = toAsciiDigits(charCountInput.value).replace(/[^0-9]/g, '');
      if (a !== charCountInput.value) charCountInput.value = a;
    });
  }

  if (addBtn && charCountInput) {
    addBtn.addEventListener('click', function() {
      const n = parseInt(toAsciiDigits(charCountInput.value), 10);
      if (!graphValidateCharCount(n)) {
        alert('글자 수는 1~12 사이의 정수를 입력하세요.');
        return;
      }
      const newWords = graphAddWord(graphState.words, n);
      if (newWords) {
        graphState.words = newWords;
        graphSaveState();
        graphRender();
      }
    });
  }

  /* 단어 텍스트로 추가 (글자가 채워진 단어) — 엔터 또는 「+ 단어 추가」 */
  const wordTextInput = document.getElementById('graphWordText') as HTMLInputElement | null;
  const addWordTextBtn = document.getElementById('graphAddWordText');
  if (wordTextInput && addWordTextBtn) {
    const addByText = function() {
      const newWords = graphAddWordFromText(graphState.words, wordTextInput.value);
      if (!newWords) {
        alert('단어는 1~12글자로 입력하세요.');
        return;
      }
      graphState.words = newWords;
      graphSaveState();
      graphRender();   /* 엔진 재계산·렌더 포함 → 채워진 글자로 추론/충돌 즉시 반영 */
      wordTextInput.value = '';
      wordTextInput.focus();
    };
    addWordTextBtn.addEventListener('click', addByText);
    wordTextInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); addByText(); } });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (!graphState.words.length) return;
      if (!confirm('모든 단어와 규칙을 삭제하시겠습니까?')) return;
      graphWordEdit = null;
      graphResetContent();
      graphSaveState();
      graphRender();
    });
  }
}

/* ---------------- 규칙선(에지) ---------------- */
function graphCellCenter(cellId: string): { x: number; y: number } | null {
  var parts = String(cellId).split('-');
  var wi = parseInt(parts[0], 10), si = parseInt(parts[1], 10);
  var p = graphState.positions[wi] || graphState.positions[String(wi)];
  if (!p) return null;
  return {
    x: p.x + GRAPH_BOX_PAD_X + si * (GRAPH_CELL_W + GRAPH_CELL_GAP) + GRAPH_CELL_W / 2,
    y: p.y + GRAPH_BOX_PAD_TOP + GRAPH_CELL_H / 2
  };
}

/** 셀 중심에서 다른 점을 향하는 방향으로, 셀 경계 위의 점을 구한다 (중심은 클릭/입력용으로 비워둠). */
function graphCellEdgePoint(cellId: string, towardX: number, towardY: number): { x: number; y: number } | null {
  var c = graphCellCenter(cellId);
  if (!c) return null;
  var hw = GRAPH_CELL_W / 2, hh = GRAPH_CELL_H / 2;
  var dx = towardX - c.x, dy = towardY - c.y;
  if (dx === 0 && dy === 0) return c;
  var sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  var sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  var s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

let graphSelectedRuleIdx: number | null = null;

/** SVG 캔버스에 규칙선을 그린다 (박스 위에 오버레이). */
function graphRenderEdges(): void {
  const svg = document.querySelector<SVGSVGElement>('svg.graph-canvas');
  if (!svg) return;
  /* 기존 에지 제거 (중복 방지 — 단독 호출 가능) */
  svg.querySelectorAll('g.graph-edge').forEach(function(g){ g.remove(); });
  /* 규칙선 숨김 모드: 선만 그리지 않음 (규칙·추론·셀 표시는 유지) */
  if (graphState.showEdges === false) return;
  /* arrowhead marker (gojuon_next 방향용) 1회 정의 */
  if (!svg.querySelector('defs#graph-defs')){
    var defs = document.createElementNS(NS, 'defs');
    defs.setAttribute('id', 'graph-defs');
    ['#ea580c', '#ef4444', '#0d9488', '#ca8a04'].forEach(function(col){
      var mk = document.createElementNS(NS, 'marker');
      mk.setAttribute('id', 'graph-arrow-' + col.replace('#', ''));
      mk.setAttribute('viewBox', '0 0 10 10'); mk.setAttribute('refX', '9'); mk.setAttribute('refY', '5');
      mk.setAttribute('markerWidth', '6'); mk.setAttribute('markerHeight', '6'); mk.setAttribute('orient', 'auto-start-reverse');
      var pth = document.createElementNS(NS, 'path');
      pth.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); pth.setAttribute('fill', col);
      mk.appendChild(pth); defs.appendChild(mk);
    });
    svg.insertBefore(defs, svg.firstChild);
  }
  graphState.rules.forEach(function(r, ri){
    var ca = graphCellCenter(r.sourceCell), cb = graphCellCenter(r.targetCell);
    if (!ca || !cb) return;
    var def = GRAPH_RULE_DEFS[r.ruleType] || { color: '#888', directed: false, colorIroha: undefined, colorAlpha: undefined };
    var viol = !!graphEngine.ruleViol[ri];
    var isSeq = (r.ruleType === 'gojuon_next');
    var baseCol = !isSeq ? def.color
      : r.order === 'iroha' ? (def.colorIroha || def.color)
      : r.order === 'alphabet' ? (def.colorAlpha || def.color)
      : def.color;
    var col = viol ? '#ef4444' : baseCol;
    var sameWord = (String(r.sourceCell).split('-')[0] === String(r.targetCell).split('-')[0]);

    var d: string, labelX: number, labelY: number;
    if (sameWord){
      /* 같은 단어 내: 글자를 가로지르지 않도록 셀 위로 곡선(arc)으로 우회 */
      var aT = { x: ca.x, y: ca.y - GRAPH_CELL_H / 2 };
      var bT = { x: cb.x, y: cb.y - GRAPH_CELL_H / 2 };
      var midX = (aT.x + bT.x) / 2;
      var span = Math.abs(bT.x - aT.x);
      var bow = Math.min(70, 20 + span * 0.4);
      var ctrlY = Math.min(aT.y, bT.y) - bow;
      d = 'M ' + aT.x + ' ' + aT.y + ' Q ' + midX + ' ' + ctrlY + ' ' + bT.x + ' ' + bT.y;
      labelX = midX; labelY = ctrlY + bow * 0.45;
    } else {
      /* 단어 간: 셀 경계 앵커 직선 (중심은 클릭/입력용으로 비움) */
      var a = graphCellEdgePoint(r.sourceCell, cb.x, cb.y)!;
      var b = graphCellEdgePoint(r.targetCell, ca.x, ca.y)!;
      d = 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
      labelX = (a.x + b.x) / 2; labelY = (a.y + b.y) / 2 - 7;
    }

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'graph-edge' + (graphSelectedRuleIdx === ri ? ' sel' : ''));
    g.setAttribute('data-rule-idx', String(ri));
    /* 넓은 투명 히트 영역 (클릭/터치 쉽게) */
    var hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14'); hit.setAttribute('cursor', 'pointer');
    g.appendChild(hit);
    /* 보이는 선 */
    var ln = document.createElementNS(NS, 'path');
    ln.setAttribute('d', d); ln.setAttribute('fill', 'none');
    ln.setAttribute('stroke', col);
    ln.setAttribute('stroke-width', graphSelectedRuleIdx === ri ? '4' : '2.5');
    ln.setAttribute('stroke-linecap', 'round');
    if (viol) ln.setAttribute('stroke-dasharray', '6 4');
    else if (r.ruleType === 'same_char_dakuten') ln.setAttribute('stroke-dasharray', '5 3'); /* 탁점 떼기: 점선 */
    else if (r.ruleType === 'same_char' && graphState.looseSmallLarge) ln.setAttribute('stroke-dasharray', '5 3'); /* 작은⇄큰 모드: 점선 */
    ln.setAttribute('pointer-events', 'none');
    if (def.directed) ln.setAttribute('marker-end', 'url(#graph-arrow-' + col.replace('#', '') + ')');
    g.appendChild(ln);
    /* 시퀀스 규칙 라벨: 이로하·알파벳이거나 step>1 일 때 "い+N" / "A+N" / "+N" 표시 */
    if (isSeq && (r.order === 'iroha' || r.order === 'alphabet' || (r.step || 1) > 1)){
      var txt = (r.order === 'iroha' ? 'い' : r.order === 'alphabet' ? 'A' : '') + '+' + (r.step || 1);
      var lw = 9 + txt.length * 6;
      var bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', String(labelX - lw / 2)); bg.setAttribute('y', String(labelY - 9));
      bg.setAttribute('width', String(lw)); bg.setAttribute('height', '16'); bg.setAttribute('rx', '4');
      bg.setAttribute('fill', 'var(--panel)'); bg.setAttribute('stroke', col); bg.setAttribute('stroke-width', '1');
      bg.setAttribute('pointer-events', 'none');
      g.appendChild(bg);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', String(labelX)); tx.setAttribute('y', String(labelY + 2.5));
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '10'); tx.setAttribute('font-weight', '700');
      tx.setAttribute('fill', col); tx.setAttribute('font-family', 'var(--jp)'); tx.setAttribute('pointer-events', 'none');
      tx.textContent = txt;
      g.appendChild(tx);
    }
    g.addEventListener('click', function(e){ e.stopPropagation(); graphSelectRule(ri, e.clientX, e.clientY); });
    svg.appendChild(g);
  });
}

/** 엔진 결과(추론값·충돌)를 렌더된 셀/슬롯에 반영한다. */
function graphApplyEngineVisuals(): void {
  var val = graphEngine.value, st = graphEngine.state, conf = graphEngine.conflict;
  graphState.words.forEach(function(w){ w.letters.forEach(function(l){
    var cid = l.cellId, v = val[cid] || '', s = st[cid] || '', isConf = !!conf[cid];
    var cellG = document.querySelector('svg.graph-canvas [data-cell-id="' + cid + '"]');
    if (cellG){
      var rect = cellG.querySelector('rect');
      var txt = cellG.querySelector('text.graph-cell-char');
      if (txt){
        txt.textContent = v;
        txt.setAttribute('fill', isConf ? '#ef4444' : (s === 'inferred' ? 'var(--muted)' : 'var(--text)'));
        txt.setAttribute('font-style', s === 'inferred' ? 'italic' : 'normal');
      }
      if (rect){
        if (isConf){ rect.setAttribute('stroke', '#ef4444'); rect.setAttribute('stroke-width', '2.5'); rect.setAttribute('fill', 'rgba(239,68,68,.14)'); }
        else { rect.setAttribute('stroke', 'var(--border)'); rect.setAttribute('stroke-width', '1.5'); rect.setAttribute('fill', s === 'inferred' ? 'rgba(245,158,11,.10)' : 'var(--panel-2)'); }
      }
    }
    var slot = document.querySelector('#graph-word-list [data-cell-id="' + cid + '"]');
    if (slot){
      slot.textContent = v || '_';
      slot.classList.toggle('filled', !!v);
      slot.classList.toggle('graph-inferred', s === 'inferred');
      slot.classList.toggle('graph-conflict', isConf);
    }
  }); });
}

/* ----------------------------------------------------------------
   규칙 연결 모드 (드래그로 셀→셀 잇기) + 규칙 종류 메뉴
   ---------------------------------------------------------------- */
let graphConnectMode = false;

function graphCellIdFromPoint(clientX: number, clientY: number): string | null {
  var el: Element | null = document.elementFromPoint(clientX, clientY);
  while (el && el !== document.body){
    if (el.getAttribute && el.getAttribute('data-cell-id')) return el.getAttribute('data-cell-id');
    el = (el.parentElement || el.parentNode) as Element | null;
  }
  return null;
}

function graphInitConnect(): void {
  var wrap = document.getElementById('graph-canvas-wrap');
  if (!wrap) return;
  var drawing = false, srcCell: string | null = null, tempLine: SVGLineElement | null = null;

  function svgPt(svg: SVGSVGElement, clientX: number, clientY: number){
    var bb = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    return { x: (clientX - bb.left) * (vb.width / (bb.width || 1)), y: (clientY - bb.top) * (vb.height / (bb.height || 1)) };
  }
  wrap.addEventListener('pointerdown', function(e){
    if (!graphConnectMode || e.button === 2) return;
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

export function graphCreateRule(sourceCell: string, targetCell: string, ruleType: RuleType, opts?: { order?: SeqOrder; step?: number }): void {
  var def = GRAPH_RULE_DEFS[ruleType];
  opts = opts || {};
  var order: SeqOrder = opts.order || 'gojuon', step = Math.max(1, Math.floor(Number(opts.step)) || 1);
  /* 중복 방지: 무방향은 양쪽 순서 무시, 방향 규칙은 순서·칸수까지 동일할 때만 중복 */
  var exists = graphState.rules.some(function(r){
    if (r.ruleType !== ruleType) return false;
    if (def.directed) return r.sourceCell === sourceCell && r.targetCell === targetCell && (r.order || 'gojuon') === order && (r.step || 1) === step;
    return (r.sourceCell === sourceCell && r.targetCell === targetCell) || (r.sourceCell === targetCell && r.targetCell === sourceCell);
  });
  if (exists) return;
  var rule: Rule = {
    sourceCell: sourceCell, targetCell: targetCell, ruleType: ruleType,
    ruleClass: def.ruleClass, ruleDirection: def.directed ? 'source_to_target' : null
  };
  if (def.directed){ rule.order = order; rule.step = step; }
  graphState.rules.push(rule);
  graphSaveState();
  graphRender();
}

function graphOpenRuleMenu(sourceCell: string, targetCell: string, clientX: number, clientY: number): void {
  const menu = document.getElementById('graph-rule-menu');
  if (!menu) return;
  menu.innerHTML = '';
  var title = document.createElement('div');
  title.style.cssText = 'font-size:11px; color:var(--muted); padding:2px 8px 6px';
  title.textContent = sourceCell + ' → ' + targetCell;
  menu.appendChild(title);
  /* 단순 규칙 3종 (한 번 클릭) */
  (['same_char', 'same_char_dakuten', 'same_vowel', 'same_consonant'] as RuleType[]).forEach(function(rt){
    var def = GRAPH_RULE_DEFS[rt];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'graph-rule-menu-item';
    btn.innerHTML = '<span class="graph-rule-swatch" style="background:' + def.color + '"></span>' + def.label;
    btn.addEventListener('click', function(){ graphCreateRule(sourceCell, targetCell, rt); graphCloseRuleMenu(); });
    menu.appendChild(btn);
  });
  /* 구분선 */
  var hr = document.createElement('div');
  hr.style.cssText = 'border-top:1px solid var(--border); margin:5px 4px';
  menu.appendChild(hr);
  /* 다음 글자(시퀀스) — 순서 + 칸수 서브폼 */
  var seqBox = document.createElement('div');
  seqBox.style.cssText = 'padding:4px 8px 6px';
  var seqLbl = document.createElement('div');
  seqLbl.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:6px';
  seqLbl.innerHTML = '<span class="graph-rule-swatch" style="background:' + GRAPH_RULE_DEFS.gojuon_next.color + '"></span>다음 글자';
  seqBox.appendChild(seqLbl);
  var orderState: { value: SeqOrder } = { value: 'gojuon' };
  var orderRow = document.createElement('div');
  orderRow.style.cssText = 'display:flex; gap:4px; margin-bottom:6px';
  ([['gojuon', '오십음도'], ['iroha', '이로하'], ['alphabet', '알파벳']] as [SeqOrder, string][]).forEach(function(o){
    var ob = document.createElement('button');
    ob.type = 'button'; ob.textContent = o[1];
    ob.style.cssText = 'flex:1; font:inherit; font-size:12px; padding:4px 6px; border:1px solid var(--border); border-radius:5px; cursor:pointer; color:var(--text); background:' + (o[0] === 'gojuon' ? 'var(--accent-soft)' : 'var(--panel-2)');
    ob.addEventListener('click', function(){
      orderState.value = o[0];
      orderRow.querySelectorAll<HTMLButtonElement>('button').forEach(function(x){ x.style.background = 'var(--panel-2)'; });
      ob.style.background = 'var(--accent-soft)';
    });
    orderRow.appendChild(ob);
  });
  seqBox.appendChild(orderRow);
  var stepRow = document.createElement('div');
  stepRow.style.cssText = 'display:flex; gap:6px; align-items:center';
  var stepLab = document.createElement('span'); stepLab.textContent = '칸수'; stepLab.style.cssText = 'font-size:12px; color:var(--muted)';
  var stepInp = document.createElement('input');
  stepInp.type = 'text'; stepInp.inputMode = 'numeric'; stepInp.maxLength = 2; stepInp.value = '1';
  stepInp.style.cssText = 'width:46px; font:inherit; font-size:13px; padding:3px 5px; border:1px solid var(--border); border-radius:5px; background:var(--panel-2); color:var(--text)';
  stepInp.addEventListener('input', function(){ var a = toAsciiDigits(stepInp.value).replace(/[^0-9]/g, ''); if (a !== stepInp.value) stepInp.value = a; });
  var addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.textContent = '추가'; addBtn.className = 'btn';
  addBtn.style.cssText = 'flex:1; font-size:12px; padding:4px 6px';
  addBtn.addEventListener('click', function(){
    var step = Math.max(1, parseInt(toAsciiDigits(stepInp.value), 10) || 1);
    graphCreateRule(sourceCell, targetCell, 'gojuon_next', { order: orderState.value, step: step });
    graphCloseRuleMenu();
  });
  stepRow.appendChild(stepLab); stepRow.appendChild(stepInp); stepRow.appendChild(addBtn);
  seqBox.appendChild(stepRow);
  menu.appendChild(seqBox);
  var cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'graph-rule-menu-item'; cancel.style.color = 'var(--muted)';
  cancel.textContent = '취소';
  cancel.addEventListener('click', graphCloseRuleMenu);
  menu.appendChild(cancel);

  menu.style.display = 'block';
  var mw = menu.offsetWidth || 180, mh = menu.offsetHeight || 200;
  menu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - mw - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - mh - 4)) + 'px';
}
function graphCloseRuleMenu(): void { var m = document.getElementById('graph-rule-menu'); if (m) m.style.display = 'none'; }

/* ----------------------------------------------------------------
   셀 컨텍스트 메뉴 ('작은 글자만' 칸 토글) — 우클릭 / 길게 누르기
   ---------------------------------------------------------------- */
function graphCloseCellMenu(): void { var m = document.getElementById('graph-cell-menu'); if (m) m.style.display = 'none'; }
export function graphSetCellType(cellId: string, type: CellType): void {
  graphState.words = graphState.words.map(function(w){
    return { index: w.index, charCount: w.charCount, letters: w.letters.map(function(l){
      if (l.cellId !== cellId) return l;
      var nl = Object.assign({}, l, { cellType: type });
      delete nl.smallOnly;  /* 레거시 필드 제거 */
      if (type && nl.char) nl.char = cellTypeConvert(nl.char, type);  /* 타입 지정 시 기존 글자를 해당 형태로 변환 */
      return nl;
    }) };
  });
  graphSaveState();
  graphRender();
}
function graphOpenCellMenu(cellId: string, clientX: number, clientY: number): void {
  const menu = document.getElementById('graph-cell-menu');
  const letter = graphFindLetter(cellId);
  if (!menu || !letter) return;
  graphCloseRuleMenu();
  menu.innerHTML = '';
  var title = document.createElement('div');
  title.style.cssText = 'font-size:11px; color:var(--muted); padding:2px 8px 6px';
  title.textContent = '칸 ' + cellId;
  menu.appendChild(title);
  ([['', '일반 칸'], ['small', '작은 글자만 (ぁぃゃっ…)'], ['dakuten', '탁점만 (がざだば…)'], ['handakuten', '반탁점만 (ぱぴぷぺぽ)']] as [CellType, string][]).forEach(function(opt){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'graph-rule-menu-item';
    var cur = (letter.cellType || '') === opt[0];
    b.innerHTML = (cur ? '◉' : '○') + ' ' + opt[1];
    b.addEventListener('click', function(){ graphSetCellType(cellId, opt[0]); graphCloseCellMenu(); });
    menu.appendChild(b);
  });
  var cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'graph-rule-menu-item'; cancel.style.color = 'var(--muted)';
  cancel.textContent = '취소';
  cancel.addEventListener('click', graphCloseCellMenu);
  menu.appendChild(cancel);
  menu.style.display = 'block';
  var mw = menu.offsetWidth || 210, mh = menu.offsetHeight || 110;
  menu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - mw - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - mh - 4)) + 'px';
}

/* ----------------------------------------------------------------
   규칙선 선택 · 삭제
   ---------------------------------------------------------------- */
/** 규칙 인스턴스의 사람용 라벨 (종류 + 순서/칸수) */
function graphRuleLabel(r: Rule | undefined): string {
  if (!r) return '';
  if (r.ruleType === 'same_char') return graphState.looseSmallLarge ? '같은 글자 (작은⇄큰)' : '같은 글자';
  if (r.ruleType === 'same_char_dakuten') return '같은 글자 (탁점 떼기)' + (graphState.looseSmallLarge ? ' +작은⇄큰' : '');
  if (r.ruleType === 'same_vowel') return '모음 같음';
  if (r.ruleType === 'same_consonant') return '자음 같음';
  if (r.ruleType === 'gojuon_next'){
    var seqName = r.order === 'iroha' ? '이로하' : r.order === 'alphabet' ? '알파벳' : '오십음도';
    return seqName + ' 다음' + ((r.step || 1) > 1 ? ' +' + r.step : '') + (graphState.seqWrap ? ' (순환)' : '');
  }
  return r.ruleType;
}

/** 색상↔규칙 범례 렌더 (다음 글자=화살표, 작은⇄큰 모드면 같은 글자=점선) */
function graphRenderLegend(): void {
  var el = document.getElementById('graph-legend');
  if (!el) return;
  function lineSwatch(color: string, dash: boolean, arrow: boolean){
    return '<svg width="36" height="12" style="flex-shrink:0">' +
      '<line x1="2" y1="6" x2="' + (arrow ? 27 : 34) + '" y2="6" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"' + (dash ? ' stroke-dasharray="5 3"' : '') + '/>' +
      (arrow ? '<path d="M27 2 L34 6 L27 10 z" fill="' + color + '"/>' : '') + '</svg>';
  }
  function item(swatch: string, label: string){
    return '<span style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--muted); margin-right:14px">' + swatch + '<span>' + label + '</span></span>';
  }
  var loose = !!graphState.looseSmallLarge;
  el.innerHTML =
    item(lineSwatch('#2563eb', loose, false), '같은 글자' + (loose ? ' (작은⇄큰)' : '')) +
    item(lineSwatch('#0891b2', true, false), '같은 글자 (탁점 떼기)') +
    item(lineSwatch('#16a34a', false, false), '모음 같음') +
    item(lineSwatch('#9333ea', false, false), '자음 같음') +
    item(lineSwatch('#ea580c', false, true), '오십음도 다음' + (graphState.seqWrap ? ' (순환)' : '')) +
    item(lineSwatch('#0d9488', false, true), '이로하 다음' + (graphState.seqWrap ? ' (순환)' : '')) +
    item(lineSwatch('#ca8a04', false, true), '알파벳 다음' + (graphState.seqWrap ? ' (순환)' : '')) +
    item(lineSwatch('#ef4444', true, false), '규칙 위반') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #0ea5e9; border-radius:3px"></span>', '작은 칸 小') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #7c3aed; border-radius:3px"></span>', '탁점 칸 濁') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #db2777; border-radius:3px"></span>', '반탁점 칸 半');
}

/** 열려 있는 규칙선 팝업의 라벨 갱신 — 전역 옵션 토글로 라벨·위반 상태가 바뀔 수 있음 */
function graphRefreshEdgePopLabel(): void {
  var pop = document.getElementById('graph-edge-pop');
  if (!pop || pop.style.display === 'none' || graphSelectedRuleIdx === null) return;
  var lbl = document.getElementById('graph-edge-label');
  var r = graphState.rules[graphSelectedRuleIdx];
  if (!lbl || !r) return;
  var viol = !!graphEngine.ruleViol[graphSelectedRuleIdx];
  var col = viol ? '#ef4444'
    : (r.ruleType === 'gojuon_next' && r.order === 'iroha') ? GRAPH_RULE_DEFS.gojuon_next.colorIroha
    : (r.ruleType === 'gojuon_next' && r.order === 'alphabet') ? GRAPH_RULE_DEFS.gojuon_next.colorAlpha
    : ((GRAPH_RULE_DEFS[r.ruleType] || {}).color || '#888');
  lbl.innerHTML = '<span class="graph-rule-swatch" style="background:' + col + '"></span>' + graphRuleLabel(r) + (viol ? ' · ⚠️ 위반' : '');
}

function graphSelectRule(ri: number, clientX: number, clientY: number): void {
  graphSelectedRuleIdx = ri;
  graphRender();
  var pop = document.getElementById('graph-edge-pop');
  if (pop){
    pop.style.display = 'flex';
    graphRefreshEdgePopLabel();
    var pw = pop.offsetWidth || 120;
    pop.style.left = Math.max(4, Math.min(clientX, window.innerWidth - pw - 4)) + 'px';
    pop.style.top = Math.max(4, (clientY - 52)) + 'px';
  }
}
function graphDeleteSelectedRule(): void {
  if (graphSelectedRuleIdx === null) return;
  graphState.rules.splice(graphSelectedRuleIdx, 1);
  graphSelectedRuleIdx = null;
  var pop = document.getElementById('graph-edge-pop'); if (pop) pop.style.display = 'none';
  graphSaveState();
  graphRender();
}
function graphClearRuleSelection(): void {
  if (graphSelectedRuleIdx === null) return;
  graphSelectedRuleIdx = null;
  var pop = document.getElementById('graph-edge-pop'); if (pop) pop.style.display = 'none';
  graphRender();
}

/* ---------------- 초기화 ---------------- */
export function graphInit(): void {
  graphLoadState();
  graphInitForm();
  graphInitConnect();     /* AC2: 규칙 연결 모드 */
  graphInitCellEditor();  /* Sub-AC 5: 셀 편집기 초기화 */

  /* 규칙 연결 모드 토글 */
  const connectBtn = document.getElementById('graphConnectToggle');
  var connectHint = document.getElementById('graphConnectHint');
  var canvasWrap = document.getElementById('graph-canvas-wrap');
  if (connectBtn) {
    connectBtn.addEventListener('click', function() {
      graphConnectMode = !graphConnectMode;
      connectBtn.classList.toggle('on', graphConnectMode);
      connectBtn.setAttribute('aria-pressed', String(graphConnectMode));
      connectBtn.textContent = graphConnectMode ? '🔗 규칙 연결: 켬' : '🔗 규칙 연결: 끔';
      if (connectHint) connectHint.style.display = graphConnectMode ? '' : 'none';
      if (canvasWrap) canvasWrap.classList.toggle('connect-mode', graphConnectMode);
      graphCloseRuleMenu(); graphClearRuleSelection();
    });
  }

  /* 작은⇄큰 같은 글자 전역 토글 */
  const looseBtn = document.getElementById('graphLooseToggle');
  if (looseBtn) {
    var syncLoose = function() {
      looseBtn.classList.toggle('on', !!graphState.looseSmallLarge);
      looseBtn.setAttribute('aria-pressed', String(!!graphState.looseSmallLarge));
      looseBtn.textContent = '작은⇄큰 같은 글자: ' + (graphState.looseSmallLarge ? '켬' : '끔');
    };
    syncLoose();
    looseBtn.addEventListener('click', function() {
      graphState.looseSmallLarge = !graphState.looseSmallLarge;
      graphSaveState();
      syncLoose();
      graphRender();
      graphRefreshEdgePopLabel();
    });
  }

  /* '다음 글자' 순환(끝→처음) 전역 토글 */
  const wrapBtn = document.getElementById('graphWrapToggle');
  if (wrapBtn) {
    var syncWrap = function() {
      wrapBtn.classList.toggle('on', !!graphState.seqWrap);
      wrapBtn.setAttribute('aria-pressed', String(!!graphState.seqWrap));
      wrapBtn.textContent = '순환 ん→あ: ' + (graphState.seqWrap ? '켬' : '끔');
    };
    syncWrap();
    wrapBtn.addEventListener('click', function() {
      graphState.seqWrap = !graphState.seqWrap;
      graphSaveState();
      syncWrap();
      graphRender();
      graphRefreshEdgePopLabel();
    });
  }

  /* 규칙선 표시/숨김 전역 토글 — 숨겨도 규칙·추론은 유지 */
  const edgesBtn = document.getElementById('graphEdgesToggle');
  if (edgesBtn) {
    var syncEdges = function() {
      edgesBtn.classList.toggle('on', graphState.showEdges !== false);
      edgesBtn.setAttribute('aria-pressed', String(graphState.showEdges !== false));
      edgesBtn.textContent = '규칙선 표시: ' + (graphState.showEdges !== false ? '켬' : '끔');
    };
    syncEdges();
    edgesBtn.addEventListener('click', function() {
      graphState.showEdges = graphState.showEdges === false;
      graphSaveState();
      syncEdges();
      if (graphState.showEdges === false) graphClearRuleSelection();  /* 선이 없으면 선택·팝업도 닫기 */
      graphRender();
    });
  }

  /* 규칙선 삭제 팝업 버튼 */
  var edgeDelBtn = document.getElementById('graph-edge-del');
  if (edgeDelBtn) edgeDelBtn.addEventListener('click', function(e) { e.stopPropagation(); graphDeleteSelectedRule(); });

  /* 바깥 클릭 시 메뉴/규칙선 선택 닫기 */
  document.addEventListener('pointerdown', function(e) {
    var t = e.target as Element;
    if (!(t.closest && t.closest('#graph-rule-menu'))) graphCloseRuleMenu();
    if (!(t.closest && t.closest('#graph-cell-menu'))) graphCloseCellMenu();
    if (!(t.closest && (t.closest('#graph-edge-pop') || t.closest('.graph-edge')))) graphClearRuleSelection();
  });

  /* Delete/Backspace 로 선택된 규칙선 삭제 (입력 중이 아닐 때) */
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && graphSelectedRuleIdx !== null) {
      var t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      graphDeleteSelectedRule();
    }
  });
}

