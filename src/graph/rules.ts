/* 규칙 그래프 — 규칙 라벨 · 범례 · 규칙선 선택/삭제 팝업 */
import type { Rule } from './model';
import { graphState, graphSaveState } from './state';
import { GRAPH_RULE_DEFS } from './engine';
import { graphEngine } from './engine-run';
import { uiState } from './ui-state';
import { graphRender } from './render-hook';

/** 규칙 인스턴스의 사람용 라벨 (종류 + 순서/칸수) */
export function graphRuleLabel(r: Rule | undefined): string {
  if (!r) return '';
  if (r.ruleType === 'same_char') return graphState.looseSmallLarge ? '같은 글자 (작은⇄큰)' : '같은 글자';
  if (r.ruleType === 'same_char_dakuten') return '같은 글자 (탁점 떼기)' + (graphState.looseSmallLarge ? ' +작은⇄큰' : '');
  if (r.ruleType === 'same_vowel') return '모음 같음';
  if (r.ruleType === 'same_consonant') return '자음 같음';
  if (r.ruleType === 'gojuon_next'){
    var seqName = r.order === 'iroha' ? '이로하' : r.order === 'alphabet' ? '알파벳' : '오십음도';
    var voicedNote = (r.order === 'gojuon' && graphState.voicedChain !== 'row') ? ' (탁음 ' + (graphState.voicedChain === 'dakuten_handakuten' ? 'が→ば→ぱ' : 'が→ば') + ' 이어서)' : '';
    return seqName + ' 다음' + ((r.step || 1) > 1 ? ' +' + r.step : '') + (graphState.seqWrap ? ' (순환)' : '') + voicedNote;
  }
  return r.ruleType;
}

/** 색상↔규칙 범례 렌더 (다음 글자=화살표, 작은⇄큰 모드면 같은 글자=점선) */
export function graphRenderLegend(): void {
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
    item(lineSwatch('#ea580c', false, true), '오십음도 다음' + (graphState.seqWrap ? ' (순환)' : '') + (graphState.voicedChain === 'row' ? '' : graphState.voicedChain === 'dakuten_handakuten' ? ' (탁음 が→ば→ぱ 이어서)' : ' (탁음 が→ば 이어서)')) +
    item(lineSwatch('#0d9488', false, true), '이로하 다음' + (graphState.seqWrap ? ' (순환)' : '')) +
    item(lineSwatch('#ca8a04', false, true), '알파벳 다음' + (graphState.seqWrap ? ' (순환)' : '')) +
    item(lineSwatch('#ef4444', true, false), '규칙 위반') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #0ea5e9; border-radius:3px"></span>', '작은 칸 小') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #7c3aed; border-radius:3px"></span>', '탁점 칸 濁') +
    item('<span style="display:inline-block; width:16px; height:12px; border:1.5px dashed #db2777; border-radius:3px"></span>', '반탁점 칸 半');
}

/** 열려 있는 규칙선 팝업의 라벨 갱신 — 전역 옵션 토글로 라벨·위반 상태가 바뀔 수 있음 */
export function graphRefreshEdgePopLabel(): void {
  var pop = document.getElementById('graph-edge-pop');
  if (!pop || pop.style.display === 'none' || uiState.selectedRuleIdx === null) return;
  var lbl = document.getElementById('graph-edge-label');
  var r = graphState.rules[uiState.selectedRuleIdx];
  if (!lbl || !r) return;
  var viol = !!graphEngine.ruleViol[uiState.selectedRuleIdx];
  var col = viol ? '#ef4444'
    : (r.ruleType === 'gojuon_next' && r.order === 'iroha') ? GRAPH_RULE_DEFS.gojuon_next.colorIroha
    : (r.ruleType === 'gojuon_next' && r.order === 'alphabet') ? GRAPH_RULE_DEFS.gojuon_next.colorAlpha
    : ((GRAPH_RULE_DEFS[r.ruleType] || {}).color || '#888');
  lbl.innerHTML = '<span class="graph-rule-swatch" style="background:' + col + '"></span>' + graphRuleLabel(r) + (viol ? ' · ⚠️ 위반' : '');
}

export function graphSelectRule(ri: number, clientX: number, clientY: number): void {
  uiState.selectedRuleIdx = ri;
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

export function graphDeleteSelectedRule(): void {
  if (uiState.selectedRuleIdx === null) return;
  graphState.rules.splice(uiState.selectedRuleIdx, 1);
  uiState.selectedRuleIdx = null;
  var pop = document.getElementById('graph-edge-pop'); if (pop) pop.style.display = 'none';
  graphSaveState();
  graphRender();
}

export function graphClearRuleSelection(): void {
  if (uiState.selectedRuleIdx === null) return;
  uiState.selectedRuleIdx = null;
  var pop = document.getElementById('graph-edge-pop'); if (pop) pop.style.display = 'none';
  graphRender();
}
