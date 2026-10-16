import { describe, it, expect } from 'vitest';
import { shiriBuildModel, shiriLongestChains, shiriLongestChain, shiriLetters, shiriRawTail, shiriIsDeadEnd } from '../src/shiritori/model';
import type { ShiriOpts } from '../src/shiritori/model';

const OPTS: ShiriOpts = { kataAsHira: true, smallAsLarge: false, ignoreDiacritic: false, longVowel: false, markDeadEnd: true };
const chainsOf = (words: string[], opts: Partial<ShiriOpts> = {}) => {
  const o = { ...OPTS, ...opts };
  return shiriLongestChains(shiriBuildModel(words, o)).chains.map(c => c.map(i => words[i]));
};

describe('글자 추출·규칙', () => {
  it('구두점은 빼고 장음은 유지', () => {
    expect(shiriLetters('コーヒー!')).toEqual(['コ', 'ー', 'ヒ', 'ー']);
    expect(shiriRawTail('コーヒー', OPTS)).toBe('ー');
    expect(shiriRawTail('コーヒー', { ...OPTS, longVowel: true })).toBe('ヒ');
  });
  it('ん/ン 으로 끝나면 막다른 길', () => {
    expect(shiriIsDeadEnd('みかん', OPTS)).toBe(true);
    expect(shiriIsDeadEnd('ペン', OPTS)).toBe(true);
    expect(shiriIsDeadEnd('りんご', OPTS)).toBe(false);
  });
  it('간선: 끝글자 키 = 첫글자 키 (가나 통일·영문 대소문자 무시·탁점 느슨)', () => {
    const m = shiriBuildModel(['りんご', 'ゴリラ', 'Apple', 'elephant'], OPTS);
    expect(m.adj[0]).toEqual([1]);
    expect(m.adj[2]).toEqual([3]);
    expect(m.dead[3]).toBe(false);
    const dia = shiriBuildModel(['かさ', 'ざる'], OPTS);
    expect(dia.adj[0]).toEqual([]);
    expect(shiriBuildModel(['かさ', 'ざる'], { ...OPTS, ignoreDiacritic: true }).adj[0]).toEqual([1]);
  });
  it('막다른 길 옵션을 끄면 ん 뒤로도 이어진다', () => {
    expect(shiriBuildModel(['みかん', 'んま'], OPTS).adj[0]).toEqual([]);
    expect(shiriBuildModel(['みかん', 'んま'], { ...OPTS, markDeadEnd: false }).adj[0]).toEqual([1]);
  });
});

describe('최장 체인', () => {
  it('단일 최장 체인', () => {
    expect(chainsOf(['りんご', 'ごりら', 'らっぱ', 'ぱんつ', 'つき'])).toEqual([['りんご', 'ごりら', 'らっぱ', 'ぱんつ', 'つき']]);
    expect(shiriLongestChain(shiriBuildModel(['りんご', 'ごりら'], OPTS)).chain).toEqual([0, 1]);
  });
  it('같은 길이의 경우의 수를 모두 모은다', () => {
    const cs = chainsOf(['りんご', 'ごりら', 'らっぱ', 'ぱせろ', 'ぱんつ']);
    expect(cs).toHaveLength(2);
    expect(cs.map(c => c[3]).sort()).toEqual(['ぱせろ', 'ぱんつ']);
  });
  it('순환으로 시작점만 다른 체인은 하나로 묶는다', () => {
    expect(chainsOf(['あい', 'いう', 'うあ'])).toHaveLength(1);
    /* 되돌아오지 않는 두 경로는 별개 */
    expect(chainsOf(['あい', 'いう', 'いえ'])).toHaveLength(2);
  });
  it('순환(SCC) 표시', () => {
    const m = shiriBuildModel(['あい', 'いう', 'うあ', 'えお'], OPTS);
    expect(m.inCycle).toEqual([true, true, true, false]);
    expect(m.connected[3]).toBe(false);
  });
  it('빈 입력·이음 없음', () => {
    expect(chainsOf([])).toEqual([]);
    expect(chainsOf(['あか', 'いぬ'])).toHaveLength(2);   /* 길이 1 체인 두 개 (UI 는 2개 이상만 표시) */
  });
});
