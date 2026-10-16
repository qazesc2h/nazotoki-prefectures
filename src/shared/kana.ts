/* 가나·문자 정규화 공용 유틸 — 모든 도구가 함께 쓴다 (DOM 비의존) */

/** 가타카나(ァ-ヶ) → 히라가나 */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 전각 숫자(０-９)를 반각(0-9)으로 — 일본어 자판의 전각 숫자 입력 지원 */
export function toAsciiDigits(s: unknown): string {
  return String(s == null ? '' : s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
/** 전각 영문(Ａ-Ｚａ-ｚ)을 반각으로 — 일본어 자판의 전각 알파벳 입력 지원 */
export function toAsciiLetters(s: unknown): string {
  return String(s == null ? '' : s).replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/* ---- 작은 글자(소문자 가나) ⇄ 큰 글자 ---- */
export const SMALL_TO_LARGE: Record<string, string> = { 'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'つ','ゎ':'わ' };
export const LARGE_TO_SMALL: Record<string, string> = Object.fromEntries(Object.entries(SMALL_TO_LARGE).map(([k, v]) => [v, k]));
export function isSmallKana(ch: string): boolean { return Object.prototype.hasOwnProperty.call(SMALL_TO_LARGE, ch); }
/** 작은→큰, 그 외 자기 자신 */
export function baseChar(ch: string): string { return SMALL_TO_LARGE[ch] || ch; }
/** 큰→작은, 그 외(작은 포함) 자기 자신 */
export function smallForm(ch: string): string { return LARGE_TO_SMALL[ch] || ch; }

/* ---- 탁점/반탁점 (청음 ⇄ 탁음/반탁음) ---- */
export const DAKUTEN: Record<string, string> = { 'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご','さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ','た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど','は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ','う':'ゔ' };
export const HANDAKUTEN: Record<string, string> = { 'は':'ぱ','ひ':'ぴ','ふ':'ぷ','へ':'ぺ','ほ':'ぽ' };
export const DAKUTEN_REV: Record<string, string> = Object.fromEntries(Object.entries(DAKUTEN).map(([k, v]) => [v, k]));
export const HANDAKUTEN_REV: Record<string, string> = Object.fromEntries(Object.entries(HANDAKUTEN).map(([k, v]) => [v, k]));
export function isDakuten(ch: string): boolean { return Object.prototype.hasOwnProperty.call(DAKUTEN_REV, ch); }
export function isHandakuten(ch: string): boolean { return Object.prototype.hasOwnProperty.call(HANDAKUTEN_REV, ch); }
/** 탁/반탁 → 청음 */
export function stripDiacritic(ch: string): string { return DAKUTEN_REV[ch] || HANDAKUTEN_REV[ch] || ch; }
/** 청음 → 탁음 */
export function addDakuten(ch: string): string { const b = stripDiacritic(ch); return DAKUTEN[b] || b; }
/** 청음 → 반탁음 */
export function addHandakuten(ch: string): string { const b = stripDiacritic(ch); return HANDAKUTEN[b] || b; }

/** 단어 입력란 구분자: 공백류(전각 공백 포함) + 모든 형태의 쉼표 ,(U+002C) 、(U+3001) ，(U+FF0C) ､(U+FF64) */
export function splitWords(text: string): string[] {
  return (text || '').split(/[\s,、，､]+/).map(s => s.trim()).filter(Boolean);
}
