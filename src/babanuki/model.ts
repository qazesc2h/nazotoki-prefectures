/* ババ抜き(바바누키) — 순수 함수 레이어 (DOM 비의존). 시리토리도 babaKey 를 재사용한다. */
import { kataToHira, stripDiacritic, baseChar } from '../shared/kana';

export interface KeyOpts { kataAsHira: boolean; smallAsLarge: boolean; ignoreDiacritic: boolean; ignoreCase: boolean; }
export type BabaRule = 'pair' | 'all';
export interface BabaOpts extends KeyOpts { rule: BabaRule; }
export interface CharInst { wi: number; ci: number; ch: string; key: string; keep: boolean; }
export interface BabaResult { words: CharInst[][]; survivors: { ch: string }[]; counts: Map<string, number>; }


/* 한 글자를 비교용 키로 정규화. 표시는 원문 그대로 두고, 매칭에만 옵션을 적용한다. */
export function babaKey(ch: string, opts: KeyOpts): string {
  let k = ch;
  /* 영문 대소문자 무시(영어 단어 지원): 라틴 문자에만 영향, 가나에는 영향 없음(toLowerCase 무변화) */
  if (opts.ignoreCase) k = k.toLowerCase();
  /* 탁점·소문자 매핑(graph*)은 히라가나 키만 가지므로, 두 옵션 중 하나라도 켜져 있으면
     먼저 히라가나로 바꿔서 처리해야 가타카나(ガ·ッ 등)에도 정규화가 적용된다.
     단 'カ=か'(kataAsHira)가 꺼져 있으면 가나 구분은 유지해야 하므로 원래 가타카나였는지 기억해 둔다. */
  const foldKana = opts.kataAsHira || opts.ignoreDiacritic || opts.smallAsLarge;
  let wasKata = false;
  if (foldKana) {
    const h = kataToHira(k);
    wasKata = (h !== k);                                  /* 변환됐으면 원래 가타카나(ァ-ヶ) */
    k = h;                                                /* カ→か */
  }
  if (opts.ignoreDiacritic) k = stripDiacritic(k);   /* が→か, ぱ→は */
  if (opts.smallAsLarge) k = baseChar(k);            /* ぁ→あ, っ→つ */
  if (wasKata && !opts.kataAsHira) k = '' + k;      /* 가나 통일 끔 → 가타카나는 히라가나와 다른 글자로 구분 */
  return k;
}

/* 단어를 코드포인트 글자 배열로 분해 (공백류 제외) */
export function babaChars(word: string): string[] {
  return Array.from(word || '').filter(c => !/\s/.test(c));
}

/*
 * 단어 목록 → 각 글자의 남음/지워짐 상태 계산.
 * 모든 단어의 글자를 하나의 풀로 모아 키별 개수를 세고:
 *  - rule 'pair': 개수가 홀수면 첫 등장 1개만 남기고 나머지·짝수는 모두 지움.
 *  - rule 'all' : 개수가 1이면 남기고, 2개 이상이면 모두 지움.
 * @returns {{words: Array<Array<{ch,key,keep}>>, survivors: Array<{ch}>, counts: Map}}
 */
export function babaCompute(words: string[], opts: BabaOpts): BabaResult {
  const instances: CharInst[] = [];
  const perWord = words.map((w, wi) => babaChars(w).map((ch, ci) => {
    const inst: CharInst = { wi, ci, ch, key: babaKey(ch, opts), keep: false };
    instances.push(inst);
    return inst;
  }));
  const counts = new Map<string, number>();
  instances.forEach(it => counts.set(it.key, (counts.get(it.key) || 0) + 1));
  const seen = new Map<string, number>();
  instances.forEach(it => {
    const total = counts.get(it.key) || 0;
    const idx = seen.get(it.key) || 0; seen.set(it.key, idx + 1);
    it.keep = (opts.rule === 'all')
      ? (total === 1)
      : (total % 2 === 1 && idx === 0);   /* pair: 홀수면 첫 등장만 남김 */
  });
  const survivors = instances.filter(it => it.keep).map(it => ({ ch: it.ch }));
  return { words: perWord, survivors, counts };
}

