/* 공작 — 종이 색 팔레트 (장 구별용). 10색: 노랑·하늘·분홍·연두·보라·주황·청록·빨강·파랑·회색 */
export const PALETTE: { h: number; s: number; name: string }[] = [
  { h: 48, s: 1, name: '노랑' }, { h: 200, s: 1, name: '하늘' }, { h: 340, s: 1, name: '분홍' }, { h: 120, s: 1, name: '연두' }, { h: 275, s: 1, name: '보라' },
  { h: 20, s: 1, name: '주황' }, { h: 165, s: 1, name: '청록' }, { h: 0, s: 1, name: '빨강' }, { h: 230, s: 1, name: '파랑' }, { h: 0, s: 0, name: '회색' },
];
export const PALETTE_SIZE = PALETTE.length;
export const paletteIndex = (i: number): number => ((Math.round(i) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
