/* 규칙 그래프 — 캔버스 레이아웃 상수·순수 함수 (DOM 비의존) */
import type { Word, Positions, Pos } from './model';


/* 셀/박스 치수 — graphUpdateMetrics()가 화면 폭에 따라 갱신 (모바일에선 작게) */
export let GRAPH_CELL_W = 44;      // 셀 너비 px
export let GRAPH_CELL_H = 48;      // 셀 높이 px
export let GRAPH_CELL_GAP = 6;     // 셀 수평 간격
export let GRAPH_BOX_PAD_X = 12;   // 박스 좌우 내부 여백
export let GRAPH_BOX_PAD_TOP = 14; // 박스 위 여백
export let GRAPH_BOX_PAD_BOT = 12; // 박스 아래 내부 여백
export let GRAPH_BOX_GAP_X = 24;   // 박스 수평 간격
export let GRAPH_BOX_GAP_Y = 24;   // 박스 수직 간격
export let GRAPH_CANVAS_PAD = 20;  // 캔버스 가장자리 여백
export let GRAPH_CHAR_FONT = 20;   // 셀 글자 폰트 px
export let GRAPH_SLOT_FONT = 9;    // 슬롯 인덱스 폰트 px
/** 화면 폭에 따라 셀/박스/폰트 치수를 조정한다 (모바일에서 셀을 작게). */
export function graphUpdateMetrics(): void {
  var narrow = !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  if (narrow){
    GRAPH_CELL_W = 30; GRAPH_CELL_H = 34; GRAPH_CELL_GAP = 4;
    GRAPH_BOX_PAD_X = 8; GRAPH_BOX_PAD_TOP = 11; GRAPH_BOX_PAD_BOT = 8;
    GRAPH_BOX_GAP_X = 14; GRAPH_BOX_GAP_Y = 14; GRAPH_CANVAS_PAD = 12;
    GRAPH_CHAR_FONT = 16; GRAPH_SLOT_FONT = 8;
  } else {
    GRAPH_CELL_W = 44; GRAPH_CELL_H = 48; GRAPH_CELL_GAP = 6;
    GRAPH_BOX_PAD_X = 12; GRAPH_BOX_PAD_TOP = 14; GRAPH_BOX_PAD_BOT = 12;
    GRAPH_BOX_GAP_X = 24; GRAPH_BOX_GAP_Y = 24; GRAPH_CANVAS_PAD = 20;
    GRAPH_CHAR_FONT = 20; GRAPH_SLOT_FONT = 9;
  }
}

/**
 * 단어 박스 크기 계산 (순수 함수)
 * @param {number} charCount
 * @returns {{w: number, h: number}}
 */
export function graphBoxSize(charCount: number): { w: number; h: number } {
  var w = GRAPH_BOX_PAD_X * 2 + charCount * GRAPH_CELL_W + Math.max(0, charCount - 1) * GRAPH_CELL_GAP;
  var h = GRAPH_BOX_PAD_TOP + GRAPH_CELL_H + GRAPH_BOX_PAD_BOT;
  return { w: w, h: h };
}

/**
 * 두 박스의 겹침 여부 판정 (순수 함수; 경계만 접촉하는 경우는 겹침 아님)
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 * @returns {boolean}
 */
interface Box { x: number; y: number; w: number; h: number; }
export function graphBoxesOverlap(a: Box, b: Box): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
           a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * 겹침 없는 자동 배치 알고리즘 (순수 함수, DOM 없음)
 *
 * 이미 저장된 위치(savedPositions)가 있는 단어는 그 위치를 우선 사용한다.
 * 위치가 없는 단어는 선반(shelf) 방식으로 오른쪽→다음 줄 순으로 배치한다.
 * 선반 배치는 저장된 박스들의 아래쪽부터 시작해 겹치지 않는다.
 *
 * @param {Array} words            - 단어 배열 [{index, charCount, letters}]
 * @param {Object} savedPositions  - {[wordIndex]: {x,y}} 이미 저장된 박스 원점
 * @param {number} canvasW         - 캔버스 폭(px)
 * @returns {Object}               - {[wordIndex]: {x,y}}
 */
export function graphComputeLayout(words: Word[], savedPositions: Positions | null | undefined, canvasW?: number): Record<number, Pos> {
  var saved: Positions = savedPositions || {};
  canvasW = canvasW || 800;

  var result: Record<number, Pos> = {};
  var placedBoxes: Box[] = [];

  /* Pass 1: 저장된 위치를 먼저 확정 */
  words.forEach(function(w) {
    var sp = saved[w.index];
    if (sp !== undefined && sp !== null) {
      result[w.index] = { x: sp.x, y: sp.y };
      var sz = graphBoxSize(w.charCount);
      placedBoxes.push({ x: sp.x, y: sp.y, w: sz.w, h: sz.h });
    }
  });

  /* Pass 2: 위치 없는 단어 → 선반 배치 */
  var toPlace = words.filter(function(w) { return result[w.index] === undefined; });
  if (!toPlace.length) return result;

  /* 선반 시작 y = 기존 박스들의 최하단 아래 */
  var shelfY = GRAPH_CANVAS_PAD;
  if (placedBoxes.length) {
    var maxBottom = Math.max.apply(null, placedBoxes.map(function(b) { return b.y + b.h; }));
    shelfY = maxBottom + GRAPH_BOX_GAP_Y;
  }
  var shelfX = GRAPH_CANVAS_PAD;
  var shelfH = 0;

  toPlace.forEach(function(w) {
    var sz = graphBoxSize(w.charCount);

    /* 현재 선반에 넣으면 오른쪽으로 넘치면 다음 줄로 이동
       (첫 번째 박스는 항상 현재 줄에 놓음) */
    if (shelfX > GRAPH_CANVAS_PAD && shelfX + sz.w > canvasW - GRAPH_CANVAS_PAD) {
      shelfY += shelfH + GRAPH_BOX_GAP_Y;
      shelfX = GRAPH_CANVAS_PAD;
      shelfH = 0;
    }

    result[w.index] = { x: shelfX, y: shelfY };
    placedBoxes.push({ x: shelfX, y: shelfY, w: sz.w, h: sz.h });
    shelfX += sz.w + GRAPH_BOX_GAP_X;
    shelfH = Math.max(shelfH, sz.h);
  });

  return result;
}

/**
 * 단어 삭제 후 positions 재매핑 (순수 함수)
 * targetIndex 단어의 위치는 제거하고,
 * targetIndex보다 큰 인덱스는 1씩 감소시킨다.
 * @param {Object} positions  - {[wordIndex]: {x,y}}
 * @param {number} targetIndex
 * @returns {Object}
 */
export function graphRemapPositions(positions: Positions, targetIndex: number): Positions {
  var result: Positions = {};
  Object.keys(positions).forEach(function(key) {
    var wi = Number(key);
    if (!Number.isFinite(wi)) return;
    if (wi === targetIndex) return; // 삭제된 단어
    var newWi = wi > targetIndex ? wi - 1 : wi;
    result[newWi] = positions[key];
  });
  return result;
}

