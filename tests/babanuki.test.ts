import { describe, it, expect } from 'vitest';
import { babaKey, babaChars, babaCompute } from '../src/babanuki/model';
import type { BabaOpts } from '../src/babanuki/model';

const OPTS: BabaOpts = { rule: 'pair', kataAsHira: true, smallAsLarge: false, ignoreDiacritic: false, ignoreCase: true };
const survivors = (words: string[], opts: Partial<BabaOpts> = {}) => babaCompute(words, { ...OPTS, ...opts }).survivors.map(s => s.ch).join('');

describe('비교 키', () => {
  it('가나 통일 · 작은⇄큰 · 탁점 무시 · 영문 대소문자', () => {
    expect(babaKey('カ', OPTS)).toBe('か');
    expect(babaKey('カ', { ...OPTS, kataAsHira: false })).toBe('カ');
    expect(babaKey('ガ', { ...OPTS, ignoreDiacritic: true })).toBe('か');
    expect(babaKey('ッ', { ...OPTS, smallAsLarge: true })).toBe('つ');
    expect(babaKey('A', OPTS)).toBe('a');
    expect(babaKey('A', { ...OPTS, ignoreCase: false })).toBe('A');
  });
  it('공백은 글자가 아님', () => {
    expect(babaChars('た ぬき')).toEqual(['た', 'ぬ', 'き']);
  });
});

describe('겹침 규칙', () => {
  it('짝만 지우기: 홀수면 첫 등장 1개 남김', () => {
    expect(survivors(['たぬき', 'きつね', 'ねこ'])).toBe('たぬつこ');
    expect(survivors(['あああ'])).toBe('あ');
  });
  it('겹치면 모두 지우기: 1번만 나온 글자만 남김', () => {
    expect(survivors(['たぬき', 'きつね', 'ねこ'], { rule: 'all' })).toBe('たぬつこ');
    expect(survivors(['あああ'], { rule: 'all' })).toBe('');
  });
  it('옵션으로 묶인 글자는 먼저 입력된 형태로 표시', () => {
    expect(survivors(['が', 'か', 'さ'], { ignoreDiacritic: true })).toBe('さ');
    expect(survivors(['Apple', 'pie'], { rule: 'all' })).toBe('Ali');   /* a×2·e×2·p×3 지움, 표시는 원문 대문자 'A' */
  });
});
