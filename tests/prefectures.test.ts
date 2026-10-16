import { describe, it, expect } from 'vitest';
import { DATA, BY_CODE, F, REGIONS, buildMatcher, sortList } from '../src/prefectures/data';
import { kataToHira, toAsciiDigits, toAsciiLetters, splitWords } from '../src/shared/kana';

describe('도도부현 데이터', () => {
  it('47개 · code 1~47 · 8지방', () => {
    expect(DATA).toHaveLength(47);
    expect(DATA.map(d => d.code)).toEqual([...Array(47)].map((_, i) => i + 1));
    expect(new Set(DATA.map(d => d.region)).size).toBe(REGIONS.length);
    DATA.forEach(d => expect(REGIONS).toContain(d.region));
  });
  it('파생 필드: 접미사 제거 · 글자수 · 현청≠현명', () => {
    expect(BY_CODE[1].name).toBe('北海道');
    expect(BY_CODE[13].name).toBe('東京');
    expect(BY_CODE[13].capName).toBe('新宿');
    expect(BY_CODE[13].capNeq).toBe(true);
    expect(BY_CODE[2].capNeq).toBe(false);
    expect(BY_CODE[1].len).toBe(6);
    expect(DATA.filter(d => d.capNeq)).toHaveLength(19);
  });
  it('모드별 필드', () => {
    expect(F(BY_CODE[1], 'pref').main).toBe('北海道');
    expect(F(BY_CODE[1], 'cap')).toMatchObject({ main: '札幌市', kana: 'さっぽろ', len: 4 });
  });
});

describe('검색 매처', () => {
  it('와일드카드 없음 = 부분일치, 있으면 전체 일치, 전각도 동일', () => {
    expect(buildMatcher('')).toBeNull();
    expect(buildMatcher('やま')!.test('やまがた')).toBe(true);
    expect(buildMatcher('??')!.test('ちば')).toBe(true);
    expect(buildMatcher('??')!.test('ちばけん')).toBe(false);
    expect(buildMatcher('＊やま')!.test('わかやま')).toBe(true);
    expect(buildMatcher('か*き')!.test('かわさき')).toBe(true);
    expect(buildMatcher('(')).toBeInstanceOf(RegExp);   /* 정규식 특수문자 이스케이프 */
  });
  it('정렬', () => {
    expect(sortList(DATA, 'pref', 'jis')[0].code).toBe(1);
    expect(sortList(DATA, 'pref', 'gojuon')[0].kana).toBe('あいち');
    expect(sortList(DATA, 'cap', 'len')[0].capKana).toBe('つ');
  });
});

describe('공용 정규화', () => {
  it('가타카나→히라가나, 전각 숫자/영문→반각, 단어 분리', () => {
    expect(kataToHira('サクラ')).toBe('さくら');
    expect(toAsciiDigits('１２')).toBe('12');
    expect(toAsciiLetters('Ａb')).toBe('Ab');
    expect(splitWords('りんご ごりら、らっぱ，ぱんだ､つき\nきつね')).toEqual(['りんご', 'ごりら', 'らっぱ', 'ぱんだ', 'つき', 'きつね']);
  });
});
