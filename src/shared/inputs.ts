/* 공용 입력 헬퍼 — 숫자 입력란 (모든 도구가 함께 씀) */
import { toAsciiDigits } from './kana';

export interface NumericInputOpts {
  min?: number;
  max?: number;
  fallback?: () => number;            /* 비어 있거나 숫자가 아닐 때 쓸 값 (기본: min) */
  onCommit?: (value: number) => void; /* change · 엔터 때 정리된 값으로 호출 */
}

/**
 * 숫자 입력란 공용 동작:
 * - 입력 즉시 전각 숫자(０-９)를 반각으로 바꾸고 숫자 이외 글자는 지운다 (일본어 자판 대응)
 * - change / 엔터 때 min~max 로 잘라 입력란에 되써 주고 onCommit 을 부른다 (엔터는 포커스도 뺀다)
 * 반환: 현재 값을 정리해 읽는 함수
 */
export function bindNumericInput(input: HTMLInputElement, opts: NumericInputOpts = {}): () => number {
  const read = (): number => {
    const raw = parseInt(toAsciiDigits(input.value).replace(/[^0-9]/g, ''), 10);
    let n = Number.isFinite(raw) ? raw : (opts.fallback ? opts.fallback() : (opts.min ?? 0));
    if (opts.min !== undefined) n = Math.max(opts.min, n);
    if (opts.max !== undefined) n = Math.min(opts.max, n);
    return n;
  };
  input.addEventListener('input', () => {
    const a = toAsciiDigits(input.value).replace(/[^0-9]/g, '');
    if (a !== input.value) input.value = a;
  });
  const commit = () => { const n = read(); input.value = String(n); if (opts.onCommit) opts.onCommit(n); };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commit(); input.blur(); } });
  return read;
}
