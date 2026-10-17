import { describe, it, expect } from 'vitest';
import {
  graphValidateCharCount, graphAddWord, graphAddWordFromText, graphRemoveWord, graphCountWordRules,
  graphWordUserText, graphParseWordInput, graphApplyWordChars, graphUpdateCellChar, findLetterIn,
} from '../src/graph/model';
import type { Word, Rule } from '../src/graph/model';
import { computeEngine, seqStepChar, graphPhoneme, cellTypeConvert, cellTypeOk } from '../src/graph/engine';
import { graphComputeLayout, graphBoxSize, graphBoxesOverlap, graphRemapPositions } from '../src/graph/layout';

const OPTS = { looseSmallLarge: false, seqWrap: false };
const words = (...texts: string[]) => texts.reduce<Word[]>((ws, t) => graphAddWordFromText(ws, t)!, []);
const rule = (s: string, t: string, ruleType: Rule['ruleType'], extra: Partial<Rule> = {}): Rule => ({ sourceCell: s, targetCell: t, ruleType, ...extra });

describe('단어 모델', () => {
  it('글자 수 1~12 만 허용', () => {
    expect(graphValidateCharCount(1)).toBe(true);
    expect(graphValidateCharCount(12)).toBe(true);
    expect(graphValidateCharCount(0)).toBe(false);
    expect(graphValidateCharCount(13)).toBe(false);
    expect(graphValidateCharCount('3')).toBe(true);
    expect(graphValidateCharCount(2.5)).toBe(false);
    expect(graphAddWord([], 13)).toBeNull();
  });

  it('텍스트로 추가: 가타카나→히라가나, 전각 영문→반각, 공백 제거', () => {
    const ws = words('サク ラ', 'Ａpple');
    expect(ws[0].letters.map(l => l.char)).toEqual(['さ', 'く', 'ら']);
    expect(ws[1].letters.map(l => l.char)).toEqual(['A', 'p', 'p', 'l', 'e']);
    expect(ws[1].index).toBe(1);
    expect(ws[1].letters[0].cellId).toBe('1-0');
  });

  it('단어 삭제: 재인덱싱 + 규칙 재매핑 + 칸 타입 유지', () => {
    let ws = words('さくら', 'きって', 'ねこ');
    ws = ws.map(w => w.index === 1 ? { ...w, letters: w.letters.map((l, i) => i === 1 ? { ...l, cellType: 'small' as const } : l) } : w);
    const rules = [rule('0-0', '1-0', 'same_char'), rule('1-1', '2-0', 'same_char'), rule('0-1', '2-1', 'same_vowel')];
    const r = graphRemoveWord(ws, rules, 0);
    expect(r.words.map(w => w.index)).toEqual([0, 1]);
    expect(r.words[0].letters[1].cellType).toBe('small');
    expect(r.words[0].letters[1].cellId).toBe('0-1');
    /* 0번 단어에 걸린 규칙 2개 제거, 나머지는 인덱스 1씩 감소 */
    expect(r.rules).toEqual([rule('0-1', '1-0', 'same_char')]);
  });

  it('단어에 걸린 규칙 수', () => {
    const rules = [rule('0-0', '1-0', 'same_char'), rule('1-1', '2-0', 'same_char'), rule('10-0', '2-1', 'same_vowel')];
    expect(graphCountWordRules(rules, 1)).toBe(2);
    expect(graphCountWordRules(rules, 10)).toBe(1);   /* '1-' 접두어 오인 없음 */
    expect(graphCountWordRules(rules, 3)).toBe(0);
  });

  it('cellId 로 글자 찾기 / 갱신 (불변)', () => {
    const ws = words('さくら');
    expect(findLetterIn(ws, '0-2')?.char).toBe('ら');
    expect(findLetterIn(ws, '9-9')).toBeNull();
    const ws2 = graphUpdateCellChar(ws, '0-1', 'き');
    expect(ws2[0].letters[1].char).toBe('き');
    expect(ws[0].letters[1].char).toBe('く');
  });
});

describe('단어 입력 모드', () => {
  it('사용자 글자만 텍스트로, 빈 칸은 ＿', () => {
    const w = graphAddWord([], 4)![0];
    const w2 = graphUpdateCellChar([w], '0-0', 'さ')[0];
    const w3 = { ...w2, letters: w2.letters.map((l, i) => i === 2 ? { ...l, char: 'ら', source: 'inferred' as const } : l) };
    expect(graphWordUserText(w3)).toBe('さ＿＿＿');
  });

  it('자리표시 글자는 빈 칸으로 해석', () => {
    expect(graphParseWordInput('さ＿ら')).toEqual(['さ', '', 'ら']);
    expect(graphParseWordInput('キ?テ○ガ')).toEqual(['き', '', 'て', '', 'が']);
    expect(graphParseWordInput(' a b ')).toEqual(['a', 'b']);
  });

  it('짧으면 뒤 칸 비움, 길면 칸 확장, 칸 타입 변환 유지, 13자 거부', () => {
    const base = graphAddWord([], 4)!;
    const typed = base.map(w => ({ ...w, letters: w.letters.map((l, i) => i === 1 ? { ...l, cellType: 'small' as const } : l) }));
    const shortW = graphApplyWordChars(typed, 0, ['き', 'つ', 'て'])![0];
    expect(shortW.charCount).toBe(4);
    expect(shortW.letters.map(l => l.char)).toEqual(['き', 'っ', 'て', '']);
    expect(shortW.letters[1].cellType).toBe('small');
    const longW = graphApplyWordChars(typed, 0, ['き', '', 'て', 'が', 'み'])![0];
    expect(longW.charCount).toBe(5);
    expect(longW.letters[4].cellId).toBe('0-4');
    expect(graphApplyWordChars(typed, 0, 'あいうえおかきくけこさしす'.split(''))).toBeNull();
    expect(graphApplyWordChars(typed, 7, ['あ'])).toBeNull();
  });
});

describe('시퀀스(다음 글자)', () => {
  it('오십음도: 청음은 선형, 탁음은 같은 행 안에서만', () => {
    expect(seqStepChar('あ', 'gojuon', 1, false)).toBe('い');
    expect(seqStepChar('お', 'gojuon', 1, false)).toBe('か');
    expect(seqStepChar('ん', 'gojuon', 1, false)).toBeNull();
    expect(seqStepChar('ん', 'gojuon', 1, true)).toBe('あ');
    expect(seqStepChar('ご', 'gojuon', 1, false)).toBeNull();
    expect(seqStepChar('ご', 'gojuon', 1, true)).toBe('が');
    expect(seqStepChar('が', 'gojuon', 2, false)).toBe('ぐ');
    expect(seqStepChar('ゃ', 'gojuon', 1, false)).toBeNull();
  });
  it('탁음 행 잇기: が→ざ→だ→ば(→ぱ), 청음표와는 섞지 않음', () => {
    expect(seqStepChar('ご', 'gojuon', 1, false, 'dakuten')).toBe('ざ');
    expect(seqStepChar('ぞ', 'gojuon', 1, false, 'dakuten')).toBe('だ');
    expect(seqStepChar('ど', 'gojuon', 1, false, 'dakuten')).toBe('ば');
    expect(seqStepChar('ぼ', 'gojuon', 1, false, 'dakuten')).toBeNull();
    expect(seqStepChar('ぼ', 'gojuon', 1, true, 'dakuten')).toBe('が');
    expect(seqStepChar('ぼ', 'gojuon', 1, false, 'dakuten_handakuten')).toBe('ぱ');
    expect(seqStepChar('ぽ', 'gojuon', 1, true, 'dakuten_handakuten')).toBe('が');
    expect(seqStepChar('ざ', 'gojuon', -1, false, 'dakuten')).toBe('ご');
    expect(seqStepChar('が', 'gojuon', 7, false, 'dakuten')).toBe('ず');
    /* ぱ행 미포함 모드에서 ぱ행은 자기 행 안에서만 */
    expect(seqStepChar('ぽ', 'gojuon', 1, false, 'dakuten')).toBeNull();
    expect(seqStepChar('ぽ', 'gojuon', 1, true, 'dakuten')).toBe('ぱ');
    /* 청음·탁음 경계는 어느 모드에서도 넘지 않음 */
    expect(seqStepChar('ん', 'gojuon', 1, true, 'dakuten_handakuten')).toBe('あ');
    expect(seqStepChar('ご', 'gojuon', 1, false, 'row')).toBeNull();
  });
  it('이로하 · 알파벳(대소문자 유지, 전각 허용)', () => {
    expect(seqStepChar('い', 'iroha', 1, false)).toBe('ろ');
    expect(seqStepChar('す', 'iroha', 1, true)).toBe('い');
    expect(seqStepChar('a', 'alphabet', 1, false)).toBe('b');
    expect(seqStepChar('Z', 'alphabet', 1, true)).toBe('A');
    expect(seqStepChar('ｚ', 'alphabet', 1, false)).toBeNull();
  });
  it('음운 판정', () => {
    expect(graphPhoneme('し')).toEqual({ consonant: 'sh', vowel: 'i' });
    expect(graphPhoneme('きゃ')).toEqual({ consonant: 'k', vowel: 'a' });
    expect(graphPhoneme('っ')).toEqual({ consonant: null, vowel: null });
  });
  it('칸 타입 변환·검사', () => {
    expect(cellTypeConvert('つ', 'small')).toBe('っ');
    expect(cellTypeConvert('か', 'dakuten')).toBe('が');
    expect(cellTypeConvert('ば', 'handakuten')).toBe('ぱ');
    expect(cellTypeOk('っ', 'small')).toBe(true);
    expect(cellTypeOk('つ', 'small')).toBe(false);
  });
});

describe('규칙 엔진', () => {
  it('같은 글자: 추이적 전파 + 충돌', () => {
    const ws = words('さ＿＿', '＿＿＿').map(w => ({ ...w, letters: w.letters.map(l => l.char === '＿' ? { ...l, char: '' } : l) }));
    const rules = [rule('0-0', '1-0', 'same_char'), rule('1-0', '1-2', 'same_char')];
    const r = computeEngine(ws, rules, OPTS);
    expect(r.value['1-0']).toBe('さ');
    expect(r.value['1-2']).toBe('さ');
    expect(r.state['1-2']).toBe('inferred');
    const ws2 = graphUpdateCellChar(ws, '1-2', 'き');
    const r2 = computeEngine(ws2, rules, OPTS);
    expect(r2.conflict['0-0']).toBe(true);
    expect(r2.conflict['1-2']).toBe(true);
    /* 키가 두 개 섞인 그룹은 빈 칸(1-0)을 추론하지 않으므로 규칙선 자체는 위반으로 찍히지 않는다 — 셀 충돌(빨강)로 표시 */
    expect(r2.value['1-0']).toBeUndefined();
    expect(r2.ruleViol).toEqual({});
  });

  it('작은⇄큰 옵션 켜면 っ=つ 는 충돌 아님, 칸 타입에 맞춰 추론', () => {
    const ws = words('つ', 'っ');
    const rules = [rule('0-0', '1-0', 'same_char')];
    expect(computeEngine(ws, rules, OPTS).ruleViol[0]).toBe(true);
    expect(computeEngine(ws, rules, { ...OPTS, looseSmallLarge: true }).ruleViol[0]).toBeUndefined();
    const blank = graphAddWord(words('つ'), 1)!.map(w => w.index === 1 ? { ...w, letters: w.letters.map(l => ({ ...l, cellType: 'small' as const })) } : w);
    expect(computeEngine(blank, rules, { ...OPTS, looseSmallLarge: true }).value['1-0']).toBe('っ');
  });

  it('다음 글자: 양방향 추론·검증·순환 옵션', () => {
    const ws = words('あ', '＿').map(w => ({ ...w, letters: w.letters.map(l => l.char === '＿' ? { ...l, char: '' } : l) }));
    const next = [rule('0-0', '1-0', 'gojuon_next', { order: 'gojuon', step: 2 })];
    expect(computeEngine(ws, next, OPTS).value['1-0']).toBe('う');
    const back = computeEngine(words('＿', 'い').map(w => ({ ...w, letters: w.letters.map(l => l.char === '＿' ? { ...l, char: '' } : l) })), [rule('0-0', '1-0', 'gojuon_next')], OPTS);
    expect(back.value['0-0']).toBe('あ');
    const wrapCase = words('ん', 'あ');
    expect(computeEngine(wrapCase, [rule('0-0', '1-0', 'gojuon_next')], OPTS).ruleViol[0]).toBe(true);
    expect(computeEngine(wrapCase, [rule('0-0', '1-0', 'gojuon_next')], { ...OPTS, seqWrap: true }).ruleViol[0]).toBeUndefined();
  });

  it('엔진: 탁음 행 잇기 옵션에 따라 추론·검증이 달라진다', () => {
    const ws = words('ご', 'ざ');
    const next = [rule('0-0', '1-0', 'gojuon_next')];
    expect(computeEngine(ws, next, OPTS).ruleViol[0]).toBe(true);
    expect(computeEngine(ws, next, { ...OPTS, voicedChain: 'dakuten' }).ruleViol[0]).toBeUndefined();
    const blank = words('ど', '＿').map(w => ({ ...w, letters: w.letters.map(l => l.char === '＿' ? { ...l, char: '' } : l) }));
    expect(computeEngine(blank, next, OPTS).value['1-0']).toBeUndefined();
    expect(computeEngine(blank, next, { ...OPTS, voicedChain: 'dakuten' }).value['1-0']).toBe('ば');
  });

  it('탁점 떼기 · 모음/자음 검증 · 비교불가 칸은 통과', () => {
    const ws = words('が', 'か', 'き', 'っ');
    expect(computeEngine(ws, [rule('0-0', '1-0', 'same_char_dakuten')], OPTS).ruleViol[0]).toBeUndefined();
    expect(computeEngine(ws, [rule('0-0', '1-0', 'same_char')], OPTS).ruleViol[0]).toBe(true);
    expect(computeEngine(ws, [rule('1-0', '2-0', 'same_consonant')], OPTS).ruleViol[0]).toBeUndefined();
    expect(computeEngine(ws, [rule('1-0', '2-0', 'same_vowel')], OPTS).ruleViol[0]).toBe(true);
    expect(computeEngine(ws, [rule('1-0', '3-0', 'same_vowel')], OPTS).ruleViol[0]).toBeUndefined();
  });

  it('존재하지 않는 칸을 가리키는 규칙은 무시', () => {
    const r = computeEngine(words('あ'), [rule('0-0', '5-0', 'same_char')], OPTS);
    expect(r.ruleViol).toEqual({});
    expect(r.value['0-0']).toBe('あ');
  });
});

describe('캔버스 레이아웃', () => {
  it('저장된 위치 우선, 나머지는 선반 배치로 겹치지 않음', () => {
    const ws = [...graphAddWord([], 5)!, ...graphAddWord(graphAddWord([], 5)!, 6)!.slice(1), ...graphAddWord(graphAddWord(graphAddWord([], 5)!, 6)!, 4)!.slice(2)];
    const layout = graphComputeLayout(ws, { 0: { x: 100, y: 50 } }, 400);
    expect(layout[0]).toEqual({ x: 100, y: 50 });
    const boxes = ws.map(w => ({ ...layout[w.index], ...graphBoxSize(w.charCount) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(graphBoxesOverlap(boxes[i], boxes[j])).toBe(false);
    expect(boxes[1].y).toBeGreaterThan(50);   /* 저장된 박스 아래 선반부터 */
  });
  it('삭제 후 위치 재매핑', () => {
    expect(graphRemapPositions({ 0: { x: 1, y: 1 }, 1: { x: 2, y: 2 }, 2: { x: 3, y: 3 } }, 1)).toEqual({ 0: { x: 1, y: 1 }, 1: { x: 3, y: 3 } });
  });
});
