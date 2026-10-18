/* 규칙 그래프 — 오른쪽 단어 목록(밑줄 슬롯) + 단어 입력 모드 + 삭제 */
import { graphRemoveWord, graphCountWordRules, graphWordUserText, graphParseWordInput, graphApplyWordChars } from './model';
import { askConfirm, notify } from '../shared/dialog';
import type { Word } from './model';
import { graphRemapPositions } from './layout';
import { graphState, graphFindLetter, graphSaveState } from './state';
import { graphShowCellEditor, graphHideCellEditor } from './editor';
import { graphApplyEngineVisuals } from './edges';
import { graphRender } from './render-hook';

/** 단어 입력 모드 상태: 열린 단어 인덱스 + 입력 중 임시 텍스트 (재렌더 후 복원용). 저장하지 않음. */
export interface WordEdit { index: number; draft: string | null; }

export let graphWordEdit: WordEdit | null = null;

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

/** 단어 입력 모드를 열거나(index) 닫는다(null). 다른 단어로 바꾸면 이전 임시 입력은 버린다. */
export function graphSetWordEdit(index: number | null): void {
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
export function graphSaveWordEdit(index: number): void {
  var inp = document.getElementById('graph-word-edit-input') as HTMLInputElement | null;
  if (!inp) return;
  var chars = graphParseWordInput(inp.value);
  var newWords = graphApplyWordChars(graphState.words, index, chars);
  if (!newWords) {
    notify('단어는 1~12글자까지 넣을 수 있습니다.');
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
export function graphRenderWordList(): void {
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
      var doRemove = function() {
        if (graphWordEdit && graphWordEdit.index === idx) graphWordEdit = null;
        var result = graphRemoveWord(graphState.words, graphState.rules, idx);
        graphState.words = result.words;
        graphState.rules = result.rules;
        graphState.positions = graphRemapPositions(graphState.positions, idx);
        if (graphWordEdit && graphWordEdit.index > idx) graphWordEdit.index -= 1;   /* 뒤 단어 인덱스가 1씩 당겨짐 */
        graphSaveState();
        graphRender();
      };
      if (userChars > 0 || ruleCount > 0) {
        var shown = graphWordUserText(w);
        var what = [];
        if (userChars > 0) what.push('입력한 글자 ' + userChars + '개');
        if (ruleCount > 0) what.push('연결된 규칙선 ' + ruleCount + '개');
        askConfirm('단어 「' + shown + '」(' + w.charCount + '자)를 삭제할까요?\n' + what.join(' · ') + '가 함께 사라집니다.', { ok: '삭제' }).then(function(ok) { if (ok) doRemove(); });
        return;
      }
      doRemove();
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


/** 단어 입력 모드를 조용히 닫는다 (전체 삭제 등 곧바로 전체 재렌더가 따라올 때) */
export function graphResetWordEdit(): void { graphWordEdit = null; }
