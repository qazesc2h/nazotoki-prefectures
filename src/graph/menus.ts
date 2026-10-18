/* 규칙 그래프 — 규칙 종류 선택 메뉴(셀→셀 연결 후) · 셀 컨텍스트 메뉴(칸 타입) · 규칙 생성 */
import { bindNumericInput } from '../shared/inputs';
import type { Rule, RuleType, SeqOrder } from './model';
import { graphState, graphFindLetter, graphSaveState } from './state';
import { GRAPH_RULE_DEFS, cellTypeConvert } from './engine';
import type { CellType } from './engine';
import { graphRender } from './render-hook';

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

export function graphOpenRuleMenu(sourceCell: string, targetCell: string, clientX: number, clientY: number): void {
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
  var readStep = bindNumericInput(stepInp, { min: 1, max: 99, fallback: () => 1 });
  var addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.textContent = '추가'; addBtn.className = 'btn';
  addBtn.style.cssText = 'flex:1; font-size:12px; padding:4px 6px';
  addBtn.addEventListener('click', function(){
    var step = readStep();
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

export function graphCloseRuleMenu(): void { var m = document.getElementById('graph-rule-menu'); if (m) m.style.display = 'none'; }


export function graphCloseCellMenu(): void { var m = document.getElementById('graph-cell-menu'); if (m) m.style.display = 'none'; }

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

export function graphOpenCellMenu(cellId: string, clientX: number, clientY: number): void {
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

