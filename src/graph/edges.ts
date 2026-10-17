/* 규칙 그래프 — 셀 좌표 · 규칙선(에지) 그리기 · 엔진 결과(추론값·충돌)를 셀/슬롯에 반영 */
import { NS } from '../shared/dom';
import { GRAPH_CELL_W, GRAPH_CELL_H, GRAPH_CELL_GAP, GRAPH_BOX_PAD_X, GRAPH_BOX_PAD_TOP } from './layout';
import { graphState } from './state';
import { GRAPH_RULE_DEFS } from './engine';
import { graphEngine } from './engine-run';
import { uiState } from './ui-state';
import { graphSelectRule } from './rules';

export function graphCellCenter(cellId: string): { x: number; y: number } | null {
  var parts = String(cellId).split('-');
  var wi = parseInt(parts[0], 10), si = parseInt(parts[1], 10);
  var p = graphState.positions[wi] || graphState.positions[String(wi)];
  if (!p) return null;
  return {
    x: p.x + GRAPH_BOX_PAD_X + si * (GRAPH_CELL_W + GRAPH_CELL_GAP) + GRAPH_CELL_W / 2,
    y: p.y + GRAPH_BOX_PAD_TOP + GRAPH_CELL_H / 2
  };
}

/** 셀 중심에서 다른 점을 향하는 방향으로, 셀 경계 위의 점을 구한다 (중심은 클릭/입력용으로 비워둠). */
export function graphCellEdgePoint(cellId: string, towardX: number, towardY: number): { x: number; y: number } | null {
  var c = graphCellCenter(cellId);
  if (!c) return null;
  var hw = GRAPH_CELL_W / 2, hh = GRAPH_CELL_H / 2;
  var dx = towardX - c.x, dy = towardY - c.y;
  if (dx === 0 && dy === 0) return c;
  var sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  var sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  var s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** SVG 캔버스에 규칙선을 그린다 (박스 위에 오버레이). */
export function graphRenderEdges(): void {
  const svg = document.querySelector<SVGSVGElement>('svg.graph-canvas');
  if (!svg) return;
  /* 기존 에지 제거 (중복 방지 — 단독 호출 가능) */
  svg.querySelectorAll('g.graph-edge').forEach(function(g){ g.remove(); });
  /* 규칙선 숨김 모드: 선만 그리지 않음 (규칙·추론·셀 표시는 유지) */
  if (graphState.showEdges === false) return;
  /* arrowhead marker (gojuon_next 방향용) 1회 정의 */
  if (!svg.querySelector('defs#graph-defs')){
    var defs = document.createElementNS(NS, 'defs');
    defs.setAttribute('id', 'graph-defs');
    ['#ea580c', '#ef4444', '#0d9488', '#ca8a04'].forEach(function(col){
      var mk = document.createElementNS(NS, 'marker');
      mk.setAttribute('id', 'graph-arrow-' + col.replace('#', ''));
      mk.setAttribute('viewBox', '0 0 10 10'); mk.setAttribute('refX', '9'); mk.setAttribute('refY', '5');
      mk.setAttribute('markerWidth', '6'); mk.setAttribute('markerHeight', '6'); mk.setAttribute('orient', 'auto-start-reverse');
      var pth = document.createElementNS(NS, 'path');
      pth.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); pth.setAttribute('fill', col);
      mk.appendChild(pth); defs.appendChild(mk);
    });
    svg.insertBefore(defs, svg.firstChild);
  }
  graphState.rules.forEach(function(r, ri){
    var ca = graphCellCenter(r.sourceCell), cb = graphCellCenter(r.targetCell);
    if (!ca || !cb) return;
    var def = GRAPH_RULE_DEFS[r.ruleType] || { color: '#888', directed: false, colorIroha: undefined, colorAlpha: undefined };
    var viol = !!graphEngine.ruleViol[ri];
    var isSeq = (r.ruleType === 'gojuon_next');
    var baseCol = !isSeq ? def.color
      : r.order === 'iroha' ? (def.colorIroha || def.color)
      : r.order === 'alphabet' ? (def.colorAlpha || def.color)
      : def.color;
    var col = viol ? '#ef4444' : baseCol;
    var sameWord = (String(r.sourceCell).split('-')[0] === String(r.targetCell).split('-')[0]);

    var d: string, labelX: number, labelY: number;
    if (sameWord){
      /* 같은 단어 내: 글자를 가로지르지 않도록 셀 위로 곡선(arc)으로 우회 */
      var aT = { x: ca.x, y: ca.y - GRAPH_CELL_H / 2 };
      var bT = { x: cb.x, y: cb.y - GRAPH_CELL_H / 2 };
      var midX = (aT.x + bT.x) / 2;
      var span = Math.abs(bT.x - aT.x);
      var bow = Math.min(70, 20 + span * 0.4);
      var ctrlY = Math.min(aT.y, bT.y) - bow;
      d = 'M ' + aT.x + ' ' + aT.y + ' Q ' + midX + ' ' + ctrlY + ' ' + bT.x + ' ' + bT.y;
      labelX = midX; labelY = ctrlY + bow * 0.45;
    } else {
      /* 단어 간: 셀 경계 앵커 직선 (중심은 클릭/입력용으로 비움) */
      var a = graphCellEdgePoint(r.sourceCell, cb.x, cb.y)!;
      var b = graphCellEdgePoint(r.targetCell, ca.x, ca.y)!;
      d = 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
      labelX = (a.x + b.x) / 2; labelY = (a.y + b.y) / 2 - 7;
    }

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'graph-edge' + (uiState.selectedRuleIdx === ri ? ' sel' : ''));
    g.setAttribute('data-rule-idx', String(ri));
    /* 넓은 투명 히트 영역 (클릭/터치 쉽게) */
    var hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14'); hit.setAttribute('cursor', 'pointer');
    g.appendChild(hit);
    /* 보이는 선 */
    var ln = document.createElementNS(NS, 'path');
    ln.setAttribute('d', d); ln.setAttribute('fill', 'none');
    ln.setAttribute('stroke', col);
    ln.setAttribute('stroke-width', uiState.selectedRuleIdx === ri ? '4' : '2.5');
    ln.setAttribute('stroke-linecap', 'round');
    if (viol) ln.setAttribute('stroke-dasharray', '6 4');
    else if (r.ruleType === 'same_char_dakuten') ln.setAttribute('stroke-dasharray', '5 3'); /* 탁점 떼기: 점선 */
    else if (r.ruleType === 'same_char' && graphState.looseSmallLarge) ln.setAttribute('stroke-dasharray', '5 3'); /* 작은⇄큰 모드: 점선 */
    ln.setAttribute('pointer-events', 'none');
    if (def.directed) ln.setAttribute('marker-end', 'url(#graph-arrow-' + col.replace('#', '') + ')');
    g.appendChild(ln);
    /* 시퀀스 규칙 라벨: 이로하·알파벳이거나 step>1 일 때 "い+N" / "A+N" / "+N" 표시 */
    if (isSeq && (r.order === 'iroha' || r.order === 'alphabet' || (r.step || 1) > 1)){
      var txt = (r.order === 'iroha' ? 'い' : r.order === 'alphabet' ? 'A' : '') + '+' + (r.step || 1);
      var lw = 9 + txt.length * 6;
      var bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', String(labelX - lw / 2)); bg.setAttribute('y', String(labelY - 9));
      bg.setAttribute('width', String(lw)); bg.setAttribute('height', '16'); bg.setAttribute('rx', '4');
      bg.setAttribute('fill', 'var(--panel)'); bg.setAttribute('stroke', col); bg.setAttribute('stroke-width', '1');
      bg.setAttribute('pointer-events', 'none');
      g.appendChild(bg);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', String(labelX)); tx.setAttribute('y', String(labelY + 2.5));
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '10'); tx.setAttribute('font-weight', '700');
      tx.setAttribute('fill', col); tx.setAttribute('font-family', 'var(--jp)'); tx.setAttribute('pointer-events', 'none');
      tx.textContent = txt;
      g.appendChild(tx);
    }
    g.addEventListener('click', function(e){ e.stopPropagation(); graphSelectRule(ri, e.clientX, e.clientY); });
    svg.appendChild(g);
  });
}

/** 엔진 결과(추론값·충돌)를 렌더된 셀/슬롯에 반영한다. */
export function graphApplyEngineVisuals(): void {
  var val = graphEngine.value, st = graphEngine.state, conf = graphEngine.conflict;
  graphState.words.forEach(function(w){ w.letters.forEach(function(l){
    var cid = l.cellId, v = val[cid] || '', s = st[cid] || '', isConf = !!conf[cid];
    var cellG = document.querySelector('svg.graph-canvas [data-cell-id="' + cid + '"]');
    if (cellG){
      var rect = cellG.querySelector('rect');
      var txt = cellG.querySelector('text.graph-cell-char');
      if (txt){
        txt.textContent = v;
        txt.setAttribute('fill', isConf ? '#ef4444' : (s === 'inferred' ? 'var(--muted)' : 'var(--text)'));
        txt.setAttribute('font-style', s === 'inferred' ? 'italic' : 'normal');
      }
      if (rect){
        if (isConf){ rect.setAttribute('stroke', '#ef4444'); rect.setAttribute('stroke-width', '2.5'); rect.setAttribute('fill', 'rgba(239,68,68,.14)'); }
        else { rect.setAttribute('stroke', 'var(--border)'); rect.setAttribute('stroke-width', '1.5'); rect.setAttribute('fill', s === 'inferred' ? 'rgba(245,158,11,.10)' : 'var(--panel-2)'); }
      }
    }
    var slot = document.querySelector('#graph-word-list [data-cell-id="' + cid + '"]');
    if (slot){
      slot.textContent = v || '_';
      slot.classList.toggle('filled', !!v);
      slot.classList.toggle('graph-inferred', s === 'inferred');
      slot.classList.toggle('graph-conflict', isConf);
    }
  }); });
}

