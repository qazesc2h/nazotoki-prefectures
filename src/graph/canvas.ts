/* 규칙 그래프 — SVG 캔버스: 단어 박스·셀 렌더 + 박스 드래그(이동 없는 클릭은 셀 편집기, 길게 누르면 셀 메뉴) */
import { NS } from '../shared/dom';
import { GRAPH_CELL_W, GRAPH_CELL_H, GRAPH_CELL_GAP, GRAPH_BOX_PAD_X, GRAPH_BOX_PAD_TOP, GRAPH_CANVAS_PAD, GRAPH_CHAR_FONT, GRAPH_SLOT_FONT, graphBoxSize, graphComputeLayout } from './layout';
import { graphState, graphFindLetter, graphSaveState } from './state';
import { GRAPH_CELL_TYPE_BADGE } from './engine';
import { uiState } from './ui-state';
import { graphShowCellEditor } from './editor';
import { graphOpenCellMenu } from './menus';
import { graphRenderEdges } from './edges';

/**
 * SVG 캔버스에 단어 박스를 렌더링한다.
 * - 위치가 없는 단어는 graphComputeLayout으로 자동 배치하고 저장한다.
 * - 이미 위치가 있는 단어는 그 위치를 유지한다.
 * - 각 단어 박스는 드래그로 이동 가능하다.
 */
export function graphRenderCanvas(): void {
  var wrap = document.getElementById('graph-canvas-wrap');
  if (!wrap) return;

  /* 빈 상태 메시지 표시 제어 */
  var emptyEl = document.getElementById('graph-empty');
  if (emptyEl) emptyEl.style.display = graphState.words.length ? 'none' : '';

  if (!graphState.words.length) {
    var oldSvg = wrap.querySelector('svg.graph-canvas');
    if (oldSvg) oldSvg.remove();
    return;
  }

  /* 캔버스 폭은 가용 폭에 맞춤 — 모바일에선 화면 폭 내에서 박스가 줄바꿈·세로로 쌓이게.
     (탭이 숨겨져 clientWidth=0 일 때만 600 폴백) */
  var canvasW = wrap.clientWidth > 0 ? Math.max(wrap.clientWidth - 8, 240) : 600;

  /* 레이아웃 계산: 위치 없는 단어만 자동 배치 */
  var layout = graphComputeLayout(graphState.words, graphState.positions, canvasW);

  /* 새로 계산된 위치를 graphState.positions에 저장 (처음 추가된 단어만) */
  var posChanged = false;
  graphState.words.forEach(function(w) {
    if (graphState.positions[w.index] === undefined && layout[w.index] !== undefined) {
      graphState.positions[w.index] = layout[w.index];
      posChanged = true;
    }
  });
  if (posChanged) graphSaveState();

  /* SVG 뷰박스 크기 계산 */
  var maxRight = canvasW, maxBottom = 280;
  graphState.words.forEach(function(w) {
    var pos = layout[w.index];
    if (!pos) return;
    var sz = graphBoxSize(w.charCount);
    maxRight = Math.max(maxRight, pos.x + sz.w + GRAPH_CANVAS_PAD);
    maxBottom = Math.max(maxBottom, pos.y + sz.h + GRAPH_CANVAS_PAD);
  });

  /* SVG 요소 생성 또는 재사용 */
  var svg = wrap.querySelector<SVGSVGElement>('svg.graph-canvas');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'graph-canvas');
    wrap.appendChild(svg);
  }
  svg.setAttribute('viewBox', '0 0 ' + maxRight + ' ' + maxBottom);
  svg.setAttribute('width', String(maxRight));
  svg.setAttribute('height', String(maxBottom));
  svg.innerHTML = '';

  /* 단어 박스 렌더링 */
  graphState.words.forEach(function(w) {
    var pos = layout[w.index];
    if (!pos) return;
    var sz = graphBoxSize(w.charCount);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'graph-word-box');
    g.setAttribute('data-word-index', String(w.index));
    g.setAttribute('transform', 'translate(' + pos.x + ',' + pos.y + ')');

    /* 박스 배경 */
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(sz.w)); bg.setAttribute('height', String(sz.h));
    bg.setAttribute('rx', '8'); bg.setAttribute('ry', '8');
    bg.setAttribute('fill', 'var(--panel)');
    bg.setAttribute('stroke', 'var(--border)');
    bg.setAttribute('stroke-width', '1.5');
    g.appendChild(bg);

    /* 단어 레이블 */
    var lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', String(GRAPH_BOX_PAD_X));
    lbl.setAttribute('y', '20');
    lbl.setAttribute('font-size', '12');
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('fill', 'var(--muted)');
    lbl.setAttribute('font-family', 'var(--jp)');
    lbl.setAttribute('pointer-events', 'none');
    lbl.setAttribute('display', 'none'); /* 단어 타이틀 숨김 */
    lbl.textContent = 'W' + w.index + ' (' + w.charCount + '자)';
    g.appendChild(lbl);

    /* 셀 박스 렌더링 */
    w.letters.forEach(function(letter, si) {
      var cx = GRAPH_BOX_PAD_X + si * (GRAPH_CELL_W + GRAPH_CELL_GAP);
      var cy = GRAPH_BOX_PAD_TOP;

      var cellG = document.createElementNS(NS, 'g');
      cellG.setAttribute('data-cell-id', letter.cellId);

      /* 셀 배경 사각형 */
      var cellRect = document.createElementNS(NS, 'rect');
      cellRect.setAttribute('x', String(cx));
      cellRect.setAttribute('y', String(cy));
      cellRect.setAttribute('width', String(GRAPH_CELL_W));
      cellRect.setAttribute('height', String(GRAPH_CELL_H));
      cellRect.setAttribute('rx', '6'); cellRect.setAttribute('ry', '6');
      cellRect.setAttribute('fill', 'var(--panel-2)');
      var typeColor: string | null = letter.cellType === 'handakuten' ? '#db2777' : letter.cellType === 'dakuten' ? '#7c3aed' : letter.cellType === 'small' ? '#0ea5e9' : null;
      cellRect.setAttribute('stroke', typeColor || 'var(--border)');
      cellRect.setAttribute('stroke-width', typeColor ? '2' : '1.5');
      if (letter.cellType) cellRect.setAttribute('stroke-dasharray', '3 2');
      cellG.appendChild(cellRect);
      if (letter.cellType){
        var badgeFont = Math.max(11, Math.round(GRAPH_CELL_H * 0.3));
        var sbadge = document.createElementNS(NS, 'text');
        sbadge.setAttribute('x', String(cx + GRAPH_CELL_W - 2));
        sbadge.setAttribute('y', String(cy + badgeFont + 1));  /* 오른쪽 위 — 탁점/반탁점이 실제로 붙는 위치 */
        sbadge.setAttribute('text-anchor', 'end');
        sbadge.setAttribute('font-size', String(badgeFont));
        sbadge.setAttribute('font-weight', '700');
        sbadge.setAttribute('fill', typeColor || '');
        sbadge.setAttribute('pointer-events', 'none');
        sbadge.textContent = GRAPH_CELL_TYPE_BADGE[letter.cellType] || '';
        cellG.appendChild(sbadge);
      }

      /* 가나 글자 */
      var charTxt = document.createElementNS(NS, 'text');
      charTxt.setAttribute('x', String(cx + GRAPH_CELL_W / 2));
      charTxt.setAttribute('y', String(cy + GRAPH_CELL_H / 2 + GRAPH_CHAR_FONT * 0.36));
      charTxt.setAttribute('text-anchor', 'middle');
      charTxt.setAttribute('font-size', String(GRAPH_CHAR_FONT));
      charTxt.setAttribute('class', 'graph-cell-char');
      charTxt.setAttribute('font-family', 'var(--jp)');
      charTxt.setAttribute('fill', 'var(--text)');
      charTxt.setAttribute('pointer-events', 'none');
      charTxt.textContent = letter.char || '';
      cellG.appendChild(charTxt);

      /* 슬롯 인덱스 (작게) */
      var slotTxt = document.createElementNS(NS, 'text');
      slotTxt.setAttribute('x', String(cx + 3));
      slotTxt.setAttribute('y', String(cy + GRAPH_SLOT_FONT + 3));
      slotTxt.setAttribute('font-size', String(GRAPH_SLOT_FONT));
      slotTxt.setAttribute('fill', 'var(--muted)');
      slotTxt.setAttribute('pointer-events', 'none');
      slotTxt.textContent = String(si);
      cellG.appendChild(slotTxt);

      g.appendChild(cellG);
    });

    /* 드래그 이벤트 연결 */
    graphAttachWordBoxDrag(svg!, g, w.index);

    svg!.appendChild(g);
  });
}

/**
 * 단어 박스 드래그 핸들러 (포인터 이벤트, 마우스 + 터치 공통).
 * 이동 없는 클릭은 셀 편집기를 여는 것으로 처리한다.
 * @param {SVGSVGElement} svg
 * @param {SVGGElement} boxGroup
 * @param {number} wordIndex
 */
export function graphAttachWordBoxDrag(svg: SVGSVGElement, boxGroup: SVGGElement, wordIndex: number): void {
  var dragging = false;
  var moved = false;           /* 실제 이동이 4px 이상 있었는지 여부 */
  var pendingCellClick: Element | null = null; /* 이동 없는 클릭 시 편집기를 열 cellId */
  var longPressTimer: ReturnType<typeof setTimeout> | null = null;   /* 길게 누르기 → 셀 메뉴 */
  var startClientX = 0, startClientY = 0;
  var startPosX = 0, startPosY = 0;

  /* SVG 좌표계 스케일: clientPx → SVG user unit */
  function getSvgScale() {
    var bb = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return {
      sx: vb.width / (bb.width || 1),
      sy: vb.height / (bb.height || 1)
    };
  }

  /* SVG <g>의 touch-action을 무시하는 브라우저 폴백 — 박스 터치가 스크롤로 넘어가 드래그가 끊기는 것 방지 */
  boxGroup.addEventListener('touchstart', function(e) { e.preventDefault(); }, { passive: false });

  boxGroup.addEventListener('pointerdown', function(e) {
    /* 오른쪽 클릭(컨텍스트 메뉴용)은 드래그 시작하지 않음 */
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    moved = false;
    pendingCellClick = null;

    try { boxGroup.setPointerCapture(e.pointerId); } catch (_) {}
    startClientX = e.clientX;
    startClientY = e.clientY;
    var curPos = graphState.positions[wordIndex] || { x: 0, y: 0 };
    startPosX = curPos.x;
    startPosY = curPos.y;
    boxGroup.style.cursor = 'grabbing';

    /* 클릭 대상이 셀 안에 있으면 pendingCellClick 기록 */
    var target = e.target as Element | null;
    while (target && target !== boxGroup) {
      if (target.getAttribute && target.getAttribute('data-cell-id')) {
        pendingCellClick = target;
        break;
      }
      target = (target.parentElement || target.parentNode) as Element | null;
    }
    /* 셀 위에서 길게 누르기(터치) → 셀 컨텍스트 메뉴 (작은 글자만 토글) */
    if (pendingCellClick && !uiState.connectMode) {
      var cidLP = pendingCellClick.getAttribute('data-cell-id')!;
      longPressTimer = setTimeout(function() {
        moved = true; pendingCellClick = null;   /* 편집기/드래그 억제 */
        graphOpenCellMenu(cidLP, startClientX, startClientY);
      }, 500);
    }
  });

  boxGroup.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    var dx = Math.abs(e.clientX - startClientX);
    var dy = Math.abs(e.clientY - startClientY);
    if (dx > 4 || dy > 4) {
      moved = true;
      pendingCellClick = null; /* 이동했으므로 셀 클릭 취소 */
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
    if (!moved) return; /* 아직 임계값 미달이면 이동하지 않음 */
    e.preventDefault();
    var sc = getSvgScale();
    var ddx = (e.clientX - startClientX) * sc.sx;
    var ddy = (e.clientY - startClientY) * sc.sy;
    var newX = Math.max(0, startPosX + ddx);
    var newY = Math.max(0, startPosY + ddy);
    boxGroup.setAttribute('transform', 'translate(' + newX + ',' + newY + ')');
    graphState.positions[wordIndex] = { x: newX, y: newY };
    graphRenderEdges(); /* 규칙선이 박스를 따라 이동 */
  });

  function endDrag(e: PointerEvent) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!dragging) return;
    dragging = false;
    if (e && e.pointerId !== undefined) {
      try { boxGroup.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    boxGroup.style.cursor = 'grab';

    if (moved) {
      /* 실제 드래그: 위치 저장 */
      graphSaveState();
    } else if (pendingCellClick) {
      /* 이동 없는 클릭: 해당 셀 편집기 열기 */
      var cellId = pendingCellClick.getAttribute('data-cell-id')!;
      var letter = graphFindLetter(cellId);
      if (letter !== null) {
        var rectEl = pendingCellClick.querySelector('rect') || pendingCellClick;
        graphShowCellEditor(rectEl, cellId, letter.char);
      }
    }

    moved = false;
    pendingCellClick = null;
  }

  boxGroup.addEventListener('pointerup', endDrag);
  boxGroup.addEventListener('pointercancel', endDrag);
}
