/* しりとり(시리토리) 탭 — 상태 · 최장 체인 결과 · 방향 그래프(드래그) · 단어 목록 */
import { svgEl, esc, loadJSON, saveJSON } from '../shared/dom';
import { askConfirm } from '../shared/dialog';
import { splitWords } from '../shared/kana';
import { graphRemapPositions } from '../graph/layout';
import { shiriBuildModel, shiriLongestChains } from './model';
import type { ShiriOpts, ShiriModel } from './model';
import type { Positions } from '../graph/model';

const LS_SHIRI = 'nazotoki-shiritori-v1';

export interface ShiriState extends ShiriOpts { words: string[]; positions: Positions; }
export const shiriState: ShiriState = {
  words: [],              /* 입력 단어(표시는 원문 그대로) */
  kataAsHira: true,       /* カ=か (가나 통일, 기본 켬) */
  smallAsLarge: false,    /* ぁ=あ, ょ=よ … 작은⇄큰 같은 글자 */
  ignoreDiacritic: false, /* が↔か, ぱ↔は … 탁점·반탁점 느슨하게 */
  longVowel: false,       /* 장음 ー로 끝나면 앞 글자로 잇기 (コーヒー→ひ) */
  markDeadEnd: true,      /* ん으로 끝나면 막다른 길 표시(잇기 차단, 기본 켬) */
  positions: {},          /* 단어 index → {x,y} : 사용자가 드래그로 옮긴 노드 위치(없으면 자동 배치) */
};

function shiriLoadState(): void {
  const raw = loadJSON<Partial<ShiriState>>(LS_SHIRI);
  if (raw && typeof raw === 'object'){
    if (Array.isArray(raw.words)) shiriState.words = raw.words.filter((w): w is string => typeof w === 'string');
    (['kataAsHira','smallAsLarge','ignoreDiacritic','longVowel','markDeadEnd'] as const).forEach(k => {
      const v = raw[k];
      if (typeof v === 'boolean') shiriState[k] = v;
    });
    if (raw.positions && typeof raw.positions === 'object') shiriState.positions = raw.positions;
  }
}
function shiriSaveState(): void { saveJSON(LS_SHIRI, shiriState); }

/* ----- 레이아웃 / 렌더 ----- */
let shiriMeasureCtx: CanvasRenderingContext2D | null = null;
let shiriJpFont = '';
function shiriMeasureWidth(text: string, fontPx: number): number {
  if (!shiriMeasureCtx) shiriMeasureCtx = document.createElement('canvas').getContext('2d');
  if (!shiriJpFont){ try { shiriJpFont = getComputedStyle(document.body).fontFamily || 'sans-serif'; } catch(e){ shiriJpFont = 'sans-serif'; } }
  if (!shiriMeasureCtx) return (text || ' ').length * fontPx;
  shiriMeasureCtx.font = '700 ' + fontPx + 'px ' + shiriJpFont;
  return shiriMeasureCtx.measureText(text || ' ').width;
}
function shiriMetrics(){ /* 화면 폭에 따른 노드·간격 치수 */
  const narrow = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
  return narrow
    ? { nodeH: 32, padX: 9,  font: 14, gapX: 30, gapY: 22, pad: 12, minW: 34, arrowGap: 7, maxW: 200 }
    : { nodeH: 40, padX: 13, font: 16, gapX: 46, gapY: 30, pad: 18, minW: 42, arrowGap: 8, maxW: 280 };
}

/* 사각형 중심에서 (tx,ty) 방향으로 테두리와 만나는 점 */
function shiriBorderPoint(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/* 최장 체인 경우의 수 중 현재 보고 있는 번호 — 단어/옵션이 바뀌면 0으로 되돌린다(저장 안 함) */
let shiriAltIdx = 0;
let shiriAltKey = '';
let shiriLastAltCount = 0;

export function shiriRender(): void {
  const wrap = document.getElementById('shiri-canvas-wrap');
  const opts: ShiriOpts = shiriState;
  const words = shiriState.words;
  const model = shiriBuildModel(words, opts);
  const alts = shiriLongestChains(model);
  const n = model.n;

  /* 단어·옵션이 바뀌면 보던 경우 번호를 처음으로 */
  const altKey = JSON.stringify([words, opts.kataAsHira, opts.smallAsLarge, opts.ignoreDiacritic, opts.longVowel, opts.markDeadEnd]);
  if (altKey !== shiriAltKey){ shiriAltKey = altKey; shiriAltIdx = 0; }
  if (shiriAltIdx >= alts.chains.length) shiriAltIdx = 0;
  shiriLastAltCount = alts.chains.length;
  const chain = alts.chains[shiriAltIdx] || [];
  const truncated = alts.truncated;

  /* ---- 결과(체인) + 통계 ---- */
  const statsEl = document.getElementById('shiri-stats');
  const chainEl = document.getElementById('shiri-chain');
  const showChain = chain.length >= 2;

  /* 경우의 수 내비게이션 (2가지 이상일 때만) */
  const navEl = document.getElementById('shiri-alt-nav');
  if (navEl){
    const altCount = showChain ? alts.chains.length : 0;
    navEl.classList.toggle('hidden', altCount < 2);
    const lab = document.getElementById('shiri-alt-label');
    if (lab) lab.innerHTML = '<b>' + (shiriAltIdx + 1) + '</b> / ' + altCount + (alts.more ? '+' : '');
  }
  const deadCount = opts.markDeadEnd ? model.dead.filter(Boolean).length : 0;
  /* 고립 = 아무 곳과도 안 이어짐. 단, 막다른(ん) 단어는 위 막다른 수에서 세므로 중복 집계하지 않는다(목록 배지와 일치) */
  const isoCount = words.filter((_, i) => !model.connected[i] && !(opts.markDeadEnd && model.dead[i])).length;
  const cycCount = model.inCycle ? model.inCycle.filter(Boolean).length : 0;
  if (statsEl){
    if (!n) statsEl.textContent = '';
    else {
      let s = n + '개 단어 · 최장 ' + chain.length + '개 이음';
      if (showChain && alts.chains.length > 1) s += ' · ' + alts.chains.length + (alts.more ? '+' : '') + '가지';
      if (truncated) s += ' (근삿값)';
      if (cycCount) s += ' · 순환 ' + cycCount;
      if (opts.markDeadEnd && deadCount) s += ' · 막다른 ' + deadCount;
      if (isoCount) s += ' · 고립 ' + isoCount;
      statsEl.textContent = s;
    }
  }
  if (chainEl){
    chainEl.innerHTML = '';
    if (!n){
      chainEl.innerHTML = '<span class="shiri-empty">단어를 추가하면 가장 긴 시리토리가 여기에 나타납니다.</span>';
    } else if (!showChain){
      chainEl.innerHTML = '<span class="shiri-empty">이을 수 있는 단어 쌍이 없습니다. (끝글자=첫글자인 단어를 더해 보세요)</span>';
    } else {
      chain.forEach((idx, k) => {
        if (k > 0){
          const lk = model.rawTail[chain[k - 1]] || '';
          const ar = document.createElement('span');
          ar.className = 'shiri-arrow';
          ar.innerHTML = '<span class="lk">' + esc(lk) + '</span><span>→</span>';
          chainEl.appendChild(ar);
        }
        const chip = document.createElement('span');
        chip.className = 'shiri-chip';
        chip.innerHTML = '<span class="ci">' + (k + 1) + '</span><span>' + esc(words[idx]) + '</span>';
        chainEl.appendChild(chip);
      });
    }
  }

  /* ---- 단어 수 ---- */
  const wcEl = document.getElementById('shiri-word-count');
  if (wcEl) wcEl.textContent = n ? (n + '개 단어') : '';

  /* ---- 그래프 캔버스 ---- */
  const emptyEl = document.getElementById('shiri-empty');
  if (emptyEl) emptyEl.style.display = n ? 'none' : '';
  if (wrap){
    const oldSvg = wrap.querySelector('svg.shiri-canvas');
    if (oldSvg) oldSvg.remove();
    if (n) shiriRenderGraph(wrap, model, chain, showChain);
  }

  /* ---- 단어별 목록 ---- */
  shiriRenderList(model);
}

function shiriRenderGraph(wrap: HTMLElement, model: ShiriModel, chain: number[], showChain: boolean): void {
  const M = shiriMetrics();
  const n = model.n;
  const words = shiriState.words;
  const stored = shiriState.positions || {};

  /* 노드 크기 측정 */
  const node = words.map(w => {
    const tw = shiriMeasureWidth(w, M.font);
    const width = Math.min(M.maxW, Math.max(M.minW, Math.ceil(tw || 0) + M.padX * 2));  /* tw가 NaN이어도 안전 */
    return { w: width, h: M.nodeH };
  });

  const chainArr = showChain ? chain : [];
  const chainSet = new Set(chainArr);
  const chainPos: Record<number, number> = {}; chainArr.forEach((idx, k) => { chainPos[idx] = k; });

  const containerW = wrap.clientWidth > 0 ? Math.max(280, wrap.clientWidth) : 600;  /* 숨겨진 상태(clientWidth 0)에서는 임시 폭, 탭 표시 시 재렌더 */

  /* --- 자동 배치 (드래그로 옮긴 노드는 저장 위치로 덮어쓴다) --- */
  const auto: Record<number, { x: number; y: number }> = {};
  /* 체인도 컨테이너 폭 안에서 줄바꿈 — 한 줄로 깔면 모바일에서 가로 overflow가 됨.
     홀수 줄은 오른쪽부터(지그재그) 배치해 줄 끝↔다음 줄 시작 이음선이 짧게 이어지도록 한다 */
  const chainRows: number[][] = [];
  {
    let cur: number[] = [], curW = 0;
    chainArr.forEach(idx => {
      const need = node[idx].w + (cur.length ? M.gapX : 0);
      if (cur.length && curW + need > containerW - M.pad * 2){ chainRows.push(cur); cur = [idx]; curW = node[idx].w; }
      else { cur.push(idx); curW += need; }
    });
    if (cur.length) chainRows.push(cur);
  }
  let cy = M.pad, chainBottom = M.pad;
  chainRows.forEach((row, r) => {
    const items = (r % 2 === 1) ? row.slice().reverse() : row;
    /* 역순(홀수) 줄은 오른쪽 정렬 — 줄이 덜 차도 윗줄 끝 바로 아래에서 이어진다 */
    const rowW = items.reduce((s, idx, k) => s + node[idx].w + (k ? M.gapX : 0), 0);
    let x = (r % 2 === 1) ? Math.max(M.pad, containerW - M.pad - rowW) : M.pad, rowH = 0;
    items.forEach(idx => { auto[idx] = { x: x, y: cy }; x += node[idx].w + M.gapX; rowH = Math.max(rowH, node[idx].h); });
    chainBottom = Math.max(chainBottom, cy + rowH);
    cy += rowH + M.gapY;
  });
  const others: number[] = [];
  for (let i = 0; i < n; i++) if (!chainSet.has(i)) others.push(i);
  let gx = M.pad, gy = chainArr.length ? (chainBottom + Math.round(M.gapY * 1.5)) : M.pad, rowH = 0;
  others.forEach(idx => {
    if (gx > M.pad && gx + node[idx].w > containerW - M.pad){ gx = M.pad; gy += rowH + M.gapY; rowH = 0; }
    auto[idx] = { x: gx, y: gy };
    gx += node[idx].w + M.gapX; rowH = Math.max(rowH, node[idx].h);
  });

  const pos: Record<number, { x: number; y: number }> = {};
  for (let i = 0; i < n; i++){
    const s = stored[i];
    pos[i] = (s && Number.isFinite(s.x) && Number.isFinite(s.y)) ? { x: s.x, y: s.y } : auto[i];
  }

  function bounds(){
    let right = M.pad, bottom = M.pad;
    for (let i = 0; i < n; i++){ if (!pos[i]) continue; right = Math.max(right, pos[i].x + node[i].w + M.pad); bottom = Math.max(bottom, pos[i].y + node[i].h + M.pad); }
    return { right, bottom };
  }
  const b0 = bounds();
  let W = Math.max(b0.right, containerW), H = b0.bottom;

  const svg = svgEl('svg', { 'class': 'shiri-canvas', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H });

  /* 화살촉 마커 (보통/체인/순환) */
  const defs = svgEl('defs');
  ['shiri-mk', 'shiri-mk-chain', 'shiri-mk-cyc'].forEach(id => {
    const mk = svgEl('marker', { id: id, markerWidth: '9', markerHeight: '9', refX: '8', refY: '4', orient: 'auto', markerUnits: 'userSpaceOnUse' });
    mk.appendChild(svgEl('path', { d: 'M0,0 L8,4 L0,8 Z' }));
    defs.appendChild(mk);
  });
  svg.appendChild(defs);

  const edgeIsCyc = (i: number, j: number) => model.inCycle && model.inCycle[i] && model.inCycle[j] && model.comp[i] === model.comp[j];

  /* 간선 기하 계산 — 초기 그리기와 드래그 중 갱신에서 공용으로 쓴다 */
  function edgeGeom(i: number, j: number, isChain: boolean){
    const ci = { x: pos[i].x + node[i].w / 2, y: pos[i].y + node[i].h / 2 };
    const cj = { x: pos[j].x + node[j].w / 2, y: pos[j].y + node[j].h / 2 };
    const p1 = shiriBorderPoint(ci.x, ci.y, node[i].w / 2, node[i].h / 2, cj.x, cj.y);
    let p2 = shiriBorderPoint(cj.x, cj.y, node[j].w / 2, node[j].h / 2, ci.x, ci.y);
    let vx = p1.x - p2.x, vy = p1.y - p2.y; const vlen = Math.hypot(vx, vy) || 1;
    p2 = { x: p2.x + vx / vlen * M.arrowGap, y: p2.y + vy / vlen * M.arrowGap };
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    let nx = -(p2.y - p1.y), ny = (p2.x - p1.x); const nlen = Math.hypot(nx, ny) || 1;
    let curve = 0;
    if (!isChain){
      const reverse = model.adj[j] && model.adj[j].indexOf(i) >= 0;
      curve = Math.min(38, vlen * 0.16) * (i < j ? 1 : -1) * (reverse ? 1 : 0.55);
    }
    const cpx = mx + nx / nlen * curve, cpy = my + ny / nlen * curve;
    return { d: 'M ' + p1.x + ' ' + p1.y + ' Q ' + cpx + ' ' + cpy + ' ' + p2.x + ' ' + p2.y, lx: mx, ly: my - 6 };
  }

  /* 노드 먼저(간선이 위에 그려져 화살촉이 보이도록) */
  const nodesG = svgEl('g');
  const nodeEls: Record<number, SVGGElement> = {};
  for (let i = 0; i < n; i++){
    if (!pos[i]) continue;
    const cls = 'shiri-node'
      + (chainSet.has(i) ? ' chain' : '')
      + (model.inCycle && model.inCycle[i] ? ' cyc' : '')
      + (shiriState.markDeadEnd && model.dead[i] ? ' dead' : '')
      + (!model.connected[i] ? ' iso' : '');
    const g = svgEl('g', { 'class': cls, 'data-idx': String(i), transform: 'translate(' + pos[i].x + ',' + pos[i].y + ')' });
    g.appendChild(svgEl('rect', { 'class': 'shiri-node-rect', x: '0', y: '0', width: String(node[i].w), height: String(node[i].h), rx: '8', ry: '8' }));
    const tx = svgEl('text', { 'class': 'shiri-node-text', x: String(node[i].w / 2), y: String(node[i].h / 2 + M.font * 0.35), 'text-anchor': 'middle', 'font-size': String(M.font), 'font-weight': '700' });
    tx.textContent = words[i];
    const innerW = node[i].w - M.padX * 2;
    if (shiriMeasureWidth(words[i], M.font) > innerW){ tx.setAttribute('textLength', String(innerW)); tx.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
    g.appendChild(tx);
    const title = svgEl('title'); title.textContent = words[i]; g.appendChild(title);
    nodesG.appendChild(g);
    nodeEls[i] = g;
  }
  svg.appendChild(nodesG);

  /* 간선 + (체인 간선의) 잇는 글자 라벨 */
  const edgesG = svgEl('g'), lblG = svgEl('g');
  interface EdgeEl { el: SVGPathElement; i: number; j: number; isChain: boolean; labelEl: SVGTextElement | null; }
  const edges: EdgeEl[] = [];
  for (let i = 0; i < n; i++){
    for (const j of model.adj[i]){
      if (!pos[i] || !pos[j]) continue;
      const isChain = (chainPos[i] !== undefined && chainPos[j] === chainPos[i] + 1);
      const cyc = !isChain && edgeIsCyc(i, j);
      const geom = edgeGeom(i, j, isChain);
      const mk = isChain ? 'shiri-mk-chain' : (cyc ? 'shiri-mk-cyc' : 'shiri-mk');
      const path = svgEl('path', { 'class': 'shiri-edge' + (isChain ? ' chain' : '') + (cyc ? ' cyc' : ''), d: geom.d, 'marker-end': 'url(#' + mk + ')' });
      edgesG.appendChild(path);
      let labelEl: SVGTextElement | null = null;
      if (isChain){
        const lk = model.rawTail[i] || '';
        if (lk){ labelEl = svgEl('text', { 'class': 'shiri-edge-label', x: String(geom.lx), y: String(geom.ly), 'text-anchor': 'middle' }); labelEl.textContent = lk; lblG.appendChild(labelEl); }
      }
      edges.push({ el: path, i: i, j: j, isChain: isChain, labelEl: labelEl });
    }
  }
  svg.appendChild(edgesG);
  svg.appendChild(lblG);
  wrap.appendChild(svg);

  /* 호버 → 연결된 (보통) 간선 강조 */
  function setHl(idx: number, on: boolean){
    edges.forEach(e => {
      if (e.isChain || e.el.classList.contains('cyc')) return;
      if (e.i === idx || e.j === idx) e.el.classList.toggle('hl', on);
    });
  }

  /* 드래그 좌표 변환 / 캔버스 확장 / 간선 추적 */
  function getSvgScale(){ const bb = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; return { sx: vb.width / (bb.width || 1), sy: vb.height / (bb.height || 1) }; }
  function growCanvasFor(idx: number){
    let changed = false;
    const needW = pos[idx].x + node[idx].w + M.pad, needH = pos[idx].y + node[idx].h + M.pad;
    if (needW > W){ W = needW; changed = true; }
    if (needH > H){ H = needH; changed = true; }
    if (changed){ svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); }
  }
  function repositionNode(idx: number){
    const g = nodeEls[idx]; if (!g) return;
    g.setAttribute('transform', 'translate(' + pos[idx].x + ',' + pos[idx].y + ')');
    edges.forEach(e => {
      if (e.i !== idx && e.j !== idx) return;
      const geom = edgeGeom(e.i, e.j, e.isChain);
      e.el.setAttribute('d', geom.d);
      if (e.labelEl){ e.labelEl.setAttribute('x', String(geom.lx)); e.labelEl.setAttribute('y', String(geom.ly)); }
    });
  }

  /* 노드 드래그(규칙 그래프와 동일한 방식) + 호버 */
  for (let i = 0; i < n; i++){
    const g = nodeEls[i]; if (!g) continue;
    (function(idx: number){
      let dragging = false, moved = false, startCX = 0, startCY = 0, startX = 0, startY = 0;
      g.addEventListener('mouseenter', () => { if (!dragging) setHl(idx, true); });
      g.addEventListener('mouseleave', () => { if (!dragging) setHl(idx, false); });
      /* SVG <g>의 touch-action을 무시하는 브라우저 폴백 — 노드 터치가 스크롤로 넘어가 드래그가 끊기는 것 방지 */
      g.addEventListener('touchstart', function(e){ e.preventDefault(); }, { passive: false });
      g.addEventListener('pointerdown', function(e){
        if (e.button === 2) return;
        e.preventDefault(); e.stopPropagation();
        dragging = true; moved = false;
        try { g.setPointerCapture(e.pointerId); } catch(_){}
        startCX = e.clientX; startCY = e.clientY;
        startX = pos[idx].x; startY = pos[idx].y;
        g.style.cursor = 'grabbing';
      });
      g.addEventListener('pointermove', function(e){
        if (!dragging) return;
        if (Math.abs(e.clientX - startCX) > 3 || Math.abs(e.clientY - startCY) > 3) moved = true;
        if (!moved) return;
        e.preventDefault();
        const sc = getSvgScale();
        pos[idx] = {
          x: Math.max(M.pad, startX + (e.clientX - startCX) * sc.sx),
          y: Math.max(M.pad, startY + (e.clientY - startCY) * sc.sy),
        };
        repositionNode(idx);
        growCanvasFor(idx);
      });
      function endDrag(e: PointerEvent){
        if (!dragging) return;
        dragging = false;
        if (e && e.pointerId !== undefined){ try { g.releasePointerCapture(e.pointerId); } catch(_){} }
        g.style.cursor = '';
        if (moved){
          shiriState.positions = shiriState.positions || {};
          shiriState.positions[idx] = { x: pos[idx].x, y: pos[idx].y };
          shiriSaveState();
        }
        moved = false;
      }
      g.addEventListener('pointerup', endDrag);
      g.addEventListener('pointercancel', endDrag);
    })(i);
  }
}

function shiriRenderList(model: ShiriModel): void {
  const listEl = document.getElementById('shiri-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const words = shiriState.words;
  if (!words.length){
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = '아직 추가된 단어가 없습니다.';
    listEl.appendChild(p);
    return;
  }
  words.forEach((w, i) => {
    const row = document.createElement('div'); row.className = 'shiri-word';
    const lbl = document.createElement('span'); lbl.className = 'shiri-wlabel'; lbl.textContent = 'W' + (i + 1);
    const word = document.createElement('span'); word.className = 'shiri-wword';
    word.textContent = w && w.trim() ? w : '(빈 단어)';

    const meta = document.createElement('span'); meta.className = 'shiri-wmeta';
    const rh = model.rawHead[i], rt = model.rawTail[i];
    if (rh != null && rt != null){
      meta.innerHTML = '첫 <b>' + esc(rh) + '</b> · 끝 <b>' + esc(rt) + '</b>';
    }
    const isDead = shiriState.markDeadEnd && model.dead[i];
    if (isDead){ const b = document.createElement('span'); b.className = 'shiri-badge dead'; b.textContent = '막다른 길(ん)'; meta.appendChild(document.createTextNode(' ')); meta.appendChild(b); }
    else if (!model.connected[i] && rh != null){ const b = document.createElement('span'); b.className = 'shiri-badge iso'; b.textContent = '고립'; meta.appendChild(document.createTextNode(' ')); meta.appendChild(b); }
    if (model.inCycle && model.inCycle[i]){ const b = document.createElement('span'); b.className = 'shiri-badge cyc'; b.textContent = '순환'; meta.appendChild(document.createTextNode(' ')); meta.appendChild(b); }

    const spacer = document.createElement('span'); spacer.className = 'spacer';
    const del = document.createElement('button');
    del.className = 'baba-del'; del.type = 'button'; del.title = '이 단어 삭제';
    del.textContent = '×'; del.dataset.wi = String(i);

    row.appendChild(lbl); row.appendChild(word); row.appendChild(meta); row.appendChild(spacer); row.appendChild(del);
    listEl.appendChild(row);
  });
}

/* ----- 동작 ----- */
function shiriAddFromInput(): void {
  const inp = document.getElementById('shiri-input') as HTMLInputElement | null;
  if (!inp) return;
  const tokens = splitWords(inp.value);
  inp.value = '';
  if (tokens.length === 0){ inp.focus(); return; }
  shiriState.words = shiriState.words.concat(tokens);
  shiriSaveState();
  shiriRender();
  inp.focus();
}
function shiriRemoveWord(i: number): void {
  shiriState.words = shiriState.words.filter((_, k) => k !== i);
  /* 삭제로 인덱스가 한 칸씩 당겨지므로 드래그 위치도 같이 remap (규칙 그래프와 동일) */
  shiriState.positions = graphRemapPositions(shiriState.positions || {}, i);
  shiriSaveState();
  shiriRender();
}
function shiriClearAll(): void {
  if (shiriState.words.length === 0) return;
  askConfirm('단어 목록을 모두 비우시겠습니까?', { ok: '비우기' }).then(ok => {
    if (!ok) return;
    shiriState.words = [];
    shiriState.positions = {};
    shiriSaveState();
    shiriRender();
  });
}
/* 드래그로 옮긴 위치를 모두 버리고 자동 배치로 되돌린다 */
function shiriAutoArrange(): void {
  shiriState.positions = {};
  shiriSaveState();
  shiriRender();
}

export function shiriInit(opts: { isActive: () => boolean }): void {
  shiriLoadState();
  const inp = document.getElementById('shiri-input') as HTMLInputElement | null;
  const addBtn = document.getElementById('shiri-add');
  const arrangeBtn = document.getElementById('shiri-arrange');
  const clearBtn = document.getElementById('shiri-clear');
  const listEl = document.getElementById('shiri-list');
  const optKata = document.getElementById('shiri-opt-kata') as HTMLInputElement | null;
  const optSmall = document.getElementById('shiri-opt-small') as HTMLInputElement | null;
  const optDia = document.getElementById('shiri-opt-dia') as HTMLInputElement | null;
  const optLong = document.getElementById('shiri-opt-long') as HTMLInputElement | null;
  const optDead = document.getElementById('shiri-opt-dead') as HTMLInputElement | null;

  if (optKata) optKata.checked = shiriState.kataAsHira;
  if (optSmall) optSmall.checked = shiriState.smallAsLarge;
  if (optDia) optDia.checked = shiriState.ignoreDiacritic;
  if (optLong) optLong.checked = shiriState.longVowel;
  if (optDead) optDead.checked = shiriState.markDeadEnd;

  if (addBtn) addBtn.addEventListener('click', shiriAddFromInput);
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); shiriAddFromInput(); } });
  if (arrangeBtn) arrangeBtn.addEventListener('click', shiriAutoArrange);
  if (clearBtn) clearBtn.addEventListener('click', shiriClearAll);

  /* 최장 체인 경우의 수 좌우 넘김 */
  const altStep = (d: number) => {
    const cnt = shiriLastAltCount;   /* 마지막 렌더에서 계산한 경우의 수 (재탐색 없이) */
    if (cnt < 2) return;
    shiriAltIdx = ((shiriAltIdx + d) % cnt + cnt) % cnt;
    shiriRender();
  };
  const altPrev = document.getElementById('shiri-alt-prev');
  const altNext = document.getElementById('shiri-alt-next');
  if (altPrev) altPrev.addEventListener('click', () => altStep(-1));
  if (altNext) altNext.addEventListener('click', () => altStep(1));

  const bindOpt = (el: HTMLInputElement | null, prop: keyof ShiriOpts) => { if (el) el.addEventListener('change', () => { shiriState[prop] = el.checked; shiriSaveState(); shiriRender(); }); };
  bindOpt(optKata, 'kataAsHira');
  bindOpt(optSmall, 'smallAsLarge');
  bindOpt(optDia, 'ignoreDiacritic');
  bindOpt(optLong, 'longVowel');
  bindOpt(optDead, 'markDeadEnd');

  if (listEl) listEl.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('.baba-del'); if (!b) return;
    shiriRemoveWord(Number(b.dataset.wi));
  });

  /* 화면 폭이 바뀌면(회전 등) 그래프를 다시 그려 레이아웃·캔버스 폭을 맞춘다 */
  window.addEventListener('resize', () => { if (opts.isActive()) shiriRender(); });

  shiriRender();
}

