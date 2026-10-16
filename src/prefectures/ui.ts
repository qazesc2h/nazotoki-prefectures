/* 도도부현 / 현청소재지 도구: 검색 · 전체 보기 · 전체 지도 · 모양→이름 + 전역 「가리기」 상태 */
import { DATA, BY_CODE, F, NOTES, REGIONS, REGION_COLORS, sortList, buildMatcher } from './data';
import { kataToHira } from '../shared/kana';
import type { Pref, Mode } from './data';
import { $, NS, loadJSON } from '../shared/dom';
import mapSvgText from '../../assets/japan-map.svg?raw';

export type PrefTab = 'search' | 'all' | 'map' | 'shapes';

/* ---------- state ---------- */
const LS_STRUCK = 'nazotoki-struck-v1';
const LS_MODE = 'nazotoki-mode-v1';
const LS_DETAIL = 'nazotoki-detail-v1';
const LS_KANA = 'nazotoki-kanafirst-v1';
export const state = {
  mode: (localStorage.getItem(LS_MODE) === 'cap' ? 'cap' : 'pref') as Mode,
  detail: localStorage.getItem(LS_DETAIL) === '1',
  kanaFirst: localStorage.getItem(LS_KANA) === '1',
  struck: new Set<number>(),        /* 가린(후보 제외) 도도부현 code — 모든 탭 공통·저장 */
};
{
  const raw = loadJSON<unknown>(LS_STRUCK);
  if (Array.isArray(raw)) raw.forEach(c => state.struck.add(Number(c)));
}

/** 현재 활성 탭 조회 — 셸(main.ts)이 주입. 가리기 변경 시 어떤 뷰를 다시 그릴지 결정하는 데 쓴다. */
let getTab: () => string = () => 'search';

function saveStruck(){ localStorage.setItem(LS_STRUCK, JSON.stringify([...state.struck])); }
export function isStruck(code: number): boolean { return state.struck.has(code); }
export function toggleStruck(code: number): void {
  if (state.struck.has(code)) state.struck.delete(code); else state.struck.add(code);
  saveStruck(); refreshStrikeUI(); renderAll();
}
export function clearStruck(): void { state.struck.clear(); saveStruck(); refreshStrikeUI(); renderAll(); }

/* ---------- DOM refs ---------- */
const els = {
  strikeStatus: $('#strikeStatus'), strikeCount: $('#strikeCount'),
  q: $<HTMLInputElement>('#q'), qScope: $('#qScope'), field: $<HTMLSelectElement>('#field'),
  lenFilter: $<HTMLSelectElement>('#lenFilter'), sortSearch: $<HTMLSelectElement>('#sortSearch'),
  detailToggle: $<HTMLInputElement>('#detailToggle'), detailToggleAll: $<HTMLInputElement>('#detailToggleAll'),
  kanaToggle: $<HTMLInputElement>('#kanaToggle'), kanaToggleAll: $<HTMLInputElement>('#kanaToggleAll'), kanaToggleGal: $<HTMLInputElement>('#kanaToggleGal'),
  searchCount: $('#searchCount'), searchResults: $('#searchResults'),
  allView: $<HTMLSelectElement>('#allView'), allResults: $('#allResults'),
  mapStage: $('#mapStage'), mapLabels: $<HTMLInputElement>('#mapLabels'), mapRegionColor: $<HTMLInputElement>('#mapRegionColor'),
  galWrap: $('#galWrap'), galSort: $<HTMLSelectElement>('#galSort'),
  tooltip: $('#tooltip'),
  fieldPairOpt: $<HTMLOptionElement>('#fieldPairOpt'),
  mapSrc: $('#jpmap-src'),
};

/** 지도 원본 SVG(assets/japan-map.svg)를 숨김 컨테이너에 주입 — 지도·실루엣이 여기서 복제한다 */
els.mapSrc.innerHTML = mapSvgText.replace(/^\s*<\?xml[^>]*\?>\s*/, '');

function makeCard(d: Pref): HTMLDivElement {
  const f = F(d, state.mode);
  const rc = REGION_COLORS[d.region];
  const card = document.createElement('div');
  card.className = 'card' + (isStruck(d.code) ? ' is-struck' : '');
  card.style.setProperty('--rcolor', rc.fill);
  card.style.setProperty('--rcolor-soft', rc.soft);
  card.style.setProperty('--rtext', rc.text);
  card.dataset.code = String(d.code);

  // optionally swap which line is prominent: kanji (default) vs yomigana
  const big = state.kanaFirst ? f.kana : f.main;
  const small = state.kanaFirst ? f.main : f.kana;
  let html =
    '<span class="code">' + d.code + '</span>' +
    '<div class="main">' + big + '</div>' +
    '<div class="kana">' + small + '</div>';

  /* 현청소재지 모드: 간단 보기에서도 소속 도도부현을 한 줄로 (자세히 보기에서는 아래 배지로 표시) */
  if (state.mode === 'cap' && !state.detail) {
    html += '<div class="pair' + (d.capNeq ? ' neq' : '') + '" title="' + d.kanji + '의 현청소재지">' + d.kanji + '</div>';
  }

  if (state.detail) {
    let subHtml = '<span class="badge region">' + d.region + '</span>'
      + '<span class="badge len">' + f.len + '자</span>'
      + '<span>' + f.romaji + '</span>';
    if (state.mode === 'cap') {
      subHtml += '<span class="badge">' + d.kanji + '</span>';
      if (d.capNeq) subHtml += '<span class="badge neq">현청≠현명</span>';
    } else if (d.capNeq) {
      subHtml += '<span class="badge neq">県庁 ' + d.cap + '</span>';
    }
    html += '<div class="sub">' + subHtml + '</div>';
  }

  card.innerHTML = html;
  card.addEventListener('click', () => toggleStruck(d.code));
  if (NOTES[d.code]) card.title = NOTES[d.code];
  return card;
}

/* ---------- SEARCH ---------- */
function rebuildLenFilter(): void {
  const cur = els.lenFilter.value;
  const lens = [...new Set(DATA.map(d => F(d, state.mode).len))].sort((a,b)=>a-b);
  els.lenFilter.innerHTML = '<option value="">전체</option>' +
    lens.map(l => '<option value="' + l + '">' + l + '자</option>').join('');
  if (lens.map(String).includes(cur)) els.lenFilter.value = cur;
}
function runSearch(): void {
  const matcher = buildMatcher(els.q.value);
  const field = els.field.value;
  const lenF = els.lenFilter.value ? Number(els.lenFilter.value) : null;

  /* 「짝 이름」: 현청소재지 모드에서는 소속 도도부현, 도도부현 모드에서는 현청소재지 이름으로 찾는다
     (현청↔도도부현 변환 문제용). 글자수 필터·카드 표시는 현재 모드 기준 그대로. */
  const pairMode = state.mode === 'cap' ? 'pref' : 'cap';

  let list = DATA.filter(d => {
    const f = F(d, state.mode);
    if (lenF != null && f.len !== lenF) return false;
    if (!matcher) return true;
    const test = [];
    if (field === 'all' || field === 'kana')   { test.push(f.kana); }
    if (field === 'all' || field === 'kanji')  { test.push(f.kanji); test.push(f.nameBare); }
    if (field === 'all' || field === 'romaji') { test.push(f.romaji); }
    if (field === 'pair') { const p = F(d, pairMode); test.push(p.kana, p.kanji, p.nameBare, p.romaji); }
    return test.some(v => {
      if (v == null) return false;
      let s = v;
      // normalize for matching
      if (matcher) {
        const target = (field === 'romaji' || /[a-zA-Z]/.test(els.q.value)) ? s.toLowerCase() : kataToHira(s);
        return matcher.test(target) || matcher.test(kataToHira(s)) || matcher.test(s.toLowerCase());
      }
      return false;
    });
  });

  list = sortList(list, state.mode, els.sortSearch.value);
  els.searchResults.innerHTML = '';
  if (!list.length){
    els.searchResults.innerHTML = '<div class="empty">일치하는 결과가 없습니다.</div>';
  } else {
    const frag = document.createDocumentFragment();
    list.forEach(d => frag.appendChild(makeCard(d)));
    els.searchResults.appendChild(frag);
  }
  els.searchCount.textContent = list.length + '건';
  els.qScope.textContent = field === 'pair'
    ? (state.mode === 'cap' ? '(소속 도도부현 이름으로 찾기)' : '(현청소재지 이름으로 찾기)')
    : (state.mode === 'cap' ? '(현청 かな·한자·로마자)' : '(かな·한자·로마자)');
}

/* ---------- ALL (groups) ---------- */
function renderAllTab(): void {
  const how = els.allView.value;
  els.allResults.innerHTML = '';
  const frag = document.createDocumentFragment();

  function groupBlock(title: string, pillText: string | null, items: Pref[]): HTMLDivElement {
    const g = document.createElement('div'); g.className = 'group';
    const h = document.createElement('h3');
    h.innerHTML = title + (pillText != null ? ' <span class="pill">' + pillText + '</span>' : '');
    g.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'grid';
    items.forEach(d => grid.appendChild(makeCard(d)));
    g.appendChild(grid); return g;
  }

  if (how === 'len'){
    const byLen: Record<number, Pref[]> = {};
    DATA.forEach(d => { const l = F(d, state.mode).len; (byLen[l] = byLen[l] || []).push(d); });
    Object.keys(byLen).map(Number).sort((a,b)=>a-b).forEach(l => {
      const items = sortList(byLen[l], state.mode, 'gojuon');
      frag.appendChild(groupBlock(l + '글자', items.length + '개', items));
    });
  } else if (how === 'region'){
    REGIONS.forEach(r => {
      const items = sortList(DATA.filter(d => d.region === r), state.mode, 'jis');
      if (items.length) frag.appendChild(groupBlock(r, items.length + '개', items));
    });
  } else {
    const items = sortList(DATA, state.mode, how);
    frag.appendChild(groupBlock(how === 'gojuon' ? '사전순(50음)' : 'JIS순(후생노동성)', items.length + '개', items));
  }
  els.allResults.appendChild(frag);
}

/* ---------- MAP ---------- */
let mapBuilt = false;
/* Break a prefecture into PIECES (separate polygons + each subpath of a path), cluster them by
   proximity, and return one label point per MAJOR cluster. So the label sits on a real landmass
   instead of the empty-sea bbox center — this matters for 東京 (本土 + tiny 伊豆 islands in one path)
   and gives far-split 鹿児島 (本土 + 奄美) one label per landmass. Local (pre-transform) coordinates. */
interface PieceBox { x: number; y: number; w: number; h: number; cx: number; cy: number; area: number; }
function pieceBoxes(g: Element): PieceBox[] {
  const tmp = document.createElementNS(NS, 'svg');
  tmp.setAttribute('viewBox', '0 0 1000 1000');
  tmp.style.cssText = 'position:absolute;left:-9999px;width:10px;height:10px';
  document.body.appendChild(tmp);
  const out: PieceBox[] = [];
  const measure = (el: SVGGraphicsElement) => { tmp.appendChild(el); let b: DOMRect | null; try { b = el.getBBox(); } catch(e){ b = null; } tmp.removeChild(el);
    if (b && b.width > 0 && b.height > 0) out.push({ x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2, area: b.width * b.height }); };
  g.querySelectorAll('polygon, path').forEach(el => {
    if (el.tagName.toLowerCase() === 'polygon') {
      const p = document.createElementNS(NS, 'polygon'); p.setAttribute('points', el.getAttribute('points') || ''); measure(p);
    } else {
      const d = el.getAttribute('d') || '';
      const subs = /[a-z]/.test(d) ? [d] : d.split(/(?=M)/).filter(s => /M/.test(s)); // only split absolute paths
      subs.forEach(sd => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', sd); measure(p); });
    }
  });
  document.body.removeChild(tmp);
  return out;
}
function mapLabelPoints(g: Element): { cx: number; cy: number }[] {
  const shapes = pieceBoxes(g);
  if (!shapes.length) return [];
  const T = 45, n = shapes.length, parent = [...Array(n).keys()];
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.hypot(shapes[i].cx - shapes[j].cx, shapes[i].cy - shapes[j].cy) <= T) parent[find(i)] = find(j);
  }
  const groups: Record<number, PieceBox[]> = {};
  shapes.forEach((s, i) => { const r = find(i); (groups[r] = groups[r] || []).push(s); });
  const clusters = Object.values(groups).map(arr => {
    const area = arr.reduce((s, x) => s + x.area, 0);
    return { area, cx: arr.reduce((s, x) => s + x.cx * x.area, 0) / area, cy: arr.reduce((s, x) => s + x.cy * x.area, 0) / area };
  }).sort((a, b) => b.area - a.area);
  const maxA = clusters[0].area;
  // always label the biggest cluster; add a label for any other landmass that is genuinely sizeable
  return clusters.filter((c, i) => i === 0 || c.area >= Math.max(600, 0.2 * maxA)).map(c => ({ cx: c.cx, cy: c.cy }));
}

function buildMap(): void {
  const srcSvg = $<SVGSVGElement>('#jpmap-src svg');
  const svg = srcSvg.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute('style'); svg.removeAttribute('class');
  svg.setAttribute('class', 'fullmap');
  els.mapStage.innerHTML = '';
  els.mapStage.appendChild(svg);

  const prefGroup = svg.querySelector('g.prefectures') as SVGGElement;

  DATA.forEach(d => {
    const g = svg.querySelector<SVGGElement>('g.prefecture[data-code="' + d.code + '"]');
    if (!g) return;
    const rc = REGION_COLORS[d.region];
    g.style.setProperty('--rfill', rc.fill);

    // one label per major landmass cluster (prefectures-group space)
    const m = g.transform.baseVal.consolidate();
    mapLabelPoints(g).forEach(pt => {
      let cx = pt.cx, cy = pt.cy;
      if (m){ const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const tp = p.matrixTransform(m.matrix); cx = tp.x; cy = tp.y; }
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'plabel');
      t.setAttribute('x', String(cx)); t.setAttribute('y', String(cy));
      t.setAttribute('font-size', '15');
      t.dataset.code = String(d.code);
      prefGroup.appendChild(t);
    });

    // interactions
    g.addEventListener('mousemove', ev => showTip(ev, d));
    g.addEventListener('mouseenter', ev => showTip(ev, d));
    g.addEventListener('mouseleave', hideTip);
    /* 클릭 = 가리기 (검색·전체 보기·모양 탭과 동일한 전역 상태) */
    g.addEventListener('click', () => { toggleStruck(d.code); showTip({ clientX: lastTipX, clientY: lastTipY }, d); });
  });
  mapBuilt = true;
  updateMapLabels();
  applyStruckToMap();
}
function updateMapLabels(): void {
  const svg = els.mapStage.querySelector<SVGSVGElement>('svg.fullmap'); if (!svg) return;
  svg.classList.toggle('show-labels', els.mapLabels.checked);
  svg.classList.toggle('region-color', els.mapRegionColor.checked);
  svg.querySelectorAll<SVGTextElement>('.plabel').forEach(t => {
    const d = BY_CODE[Number(t.dataset.code)];
    t.textContent = state.mode === 'cap' ? d.capName : d.name;
  });
}
export function applyStruckToMap(): void {
  const svg = els.mapStage.querySelector<SVGSVGElement>('svg.fullmap'); if (!svg) return;
  DATA.forEach(d => {
    const g = svg.querySelector('g.prefecture[data-code="' + d.code + '"]');
    if (g) g.classList.toggle('struck', isStruck(d.code));
    svg.querySelectorAll('.plabel[data-code="' + d.code + '"]').forEach(t => t.classList.toggle('struck', isStruck(d.code)));
  });
}
let lastTipX = 0, lastTipY = 0;
function showTip(ev: { clientX: number; clientY: number }, d: Pref): void {
  lastTipX = ev.clientX; lastTipY = ev.clientY;
  const f = F(d, state.mode);
  let html = '<b>' + f.main + '</b> <span class="t-kana">' + f.kana + '</span><br>'
    + '<span style="opacity:.8">' + f.romaji + ' · ' + d.region + ' · #' + d.code + '</span>';
  if (state.mode === 'cap') html += '<br><span style="opacity:.8">' + d.kanji + (d.capNeq ? ' (현청≠현명)' : '') + '</span>';
  else if (d.capNeq) html += '<br><span style="opacity:.8">현청: ' + d.cap + '</span>';
  if (NOTES[d.code]) html += '<br><span style="opacity:.8">' + NOTES[d.code] + '</span>';
  if (isStruck(d.code)) html += '<br><span style="opacity:.8">— 가린 항목</span>';
  els.tooltip.innerHTML = html;
  els.tooltip.classList.add('on');
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const r = els.tooltip.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight) y = ev.clientY - r.height - pad;
  els.tooltip.style.left = x + 'px'; els.tooltip.style.top = y + 'px';
}
function hideTip(): void { els.tooltip.classList.remove('on'); }

/* ---------- SHAPES gallery ---------- */
function buildSilhouetteSvg(code: number): SVGSVGElement {
  const src = $<SVGGElement>('#jpmap-src g.prefectures g.prefecture[data-code="' + code + '"]');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'silhouette');
  const g = src.cloneNode(true) as SVGGElement;
  g.removeAttribute('transform');
  g.setAttribute('class', 'sil-shape');
  g.querySelectorAll('title').forEach(t => t.remove());
  svg.appendChild(g);
  return svg;
}
function renderGallery(): void {
  const how = els.galSort.value;
  els.galWrap.innerHTML = '';
  const frag = document.createDocumentFragment();

  function tilesGrid(items: Pref[]): HTMLDivElement {
    const gal = document.createElement('div');
    gal.className = 'gal';
    items.forEach(d => {
      const f = F(d, state.mode);
      const tile = document.createElement('div');
      tile.className = 'tile' + (isStruck(d.code) ? ' is-struck' : '');
      tile.dataset.code = String(d.code);
      if (NOTES[d.code]) tile.title = NOTES[d.code];
      tile.appendChild(Object.assign(document.createElement('span'), {className:'code', textContent:String(d.code)}));
      tile.appendChild(buildSilhouetteSvg(d.code));
      const nm = document.createElement('div'); nm.className = 'tile-name';
      nm.innerHTML = '<span class="k">' + (state.kanaFirst ? f.kana : f.main) + '</span><span class="r">' + (state.kanaFirst ? f.main : f.kana) + '</span>'
        + (state.mode === 'cap' ? '<span class="p">⌂ ' + d.kanji + '</span>' : '');   /* 현청소재지 모드: 소속 도도부현 */
      tile.appendChild(nm);
      tile.addEventListener('click', () => toggleStruck(d.code));
      gal.appendChild(tile);
    });
    return gal;
  }

  if (how === 'region'){
    REGIONS.forEach(r => {
      const items = sortList(DATA.filter(d => d.region === r), state.mode, 'jis');
      if (!items.length) return;
      const g = document.createElement('div'); g.className = 'group';
      const h = document.createElement('h3'); h.innerHTML = r + ' <span class="pill">' + items.length + '개</span>';
      g.appendChild(h); g.appendChild(tilesGrid(items)); frag.appendChild(g);
    });
  } else if (how === 'len'){
    const byLen: Record<number, Pref[]> = {};
    DATA.forEach(d => { const l = F(d, state.mode).len; (byLen[l]=byLen[l]||[]).push(d); });
    Object.keys(byLen).map(Number).sort((a,b)=>a-b).forEach(l => {
      const items = sortList(byLen[l], state.mode, 'gojuon');
      const g = document.createElement('div'); g.className = 'group';
      const h = document.createElement('h3'); h.innerHTML = l + '글자 <span class="pill">' + items.length + '개</span>';
      g.appendChild(h); g.appendChild(tilesGrid(items)); frag.appendChild(g);
    });
  } else {
    frag.appendChild(tilesGrid(sortList(DATA, state.mode, how)));
  }
  els.galWrap.appendChild(frag);
  fitSilhouettes();
}
/* viewBox must be set after the <svg> is in the rendered DOM (getBBox needs layout).
   Fit to the MAIN landmass. Pieces include path subpaths (so 東京's 伊豆 islands, which share one
   <path> with the mainland, are seen as separate pieces). If the big pieces fill most of the full
   bounding box, keep the whole shape (e.g. 長崎・北海道, islands stay visible); only when far-flung
   small pieces blow the box up and shrink the mainland (東京・鹿児島・沖縄) do we crop to the big ones. */
function fitSilhouettes(): void {
  els.galWrap.querySelectorAll<SVGSVGElement>('svg.silhouette').forEach(svg => {
    const g = svg.querySelector('.sil-shape');
    if (!g) return;
    const pieces = pieceBoxes(g);
    if (!pieces.length) return;
    const maxA = Math.max(...pieces.map(p => p.area));
    const big = pieces.filter(p => p.area >= 0.2 * maxA);
    const box = (arr: PieceBox[]) => {
      const minX = Math.min(...arr.map(p => p.x)), minY = Math.min(...arr.map(p => p.y));
      const maxX = Math.max(...arr.map(p => p.x + p.w)), maxY = Math.max(...arr.map(p => p.y + p.h));
      return { minX, minY, w: maxX - minX, h: maxY - minY };
    };
    const full = box(pieces), kept = box(big);
    const use = (kept.w * kept.h) < 0.5 * (full.w * full.h) ? kept : full;
    const pad = Math.max(use.w, use.h) * 0.08 + 1;
    svg.setAttribute('viewBox', (use.minX - pad) + ' ' + (use.minY - pad) + ' ' + (use.w + pad * 2) + ' ' + (use.h + pad * 2));
  });
}

/* ---------- strike UI + global refresh ---------- */
export function refreshStrikeUI(): void {
  const n = state.struck.size;
  els.strikeCount.textContent = n + '개 가림';
  els.strikeStatus.classList.toggle('hidden', n === 0);
}

/* compact vs detailed card view */
function setDetail(on: boolean): void {
  state.detail = !!on;
  localStorage.setItem(LS_DETAIL, state.detail ? '1' : '0');
  document.body.classList.toggle('detail-view', state.detail);
  els.detailToggle.checked = state.detail;
  els.detailToggleAll.checked = state.detail;
  const tab = getTab();
  if (tab === 'search') runSearch();
  else if (tab === 'all') renderAllTab();
}

/* swap kanji ↔ yomigana prominence in cards and shape tiles */
function setKanaFirst(on: boolean): void {
  state.kanaFirst = !!on;
  localStorage.setItem(LS_KANA, state.kanaFirst ? '1' : '0');
  [els.kanaToggle, els.kanaToggleAll, els.kanaToggleGal].forEach(c => { c.checked = state.kanaFirst; });
  const tab = getTab();
  if (tab === 'search') runSearch();
  else if (tab === 'all') renderAllTab();
  else if (tab === 'shapes') renderGallery();
}

/** 도도부현 탭 하나를 그린다 (셸의 setTab 에서 호출) */
export function renderPrefTab(tab: string): void {
  if (tab === 'search') runSearch();
  else if (tab === 'all') renderAllTab();
  else if (tab === 'map'){ if (!mapBuilt) buildMap(); else { updateMapLabels(); applyStruckToMap(); } }
  else if (tab === 'shapes') renderGallery();
}
/* 가리기 변경 후: 보이는 탭 + (만들어져 있으면) 지도 반영 */
function renderAll(): void {
  renderPrefTab(getTab());
  if (getTab() !== 'map' && mapBuilt) applyStruckToMap();
}

/** 도도부현 ↔ 현청소재지 모드 전환 (저장) */
export function setMode(mode: Mode): void {
  state.mode = mode;
  localStorage.setItem(LS_MODE, mode);
  /* 검색 대상 「짝 이름」 라벨: 모드에 따라 반대쪽 이름을 가리킴 */
  els.fieldPairOpt.textContent = mode === 'cap' ? '짝 이름(소속 도도부현)' : '짝 이름(현청소재지)';
  rebuildLenFilter();
  renderPrefTab(getTab());
  if (mapBuilt && getTab() !== 'map') updateMapLabels();   // keep prebuilt map in sync
}

/** 컨트롤 바인딩 + 초기 상태 반영. 셸이 한 번 호출한다. */
export function initPrefectures(opts: { getTab: () => string }): void {
  getTab = opts.getTab;
  document.body.classList.toggle('detail-view', state.detail);
  els.detailToggle.checked = state.detail;
  els.detailToggleAll.checked = state.detail;
  [els.kanaToggle, els.kanaToggleAll, els.kanaToggleGal].forEach(c => { c.checked = state.kanaFirst; });

  els.q.addEventListener('input', runSearch);
  els.field.addEventListener('change', runSearch);
  els.lenFilter.addEventListener('change', runSearch);
  els.sortSearch.addEventListener('change', runSearch);
  els.allView.addEventListener('change', renderAllTab);
  els.detailToggle.addEventListener('change', () => setDetail(els.detailToggle.checked));
  els.detailToggleAll.addEventListener('change', () => setDetail(els.detailToggleAll.checked));
  els.kanaToggle.addEventListener('change', () => setKanaFirst(els.kanaToggle.checked));
  els.kanaToggleAll.addEventListener('change', () => setKanaFirst(els.kanaToggleAll.checked));
  els.kanaToggleGal.addEventListener('change', () => setKanaFirst(els.kanaToggleGal.checked));
  els.mapLabels.addEventListener('change', updateMapLabels);
  els.mapRegionColor.addEventListener('change', updateMapLabels);
  els.galSort.addEventListener('change', renderGallery);

  setMode(state.mode);   // 글자수 필터 구성 + 첫 렌더
  refreshStrikeUI();
}
