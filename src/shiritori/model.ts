/* しりとり(시리토리) — 순수 함수 레이어 (DOM 비의존, opts 로 규칙 주입) */
import { kataToHira } from '../shared/kana';
import { babaKey } from '../babanuki/model';

export interface ShiriOpts { kataAsHira: boolean; smallAsLarge: boolean; ignoreDiacritic: boolean; longVowel: boolean; markDeadEnd: boolean; }
export interface ShiriModel {
  n: number;
  headK: (string | null)[]; tailK: (string | null)[];
  rawHead: (string | null)[]; rawTail: (string | null)[];
  dead: boolean[];
  adj: number[][]; indeg: number[]; outdeg: number[]; connected: boolean[];
  comp: number[]; compSize: Record<number, number>; inCycle: boolean[];
  opts: ShiriOpts;
}


/* 단어에서 의미 있는 글자만 추출 — 공백·구두점은 제거하되 장음 ー 는 유지(장음 옵션에서 사용) */
export function shiriLetters(word: string): string[] {
  return Array.from(word || '').filter(c =>
    !/[\s.,!?;:'"“”‘’`~^*=+()\[\]{}（）「」『』〈〉《》【】・･、。，．…〜＿_\-]/.test(c)
  );
}

/* 한 글자를 비교용 키로 정규화 — babaKey를 재사용(영문은 항상 대소문자 무시) */
export function shiriFold(ch: string, opts: ShiriOpts): string {
  return babaKey(ch, {
    kataAsHira: opts.kataAsHira,
    smallAsLarge: opts.smallAsLarge,
    ignoreDiacritic: opts.ignoreDiacritic,
    ignoreCase: true,
  });
}

/* 끝글자(원문 형태)를 구한다 — 장음 옵션이면 ー를 건너뛰고 앞 글자를 끝글자로 본다 */
export function shiriRawTail(word: string, opts: ShiriOpts): string | null {
  const ls = shiriLetters(word);
  if (!ls.length) return null;
  let i = ls.length - 1;
  if (opts.longVowel) { while (i > 0 && ls[i] === 'ー') i--; }
  return ls[i];
}
export function shiriRawHead(word: string): string | null {
  const ls = shiriLetters(word);
  return ls.length ? ls[0] : null;
}
/* 잇기 비교에 쓰는 정규화된 첫/끝 키 */
export function shiriHeadKey(word: string, opts: ShiriOpts): string | null { const h = shiriRawHead(word);        return h == null ? null : shiriFold(h, opts); }
export function shiriTailKey(word: string, opts: ShiriOpts): string | null { const t = shiriRawTail(word, opts);  return t == null ? null : shiriFold(t, opts); }
/* ん(ン)으로 끝나면 막다른 길 — 옵션과 무관하게 가나 통일로 판정 */
export function shiriIsDeadEnd(word: string, opts: ShiriOpts): boolean {
  const t = shiriRawTail(word, opts);
  return t != null && kataToHira(t) === 'ん';
}

/*
 * 단어 목록 → 시리토리 방향 그래프 모델.
 * 간선 i→j : i의 끝글자 키 === j의 첫글자 키 (자기 자신 제외).
 * markDeadEnd 면 ん으로 끝나는 노드는 나가는 간선을 갖지 않는다(막다른 길).
 */
export function shiriBuildModel(words: string[], opts: ShiriOpts): ShiriModel {
  const n = words.length;
  const headK = words.map(w => shiriHeadKey(w, opts));
  const tailK = words.map(w => shiriTailKey(w, opts));
  const rawHead = words.map(w => shiriRawHead(w));
  const rawTail = words.map(w => shiriRawTail(w, opts));
  const dead = words.map(w => shiriIsDeadEnd(w, opts));
  const adj: number[][] = [];
  for (let i = 0; i < n; i++){
    adj[i] = [];
    if ((opts.markDeadEnd && dead[i]) || tailK[i] == null) continue;
    for (let j = 0; j < n; j++){
      if (i === j) continue;
      if (headK[j] != null && tailK[i] === headK[j]) adj[i].push(j);
    }
  }
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (const j of adj[i]) indeg[j]++;
  const outdeg = adj.map(a => a.length);
  const connected = words.map((_, i) => outdeg[i] > 0 || indeg[i] > 0);
  const scc = shiriSCC(n, adj);   /* 순환(원형) 구조 식별 */
  return { n, headK, tailK, rawHead, rawTail, dead, adj, indeg, outdeg, connected,
           comp: scc.comp, compSize: scc.compSize, inCycle: scc.inCycle, opts };
}

/* Tarjan 강연결요소(SCC). 크기 2 이상인 SCC에 속한 노드는 '순환에 포함'(inCycle=true)이며,
   그 안의 모든 간선은 어떤 사이클 위에 있다 → 최장 체인이 아니어도 원형 관계를 시각화할 수 있다. */
export function shiriSCC(n: number, adj: number[][]): { comp: number[]; compSize: Record<number, number>; inCycle: boolean[] } {
  const index = new Array(n).fill(-1), low = new Array(n).fill(0), onStk = new Array(n).fill(false);
  const comp: number[] = new Array(n).fill(-1), stk: number[] = [];
  let idx = 0, c = 0;
  function strong(v: number){
    index[v] = low[v] = idx++; stk.push(v); onStk[v] = true;
    for (const w of adj[v]){
      if (index[w] === -1){ strong(w); low[v] = Math.min(low[v], low[w]); }
      else if (onStk[w]){ low[v] = Math.min(low[v], index[w]); }
    }
    if (low[v] === index[v]){ let w: number; do { w = stk.pop()!; onStk[w] = false; comp[w] = c; } while (w !== v); c++; }
  }
  for (let v = 0; v < n; v++) if (index[v] === -1) strong(v);
  const compSize: Record<number, number> = {};
  for (let v = 0; v < n; v++) compSize[comp[v]] = (compSize[comp[v]] || 0) + 1;
  const inCycle: boolean[] = new Array(n);
  for (let v = 0; v < n; v++) inCycle[v] = compSize[comp[v]] >= 2;
  return { comp, compSize, inCycle };
}

/* 가장 긴 시리토리(각 단어 1회) = 방향 그래프의 최장 단순 경로.
   단어가 많아 폭주하면 step 상한에서 멈추고 truncated=true(근삿값) 표시. */
export function shiriLongestChain(model: ShiriModel): { chain: number[]; truncated: boolean } {
  const r = shiriLongestChains(model);
  return { chain: r.chains[0] || [], truncated: r.truncated };
}

/* 가장 긴 체인을 모두 모은다 (같은 길이의 경우의 수).
   - 순환으로 시작점만 다른 체인(A→B→C 와 B→C→A, 마지막→첫 단어가 이어지는 경우)은 하나로 묶는다.
   - 경우가 너무 많으면 ALT_CAP 개까지만 모으고 more=true. */
export interface ChainsResult { chains: number[][]; truncated: boolean; more: boolean; }
export function shiriLongestChains(model: ShiriModel): ChainsResult {
  const { n, adj } = model;
  let bestLen = 0;
  let chains: number[][] = [];
  let steps = 0, truncated = false, more = false;
  const CAP = 1500000, ALT_CAP = 300;
  const visited = new Array(n).fill(false);
  const path: number[] = [];
  function dfs(u: number){
    visited[u] = true; path.push(u);
    if (path.length > bestLen){ bestLen = path.length; chains = [path.slice()]; more = false; }
    else if (path.length === bestLen){ if (chains.length < ALT_CAP) chains.push(path.slice()); else more = true; }
    const succ = adj[u];
    for (let k = 0; k < succ.length; k++){
      if (++steps > CAP){ truncated = true; break; }
      const v = succ[k];
      if (!visited[v]) dfs(v);
      if (truncated) break;
    }
    path.pop(); visited[u] = false;
  }
  for (let s = 0; s < n && !truncated; s++) dfs(s);

  /* 순환 중복 제거: 끝 단어→첫 단어가 이어지면 회전 동치 — 가장 작은 인덱스가 앞에 오게 돌린 키로 묶는다 */
  const seen = new Set<string>();
  const out: number[][] = [];
  chains.forEach(c => {
    let key: string;
    if (c.length >= 2 && adj[c[c.length - 1]].indexOf(c[0]) >= 0){
      let mi = 0;
      for (let k = 1; k < c.length; k++) if (c[k] < c[mi]) mi = k;
      key = 'cyc:' + c.slice(mi).concat(c.slice(0, mi)).join(',');
    } else {
      key = 'lin:' + c.join(',');
    }
    if (seen.has(key)) return;
    seen.add(key); out.push(c);
  });
  return { chains: out, truncated, more };
}


