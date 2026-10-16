/* DOM 공용 헬퍼 */
export const NS = 'http://www.w3.org/2000/svg';

/** 반드시 존재해야 하는 요소 조회 — 없으면 초기화 단계에서 바로 드러나도록 throw */
export function $<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error('required element not found: ' + sel);
  return el;
}
export function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
export function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs?: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}
export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** localStorage 읽기 (실패·차단 시 null) */
export function loadJSON<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
export function saveJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가(사생활 모드 등) 무시 */ }
}
