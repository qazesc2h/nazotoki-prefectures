/* 규칙 그래프 — 규칙 엔진 (순수 함수, DOM 비의존)
   음운 판정 · 오십음도/이로하/알파벳 순서 · 칸 타입 · 제약 전파 · 검증 */
import { toAsciiLetters, isSmallKana, baseChar, smallForm, isDakuten, isHandakuten, stripDiacritic, addDakuten, addHandakuten } from '../shared/kana';
import type { Word, Rule, RuleType, SeqOrder } from './model';

export type CellType = '' | 'small' | 'dakuten' | 'handakuten';
/** 탁음 '다음 글자' 처리: row = 각 행 안에서만(기본) / dakuten = が→ざ→だ→ば 행을 이어서 / dakuten_handakuten = …→ば→ぱ 까지 */
export type VoicedChain = 'row' | 'dakuten' | 'dakuten_handakuten';
export const VOICED_CHAIN_ORDER: VoicedChain[] = ['row', 'dakuten', 'dakuten_handakuten'];
export const VOICED_CHAIN_LABEL: Record<VoicedChain, string> = { row: '행 안에서만', dakuten: 'が→ざ→だ→ば 이어서', dakuten_handakuten: 'が→ざ→だ→ば→ぱ 이어서' };

/* 오십음도 선형 시퀀스 (기본 청음 46자) */
export var GRAPH_GOJUON = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
/* 탁음·반탁음 행 — '다음 글자'는 같은 자음 행 안에서 あいうえお 순서로만 연결 (요·촉·장음·ん 은 위치 없음) */
export var GRAPH_GOJUON_VOICED = ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'];

/* 이로하(いろは) 순서 (고전 47자) — '다음 글자' 규칙의 대체 순서 */
export var GRAPH_IROHA = 'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす';
/* 알파벳 순서 (a~z) — '다음 글자' 규칙의 대체 순서. 대소문자 구분 없이 찾는다. */
export var GRAPH_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
export function graphSeqStr(order: SeqOrder): string { return order === 'iroha' ? GRAPH_IROHA : order === 'alphabet' ? GRAPH_ALPHABET : GRAPH_GOJUON; }
/** 시퀀스 내 인덱스 이동. wrap 이면 끝→처음으로 감아 돌고, 아니면 범위 밖일 때 -1. */
export function seqIdxStep(i: number, step: number, len: number, wrap: boolean): number {
  var j = i + step;
  if (wrap){ j %= len; return j < 0 ? j + len : j; }
  return (j < 0 || j >= len) ? -1 : j;
}
/** 시퀀스(order)에서 ch 로부터 step 칸 떨어진 글자. 시퀀스에 없거나 (순환 끔일 때) 범위를 벗어나면 null.
 *  gojuon: 청음은 선형(행을 넘어감), 탁음·반탁음은 같은 자음 행 안에서만 이동.
 *  alphabet: 대소문자 구분 없이 찾고, 결과는 기준 글자의 대소문자를 따른다. */
export function seqStepChar(ch: string, order: SeqOrder, step: number, wrap: boolean, voiced: VoicedChain = 'row'): string | null {
  if (order === 'gojuon'){
    var i = GRAPH_GOJUON.indexOf(ch);
    if (i >= 0){ var j = seqIdxStep(i, step, GRAPH_GOJUON.length, wrap); return j < 0 ? null : GRAPH_GOJUON[j]; }
    /* 탁음표를 작은 오십음도로 보는 출제: が행→ざ행→だ행→ば행(→ぱ행)을 하나의 순서로 잇는다. 청음표와는 섞지 않는다. */
    if (voiced !== 'row'){
      var chainRows = voiced === 'dakuten_handakuten' ? GRAPH_GOJUON_VOICED.slice(0, 5) : GRAPH_GOJUON_VOICED.slice(0, 4);
      var seq = chainRows.join('');
      var vi = seq.indexOf(ch);
      if (vi >= 0){ var vj = seqIdxStep(vi, step, seq.length, wrap); return vj < 0 ? null : seq[vj]; }
    }
    for (var r = 0; r < GRAPH_GOJUON_VOICED.length; r++){
      var row = GRAPH_GOJUON_VOICED[r], k = row.indexOf(ch);
      if (k >= 0){ var m = seqIdxStep(k, step, row.length, wrap); return m < 0 ? null : row[m]; }
    }
    return null;
  }
  if (order === 'alphabet'){
    var half = toAsciiLetters(ch), lo = half.toLowerCase();
    var ai = lo.length === 1 ? GRAPH_ALPHABET.indexOf(lo) : -1;
    if (ai < 0) return null;
    var aj = seqIdxStep(ai, step, GRAPH_ALPHABET.length, wrap);
    if (aj < 0) return null;
    return half === lo ? GRAPH_ALPHABET[aj] : GRAPH_ALPHABET[aj].toUpperCase();
  }
  /* iroha (선형) */
  var ii = GRAPH_IROHA.indexOf(ch);
  if (ii < 0) return null;
  var jj = seqIdxStep(ii, step, GRAPH_IROHA.length, wrap);
  return jj < 0 ? null : GRAPH_IROHA[jj];
}
/** 시퀀스 규칙 값 비교: alphabet 은 대소문자(전각 포함) 무시, 그 외 정확 일치 */
export function seqCharEq(a: string, b: string, order: SeqOrder): boolean {
  if (order === 'alphabet') return toAsciiLetters(a).toLowerCase() === toAsciiLetters(b).toLowerCase();
  return a === b;
}


/* 음운(자음·모음) 판정표 — 로마자 기준 (が=g, か=k 구분 등) */
interface Phoneme { consonant: string | null; vowel: string | null; }
var GRAPH_PH: Record<string, Phoneme> = (function(){
  var m: Record<string, Phoneme> = {}, V = ['a','i','u','e','o'];
  function add(chars: string, c: string, vs: string[]){ for (var i = 0; i < chars.length; i++){ m[chars[i]] = { consonant: c, vowel: vs[i] }; } }
  add('あいうえお', '',  V);
  add('かきくけこ', 'k', V);
  add('がぎぐげご', 'g', V);
  add('さしすせそ', 's', V);
  add('ざじずぜぞ', 'z', V);
  add('たちつてと', 't', V);
  add('だぢづでど', 'd', V);
  add('なにぬねの', 'n', V);
  add('はひふへほ', 'h', V);
  add('ばびぶべぼ', 'b', V);
  add('ぱぴぷぺぽ', 'p', V);
  add('まみむめも', 'm', V);
  add('やゆよ', 'y', ['a','u','o']);
  add('らりるれろ', 'r', V);
  add('わを', 'w', ['a','o']);
  /* 발음 기준 자음 보정 */
  m['し'] = { consonant: 'sh', vowel: 'i' };
  m['ち'] = { consonant: 'ch', vowel: 'i' };
  m['つ'] = { consonant: 'ts', vowel: 'u' };
  m['ふ'] = { consonant: 'f',  vowel: 'u' };
  m['じ'] = { consonant: 'j',  vowel: 'i' };
  m['ぢ'] = { consonant: 'j',  vowel: 'i' };
  m['づ'] = { consonant: 'z',  vowel: 'u' };
  m['を'] = { consonant: 'w',  vowel: 'o' };
  m['ん'] = { consonant: 'n',  vowel: null };  /* 모음 비교에서 제외 */
  return m;
})();
var GRAPH_SMALL_V: Record<string, string> = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };

/**
 * 한 칸 글자의 음운을 판정한다.
 * @returns {{consonant: (string|null), vowel: (string|null)}}
 *   consonant/vowel 가 모두 null 이면 비교 불가(っ·ー 등) — excluded.
 */
export function graphPhoneme(ch: string): Phoneme {
  if (!ch) return { consonant: null, vowel: null };
  /* 요음(きゃ 등): 기반 글자 자음 + 작은 글자 모음 */
  if (ch.length === 2 && GRAPH_SMALL_V[ch[1]] !== undefined){
    var base = GRAPH_PH[ch[0]];
    return { consonant: base ? base.consonant : null, vowel: GRAPH_SMALL_V[ch[1]] };
  }
  var p = GRAPH_PH[ch];
  return p ? { consonant: p.consonant, vowel: p.vowel } : { consonant: null, vowel: null };
}

/* 칸 타입(cellType): '' 일반 / small 작은글자 / dakuten 탁점 / handakuten 반탁점 */
export var GRAPH_CELL_TYPE_LABEL: Record<CellType, string> = { '': '일반 칸', 'small': '작은 글자만 (ぁぃゃっ…)', 'dakuten': '탁점만 (がざだば…)', 'handakuten': '반탁점만 (ぱぴぷぺぽ)' };
export var GRAPH_CELL_TYPE_BADGE: Record<string, string> = { 'small': '小', 'dakuten': '濁', 'handakuten': '半' };
export function cellTypeConvert(ch: string, type: CellType): string {
  if (!ch || !type) return ch;
  if (type === 'small') return smallForm(ch);
  if (type === 'dakuten') return addDakuten(ch);
  if (type === 'handakuten') return addHandakuten(ch);
  return ch;
}
export function cellTypeOk(ch: string, type: CellType): boolean {
  if (!ch || !type) return true;
  if (type === 'small') return isSmallKana(ch);
  if (type === 'dakuten') return isDakuten(ch);
  if (type === 'handakuten') return isHandakuten(ch);
  return true;
}

/* 규칙 종류 정의: 라벨 · 색 · 부류(값 생성/검증) · 방향성 */
export interface RuleDef { label: string; color: string; colorIroha?: string; colorAlpha?: string; ruleClass: 'derivation' | 'validation'; directed: boolean; }
export var GRAPH_RULE_DEFS: Record<RuleType, RuleDef> = {
  same_char:         { label: '같은 글자',           color: '#2563eb', ruleClass: 'derivation', directed: false },
  same_char_dakuten: { label: '같은 글자 (탁점 떼기)', color: '#0891b2', ruleClass: 'derivation', directed: false },
  same_vowel:     { label: '모음 같음',         color: '#16a34a', ruleClass: 'validation', directed: false },
  same_consonant: { label: '자음 같음',         color: '#9333ea', ruleClass: 'validation', directed: false },
  gojuon_next:    { label: '다음 글자',          color: '#ea580c', colorIroha: '#0d9488', colorAlpha: '#ca8a04', ruleClass: 'derivation', directed: true },
};

/** 엔진 계산 결과 (저장하지 않음 — 매번 재계산) */
export interface EngineResult {
  value: Record<string, string>;                      /* 셀별 표시값(사용자값 또는 추론값) */
  state: Record<string, '' | 'user' | 'inferred'>;
  conflict: Record<string, boolean>;                  /* 셀 충돌(빨강) */
  ruleViol: Record<number, boolean>;                  /* 규칙 인덱스별 위반 */
}
export interface EngineOpts { looseSmallLarge: boolean; seqWrap: boolean; voicedChain?: VoicedChain; }

/**
 * 제약 엔진 계산: 사용자 입력값으로부터 추론값·충돌·규칙 위반을 산출한다.
 * - same_char: 동치 그룹(union-find) 추이적 전파, 그룹 내 사용자값 모순 시 충돌(빨강)
 * - gojuon_next: 방향(앞→다음) next/prev 양방향 자동 채움 (종료 보장 고정점)
 * - same_vowel/same_consonant: 검증 전용 — 위반 시 규칙 빨강 (비교불가 칸 제외)
 */
export function computeEngine(words: Word[], rulesIn: Rule[], opts: EngineOpts): EngineResult {
  var userChar: Record<string, string> = {}, allCells: string[] = [];
  var wrap = !!opts.seqWrap;
  var voiced: VoicedChain = opts.voicedChain || 'row';
  var cellSet: Record<string, true> = {};
  words.forEach(function(w){ w.letters.forEach(function(l){ cellSet[l.cellId] = true; }); });
  words.forEach(function(w){
    w.letters.forEach(function(l){
      allCells.push(l.cellId);
      if (l.source === 'user' && l.char) userChar[l.cellId] = l.char;
    });
  });
  var value: Record<string, string> = {}, st: Record<string, '' | 'user' | 'inferred'> = {}, conflict: Record<string, boolean> = {}, ruleViol: Record<number, boolean> = {};
  allCells.forEach(function(c){ if (userChar[c]) { value[c] = userChar[c]; st[c] = 'user'; } else { st[c] = ''; } });

  /* 유효한 규칙만 (양 끝 셀 존재) — 원본 인덱스(_idx) 보존 */
  interface ERule { sourceCell: string; targetCell: string; ruleType: RuleType; order: SeqOrder; step: number; _idx: number; }
  var rules: ERule[] = [];
  rulesIn.forEach(function(r, idx){
    if (cellSet[r.sourceCell] && cellSet[r.targetCell]) {
      rules.push({ sourceCell: r.sourceCell, targetCell: r.targetCell, ruleType: r.ruleType, order: r.order || 'gojuon', step: r.step || 1, _idx: idx });
    }
  });

  /* 셀별 '작은 글자만' 속성 */
  var cellType: Record<string, CellType> = {};
  words.forEach(function(w){ w.letters.forEach(function(l){ cellType[l.cellId] = l.cellType || ''; }); });

  /* 전역 옵션: 작은⇄큰 같은 글자로 취급(켬) vs 엄격(정확히 동일, 끔) */
  var loose = !!opts.looseSmallLarge;
  function graphKey(ch: string): string { return loose ? baseChar(ch) : ch; }                              /* '같은 글자' 비교 키 (작은⇄큰만 정규화) */
  function stripKey(ch: string): string { var b = stripDiacritic(ch); return loose ? baseChar(b) : b; } /* '탁점 떼기' 비교 키 (청음 베이스) */

  /* --- 같은 글자(정확) 동치 그룹 (union-find) — 탁점 떼기는 그룹에 넣지 않음 --- */
  var parent: Record<string, string> = {}; allCells.forEach(function(c){ parent[c] = c; });
  function find(x: string): string { while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a: string, b: string){ var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  rules.forEach(function(r){ if (r.ruleType === 'same_char') union(r.sourceCell, r.targetCell); });

  /* --- 추론 고정점 전파: 정확 동치 그룹 + 다음 글자 + 탁점 떼기 (선별로 의미가 다르므로 매 반복 재평가) --- */
  for (var iter = 0; iter < 60; iter++){
    var changed = false;
    /* (a) 정확 same_char 그룹: 그룹에 값이 하나라도 있으면 빈 칸을 그 키로 채움 */
    var gKeys: Record<string, Record<string, true>> = {};
    allCells.forEach(function(c){ if (value[c] !== undefined){ var root = find(c); (gKeys[root] = gKeys[root] || {})[graphKey(value[c])] = true; } });
    allCells.forEach(function(c){
      if (value[c] !== undefined) return;
      var gk = gKeys[find(c)], ks = gk && Object.keys(gk);
      if (ks && ks.length === 1){ value[c] = cellTypeConvert(ks[0], cellType[c]); st[c] = 'inferred'; changed = true; }
    });
    /* (b) 다음 글자(gojuon/iroha) 양방향 */
    rules.forEach(function(r){
      if (r.ruleType !== 'gojuon_next') return;
      var s = r.sourceCell, t = r.targetCell;
      if (value[s] !== undefined && value[t] === undefined){
        var nx = seqStepChar(value[s], r.order, r.step, wrap, voiced);
        if (nx !== null){ value[t] = nx; if (st[t] !== 'user') st[t] = 'inferred'; changed = true; }
      } else if (value[t] !== undefined && value[s] === undefined){
        var pv = seqStepChar(value[t], r.order, -r.step, wrap, voiced);
        if (pv !== null){ value[s] = pv; if (st[s] !== 'user') st[s] = 'inferred'; changed = true; }
      }
    });
    /* (c) 탁점 떼기: 청음 베이스가 같음 — 빈 칸을 베이스(칸 타입 반영)로 채움 */
    rules.forEach(function(r){
      if (r.ruleType !== 'same_char_dakuten') return;
      var s = r.sourceCell, t = r.targetCell;
      if (value[s] !== undefined && value[t] === undefined){
        value[t] = cellTypeConvert(stripKey(value[s]), cellType[t]); if (st[t] !== 'user') st[t] = 'inferred'; changed = true;
      } else if (value[t] !== undefined && value[s] === undefined){
        value[s] = cellTypeConvert(stripKey(value[t]), cellType[s]); if (st[s] !== 'user') st[s] = 'inferred'; changed = true;
      }
    });
    if (!changed) break;
  }

  /* 정확 same_char 그룹에 서로 다른 키가 섞이면 충돌(빨강) */
  var gKeys2: Record<string, Record<string, true>> = {};
  allCells.forEach(function(c){ if (value[c] !== undefined){ var root = find(c); (gKeys2[root] = gKeys2[root] || {})[graphKey(value[c])] = true; } });
  allCells.forEach(function(c){ var gk = gKeys2[find(c)]; if (value[c] !== undefined && gk && Object.keys(gk).length > 1) conflict[c] = true; });

  /* --- 검증 패스 --- */
  rules.forEach(function(r){
    var s = r.sourceCell, t = r.targetCell, vs = value[s], vt = value[t];
    if (vs === undefined || vt === undefined) return;
    if (r.ruleType === 'same_char'){
      if (graphKey(vs) !== graphKey(vt)) ruleViol[r._idx] = true;
    } else if (r.ruleType === 'same_char_dakuten'){
      if (stripKey(vs) !== stripKey(vt)) ruleViol[r._idx] = true;
    } else if (r.ruleType === 'same_vowel'){
      var a = graphPhoneme(vs), b = graphPhoneme(vt);
      if (a.vowel !== null && b.vowel !== null && a.vowel !== b.vowel) ruleViol[r._idx] = true;
    } else if (r.ruleType === 'same_consonant'){
      var a2 = graphPhoneme(vs), b2 = graphPhoneme(vt);
      if (a2.consonant !== null && b2.consonant !== null && a2.consonant !== b2.consonant) ruleViol[r._idx] = true;
    } else if (r.ruleType === 'gojuon_next'){
      var nx2 = seqStepChar(vs, r.order, r.step, wrap, voiced);
      if (nx2 === null || !seqCharEq(nx2, vt, r.order)) ruleViol[r._idx] = true;
    }
  });

  /* '작은 글자만' 칸에 작은 글자가 아닌 값 → 충돌(빨강) */
  allCells.forEach(function(c){
    if (cellType[c] && value[c] && !cellTypeOk(value[c], cellType[c])) conflict[c] = true;
  });

  return { value: value, state: st, conflict: conflict, ruleViol: ruleViol };
}

/* ----------------------------------------------------------------
   셀 절대 좌표 + 규칙선(에지) 렌더링
   ---------------------------------------------------------------- */
