/* 규칙 그래프 — 단어/칸 데이터 모델 (순수 함수, DOM 비의존) */
import { kataToHira, toAsciiLetters } from '../shared/kana';
import { cellTypeConvert } from './engine';
import type { CellType } from './engine';

export interface Letter {
  cellId: string;          /* "<wordIndex>-<slotIndex>" */
  char: string;            /* 사용자 입력 글자('' = 빈 칸) */
  source: 'user' | 'inferred';
  cellType: CellType;      /* '' 일반 / small / dakuten / handakuten */
  smallOnly?: boolean;     /* 레거시 저장 필드 (로드 시 cellType 으로 변환) */
}
export interface Word { index: number; charCount: number; letters: Letter[]; }
export type RuleType = 'same_char' | 'same_char_dakuten' | 'same_vowel' | 'same_consonant' | 'gojuon_next';
export type SeqOrder = 'gojuon' | 'iroha' | 'alphabet';
export interface Rule {
  sourceCell: string; targetCell: string; ruleType: RuleType;
  ruleClass?: 'derivation' | 'validation'; ruleDirection?: 'source_to_target' | null;
  order?: SeqOrder; step?: number;
}
export interface Pos { x: number; y: number; }
export type Positions = Record<string | number, Pos>;


/**
 * charCount 유효성 검사: 1~12 정수인지 확인.
 * @param {*} n
 * @returns {boolean}
 */
export function graphValidateCharCount(n: unknown): boolean {
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= 12;
}

/**
 * 새 단어 객체 생성.
 * @param {number} index - 단어 배열 내 위치
 * @param {number} charCount - 글자 수 (1~12)
 * @returns {{index: number, charCount: number, letters: Array<{cellId:string, char:string, source:string}>}}
 */
export function graphCreateWord(index: number, charCount: number): Word {
  const letters: Letter[] = [];
  for (let s = 0; s < charCount; s++) {
    letters.push({ cellId: index + '-' + s, char: '', source: 'user', cellType: '' });
  }
  return { index: index, charCount: charCount, letters: letters };
}

/**
 * 단어 배열에 단어 추가. 성공 시 새 배열 반환, charCount 무효 시 null 반환.
 * 원본 배열은 변경하지 않음(불변).
 * @param {Array} words
 * @param {number} charCount
 * @returns {Array|null}
 */
export function graphAddWord(words: Word[], charCount: number): Word[] | null {
  if (!graphValidateCharCount(charCount)) return null;
  const index = words.length;
  return words.concat([graphCreateWord(index, charCount)]);
}

/**
 * 단어 텍스트를 셀 글자 배열로 분해한다. 카타카나→히라가나 정규화 후 공백류 제거, 코드포인트 단위.
 * (한 셀 = 한 글자 — 셀 편집기 graphCommitCellChar 와 동일한 정규화 규칙)
 * @param {string} text
 * @returns {string[]}
 */
export function graphParseWordChars(text: unknown): string[] {
  const norm = toAsciiLetters(kataToHira(String(text == null ? '' : text)));
  return Array.from(norm).filter(function(c){ return !/\s/.test(c); });
}

/**
 * 글자가 채워진 단어 객체 생성 (단어 텍스트로 추가할 때).
 * @param {number} index - 단어 배열 내 위치
 * @param {string[]} chars - 셀에 채울 글자 배열 (정규화 완료)
 */
export function graphCreateWordFromChars(index: number, chars: string[]): Word {
  const letters: Letter[] = chars.map(function(ch, s){ return { cellId: index + '-' + s, char: ch, source: 'user', cellType: '' }; });
  return { index: index, charCount: chars.length, letters: letters };
}

/**
 * 단어 텍스트로 단어 추가. 분해한 글자 수가 1~12가 아니면 null 반환(불변).
 * @param {Array} words
 * @param {string} text
 * @returns {Array|null}
 */
export function graphAddWordFromText(words: Word[], text: string): Word[] | null {
  const chars = graphParseWordChars(text);
  if (!graphValidateCharCount(chars.length)) return null;
  return words.concat([graphCreateWordFromChars(words.length, chars)]);
}

/**
 * 지정 인덱스의 단어를 삭제하고 나머지를 재인덱싱한다.
 * 삭제된 단어의 셀을 참조하는 규칙도 제거하고, 나머지 규칙의 cellId를 재매핑한다.
 * @param {Array} words
 * @param {Array} rules
 * @param {number} targetIndex - 삭제할 단어의 인덱스
 * @returns {{words: Array, rules: Array}}
 */
export function graphRemoveWord(words: Word[], rules: Rule[], targetIndex: number): { words: Word[]; rules: Rule[] } {
  /* 삭제 후 남은 단어들을 0-based로 재인덱싱 */
  const filteredWords = words.filter(function(w) { return w.index !== targetIndex; });
  const newWords: Word[] = filteredWords.map(function(w, newIdx): Word {
    return {
      index: newIdx,
      charCount: w.charCount,
      letters: w.letters.map(function(l, s) {
        return { cellId: newIdx + '-' + s, char: l.char, source: l.source, cellType: l.cellType || '' };
      }),
    };
  });

  /* cellId 재매핑 헬퍼: targetIndex 단어 → null, 그 뒤 단어 → 1씩 감소 */
  function remapCellId(cellId: string): string | null {
    const parts = cellId.split('-');
    const wi = Number(parts[0]);
    const si = Number(parts[1]);
    if (wi === targetIndex) return null;
    const newWi = wi > targetIndex ? wi - 1 : wi;
    return newWi + '-' + si;
  }

  const newRules = (rules || [])
    .filter(function(r) {
      return remapCellId(r.sourceCell) !== null && remapCellId(r.targetCell) !== null;
    })
    .map(function(r) {
      return Object.assign({}, r, {
        sourceCell: remapCellId(r.sourceCell) as string,
        targetCell: remapCellId(r.targetCell) as string,
      });
    });

  return { words: newWords, rules: newRules };
}

/**
 * 단어에 걸린(양 끝 중 하나가 이 단어의 칸인) 규칙 수. 삭제 확인 문구용.
 * @param {Array} rules
 * @param {number} wordIndex
 * @returns {number}
 */
export function graphCountWordRules(rules: Rule[], wordIndex: number): number {
  const prefix = String(wordIndex) + '-';
  return (rules || []).filter(function(r) {
    return String(r.sourceCell).indexOf(prefix) === 0 || String(r.targetCell).indexOf(prefix) === 0;
  }).length;
}

/* ---- 단어 입력 모드 (단어 전체를 한 번에 입력) ---- */

/* 빈 칸을 뜻하는 자리표시 글자: 입력에서 이 글자는 '빈 칸(지움)'으로 해석한다 */
export const GRAPH_BLANK_CHARS = '＿_？?○〇◯＊*・･';
export const GRAPH_BLANK_SHOW = '＿';

/**
 * 단어의 사용자 입력 글자를 한 줄 텍스트로 (빈 칸은 ＿). 추론값은 포함하지 않는다
 * — 저장 시 추론값이 사용자 입력으로 굳어지지 않도록.
 * @param {{letters: Array}} w
 * @returns {string}
 */
export function graphWordUserText(w: Word): string {
  return (w.letters || []).map(function(l) { return (l.source === 'user' && l.char) ? l.char : GRAPH_BLANK_SHOW; }).join('');
}

/**
 * 단어 입력 모드 텍스트를 칸별 글자 배열로 분해한다 (빈 칸 자리표시 → '').
 * 카타카나→히라가나, 전각 영문→반각, 공백류 제거. 코드포인트 단위.
 * @param {string} text
 * @returns {string[]} 각 원소는 글자 1개 또는 ''(빈 칸)
 */
export function graphParseWordInput(text: unknown): string[] {
  const norm = toAsciiLetters(kataToHira(String(text == null ? '' : text)));
  return Array.from(norm)
    .filter(function(c) { return !/\s/.test(c); })
    .map(function(c) { return GRAPH_BLANK_CHARS.indexOf(c) >= 0 ? '' : c; });
}

/**
 * 단어 입력 모드 저장 (불변, 순수 함수).
 * - 입력 글자 수 > 칸 수: 칸을 늘린다(기존 규칙은 그대로 유효).
 * - 입력 글자 수 < 칸 수: 뒤쪽 칸은 빈 칸으로 비운다(칸은 유지).
 * - 칸 타입(小/濁/半)은 유지하고 글자를 그 형태로 변환한다.
 * 결과 칸 수가 1~12 범위를 벗어나면 null.
 * @param {Array} words
 * @param {number} wordIndex
 * @param {string[]} chars - graphParseWordInput 결과
 * @returns {Array|null}
 */
export function graphApplyWordChars(words: Word[], wordIndex: number, chars: string[]): Word[] | null {
  const w = words.find(function(x) { return x.index === wordIndex; });
  if (!w) return null;
  const n = Math.max(w.charCount, chars.length);
  if (!graphValidateCharCount(n)) return null;
  const letters: Letter[] = [];
  for (let s = 0; s < n; s++) {
    const old = w.letters[s];
    const type = old ? (old.cellType || '') : '';
    let ch = chars[s] || '';
    if (ch && type) ch = cellTypeConvert(ch, type);
    letters.push({ cellId: wordIndex + '-' + s, char: ch, source: 'user', cellType: type });
  }
  return words.map(function(x) {
    if (x.index !== wordIndex) return x;
    return { index: x.index, charCount: n, letters: letters };
  });
}

/* ---- 칸 조회·갱신 ---- */

/** words 에서 cellId 에 해당하는 letter 객체 (없으면 null) */
export function findLetterIn(words: Word[], cellId: string): Letter | null {
  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi];
    for (var si = 0; si < w.letters.length; si++) {
      if (w.letters[si].cellId === cellId) return w.letters[si];
    }
  }
  return null;
}

/**
 * 단어 배열에서 특정 cellId의 글자를 업데이트한다 (불변, 순수 함수).
 * @param {Array} words
 * @param {string} cellId
 * @param {string} char - 히라가나로 정규화된 단일 글자 (또는 빈 문자열)
 * @param {string} source - 'user' 또는 'inferred'
 * @returns {Array} 새 단어 배열
 */
export function graphUpdateCellChar(words: Word[], cellId: string, char: string, source?: 'user' | 'inferred'): Word[] {
  return words.map(function(w) {
    var hasCell = w.letters.some(function(l) { return l.cellId === cellId; });
    if (!hasCell) return w;
    return Object.assign({}, w, {
      letters: w.letters.map(function(l) {
        if (l.cellId !== cellId) return l;
        return Object.assign({}, l, { char: char, source: source || 'user' }) as Letter;
      }),
    });
  });
}

