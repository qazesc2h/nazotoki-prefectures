/* ババ抜き(바바누키) 탭 — 상태 · 렌더 · 이벤트 */
import { esc, loadJSON, saveJSON } from '../shared/dom';
import { splitWords } from '../shared/kana';
import { babaCompute } from './model';
import type { BabaOpts } from './model';

const LS_BABA = 'nazotoki-babanuki-v1';

export interface BabaState extends BabaOpts { words: string[]; }
export const babaState: BabaState = {
  words: [],              /* 입력된 단어 목록(표시는 원문 그대로) */
  rule: 'pair',           /* 'pair' = 짝만 지움(홀수면 1개 남음, 기본) | 'all' = 겹치면 모두 지움 */
  kataAsHira: true,       /* カ=か 로 취급해 매칭 (가타카나↔히라가나 통일) */
  smallAsLarge: false,    /* ぁ=あ, っ=つ … 작은 글자⇄큰 글자 같은 글자 취급 */
  ignoreDiacritic: false, /* が=か, ぱ=は … 탁점·반탁점 무시 */
  ignoreCase: true,       /* Apple=apple … 영문 대소문자 무시(영어 단어 지원, 기본 켬) */
};

function babaLoadState(): void {
  {
    const raw = loadJSON<Partial<BabaState>>(LS_BABA);
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.words)) babaState.words = raw.words.filter((w): w is string => typeof w === 'string');
      if (raw.rule === 'pair' || raw.rule === 'all') babaState.rule = raw.rule;
      if (typeof raw.kataAsHira === 'boolean') babaState.kataAsHira = raw.kataAsHira;
      if (typeof raw.smallAsLarge === 'boolean') babaState.smallAsLarge = raw.smallAsLarge;
      if (typeof raw.ignoreDiacritic === 'boolean') babaState.ignoreDiacritic = raw.ignoreDiacritic;
      if (typeof raw.ignoreCase === 'boolean') babaState.ignoreCase = raw.ignoreCase;
    }
  }
}
function babaSaveState(): void { saveJSON(LS_BABA, babaState); }

/* ----- 렌더링 ----- */
export function babaRender(): void {
  const res = babaCompute(babaState.words, babaState);
  const hasWords = babaState.words.length > 0;

  /* 결과(남은 글자) */
  const answerEl = document.getElementById('baba-answer');
  const survCountEl = document.getElementById('baba-surv-count');
  if (answerEl) {
    if (!hasWords) {
      answerEl.innerHTML = '<span class="baba-empty">단어를 추가하면 남은 글자가 여기에 나타납니다.</span>';
    } else if (res.survivors.length === 0) {
      answerEl.innerHTML = '<span class="baba-empty">남은 글자가 없습니다 (모두 지워짐).</span>';
    } else {
      answerEl.innerHTML = res.survivors.map(s => '<span class="baba-keepchip">' + esc(s.ch) + '</span>').join('');
    }
  }
  if (survCountEl) survCountEl.textContent = hasWords ? (res.survivors.length + '자') : '';

  /* 단어 수 */
  const wordCountEl = document.getElementById('baba-word-count');
  if (wordCountEl) wordCountEl.textContent = hasWords ? (babaState.words.length + '개 단어') : '';

  /* 단어별 분해 목록 */
  const listEl = document.getElementById('baba-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!hasWords) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = '아직 추가된 단어가 없습니다.';
    listEl.appendChild(p);
    return;
  }
  res.words.forEach((wordChars, wi) => {
    const row = document.createElement('div'); row.className = 'baba-word';
    const lbl = document.createElement('span'); lbl.className = 'baba-wlabel'; lbl.textContent = 'W' + (wi + 1);
    const tiles = document.createElement('div'); tiles.className = 'baba-tiles';
    if (wordChars.length === 0) {
      const em = document.createElement('span'); em.className = 'baba-empty'; em.textContent = '(빈 단어)';
      tiles.appendChild(em);
    } else {
      wordChars.forEach(c => {
        const t = document.createElement('span');
        t.className = 'baba-tile ' + (c.keep ? 'keep' : 'struck');
        t.textContent = c.ch;
        tiles.appendChild(t);
      });
    }
    const del = document.createElement('button');
    del.className = 'baba-del'; del.type = 'button'; del.title = '이 단어 삭제';
    del.textContent = '×'; del.dataset.wi = String(wi);
    row.appendChild(lbl); row.appendChild(tiles); row.appendChild(del);
    listEl.appendChild(row);
  });
}

/* ----- 동작 ----- */
function babaAddFromInput(): void {
  const inp = document.getElementById('baba-input') as HTMLInputElement | null;
  if (!inp) return;
  const tokens = splitWords(inp.value);
  inp.value = '';
  if (tokens.length === 0) { inp.focus(); return; }
  babaState.words = babaState.words.concat(tokens);
  babaSaveState();
  babaRender();
  inp.focus();
}
function babaRemoveWord(wi: number): void {
  babaState.words = babaState.words.filter((_, i) => i !== wi);
  babaSaveState();
  babaRender();
}
function babaClearAll(): void {
  if (babaState.words.length === 0) return;
  if (!confirm('단어 목록을 모두 비우시겠습니까?')) return;
  babaState.words = [];
  babaSaveState();
  babaRender();
}

export function babaInit(): void {
  babaLoadState();
  const inp = document.getElementById('baba-input') as HTMLInputElement | null;
  const addBtn = document.getElementById('baba-add');
  const clearBtn = document.getElementById('baba-clear');
  const ruleSel = document.getElementById('baba-rule') as HTMLSelectElement | null;
  const optKata = document.getElementById('baba-opt-kata') as HTMLInputElement | null;
  const optSmall = document.getElementById('baba-opt-small') as HTMLInputElement | null;
  const optDia = document.getElementById('baba-opt-dia') as HTMLInputElement | null;
  const optCase = document.getElementById('baba-opt-case') as HTMLInputElement | null;
  const listEl = document.getElementById('baba-list');

  /* 컨트롤 초기값을 상태에 맞춤 */
  if (ruleSel) ruleSel.value = babaState.rule;
  if (optKata) optKata.checked = babaState.kataAsHira;
  if (optSmall) optSmall.checked = babaState.smallAsLarge;
  if (optDia) optDia.checked = babaState.ignoreDiacritic;
  if (optCase) optCase.checked = babaState.ignoreCase;

  if (addBtn) addBtn.addEventListener('click', babaAddFromInput);
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); babaAddFromInput(); } });
  if (clearBtn) clearBtn.addEventListener('click', babaClearAll);
  if (ruleSel) ruleSel.addEventListener('change', () => {
    babaState.rule = ruleSel.value === 'all' ? 'all' : 'pair';
    babaSaveState(); babaRender();
  });
  const bindOpt = (el: HTMLInputElement | null, prop: 'kataAsHira' | 'smallAsLarge' | 'ignoreDiacritic' | 'ignoreCase') => { if (el) el.addEventListener('change', () => { babaState[prop] = el.checked; babaSaveState(); babaRender(); }); };
  bindOpt(optKata, 'kataAsHira');
  bindOpt(optSmall, 'smallAsLarge');
  bindOpt(optDia, 'ignoreDiacritic');
  bindOpt(optCase, 'ignoreCase');

  /* 단어 삭제(×) — 이벤트 위임 */
  if (listEl) listEl.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('.baba-del'); if (!b) return;
    babaRemoveWord(Number(b.dataset.wi));
  });

  babaRender();
}

