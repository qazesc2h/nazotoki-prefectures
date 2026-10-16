/* 규칙 그래프 — 상태 + localStorage 저장/복원 */
import type { Word, Rule, Positions, Letter } from './model';
import { findLetterIn } from './model';

const LS_GRAPH = 'nazotoki-graph-v1';

export interface GraphState {
  words: Word[];
  rules: Rule[];
  positions: Positions;      /* {[wordIndex]: {x,y}} 단어 박스 원점 */
  looseSmallLarge: boolean;  /* 같은 글자 규칙에서 작은⇄큰을 같은 글자로 취급 */
  seqWrap: boolean;          /* '다음 글자' 규칙이 순서의 끝을 넘으면 처음으로 순환 (ん→あ 등) */
  showEdges: boolean;        /* 규칙선 표시 여부 — 끄면 선만 숨기고 규칙·추론은 유지 */
}


export const graphState: GraphState = { words: [], rules: [], positions: {}, looseSmallLarge: false, seqWrap: false, showEdges: true };

/** 현재 상태에서 cellId 의 letter (없으면 null) */
export function graphFindLetter(cellId: string): Letter | null { return findLetterIn(graphState.words, cellId); }

/** 단어·규칙·위치를 비운다 (전역 옵션은 유지) */
export function graphResetContent(): void { graphState.words = []; graphState.rules = []; graphState.positions = {}; }

export function graphLoadState(): void {
  try {
    const raw = localStorage.getItem(LS_GRAPH);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.words)) return;
    graphState.words = parsed.words;
    graphState.rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    graphState.positions = (parsed.positions && typeof parsed.positions === 'object') ? parsed.positions : {};
    graphState.looseSmallLarge = !!parsed.looseSmallLarge;
    graphState.seqWrap = !!parsed.seqWrap;
    graphState.showEdges = parsed.showEdges !== false;  /* 필드 없던 구버전 저장분은 표시(기본값) */
    /* 레거시 same_char_sl 규칙 → same_char 로 통합 */
    graphState.rules.forEach(function(r){ if ((r.ruleType as string) === 'same_char_sl') r.ruleType = 'same_char'; });
    /* 레거시 smallOnly → cellType */
    graphState.words.forEach(function(w){ w.letters.forEach(function(l){ if (l.cellType === undefined) l.cellType = l.smallOnly ? 'small' : ''; }); });
  } catch (e) { /* JSON 파싱 실패 무시 */ }
}

export function graphSaveState(): void {
  /* 추론값(inferred)은 저장하지 않고 로드 시 재계산 — 사용자 입력값만 저장 */
  const toSave = {
    words: graphState.words.map(function(w) {
      return {
        index: w.index,
        charCount: w.charCount,
        letters: w.letters.map(function(l) {
          return {
            cellId: l.cellId,
            char: l.source === 'user' ? l.char : '',
            source: 'user',
            cellType: l.cellType || '',
          };
        }),
      };
    }),
    rules: graphState.rules,
    positions: graphState.positions,
    looseSmallLarge: graphState.looseSmallLarge,
    seqWrap: graphState.seqWrap,
    showEdges: graphState.showEdges,
  };
  localStorage.setItem(LS_GRAPH, JSON.stringify(toSave));
}

