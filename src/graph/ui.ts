/* 규칙 그래프 — 진입점: 전체 렌더 조립 + 초기화(전역 토글·문서 핸들러). 세부는 각 모듈 참고:
   word-list(단어 목록) · canvas(캔버스/드래그) · edges(규칙선·추론 표시) · editor(셀 편집기) ·
   connect(규칙 연결 모드) · menus(규칙/셀 메뉴) · rules(범례·규칙선 선택/삭제) · form(상단 폼) */
import { graphUpdateMetrics } from './layout';
import { graphState, graphLoadState, graphSaveState } from './state';
import { VOICED_CHAIN_ORDER, VOICED_CHAIN_LABEL } from './engine';
import { graphComputeEngine } from './engine-run';
import { uiState } from './ui-state';
import { graphRender, setGraphRenderer } from './render-hook';
import { graphRenderWordList } from './word-list';
import { graphRenderCanvas } from './canvas';
import { graphRenderEdges, graphApplyEngineVisuals } from './edges';
import { graphInitCellEditor } from './editor';
import { graphInitForm } from './form';
import { graphInitConnect } from './connect';
import { graphCloseRuleMenu, graphCloseCellMenu } from './menus';
import { graphRenderLegend, graphRefreshEdgePopLabel, graphClearRuleSelection, graphDeleteSelectedRule } from './rules';

export { graphRender } from './render-hook';
export { graphCreateRule, graphSetCellType } from './menus';

function graphRenderImpl(): void {
  graphUpdateMetrics();
  graphComputeEngine();
  graphRenderWordList();
  graphRenderCanvas();
  graphRenderEdges();
  graphApplyEngineVisuals();
  graphRenderLegend();
}

export function graphInit(): void {
  setGraphRenderer(graphRenderImpl);
  graphLoadState();
  graphInitForm();
  graphInitConnect();     /* AC2: 규칙 연결 모드 */
  graphInitCellEditor();  /* Sub-AC 5: 셀 편집기 초기화 */

  /* 규칙 연결 모드 토글 */
  const connectBtn = document.getElementById('graphConnectToggle');
  var connectHint = document.getElementById('graphConnectHint');
  var canvasWrap = document.getElementById('graph-canvas-wrap');
  if (connectBtn) {
    connectBtn.addEventListener('click', function() {
      uiState.connectMode = !uiState.connectMode;
      connectBtn.classList.toggle('on', uiState.connectMode);
      connectBtn.setAttribute('aria-pressed', String(uiState.connectMode));
      connectBtn.textContent = uiState.connectMode ? '🔗 규칙 연결: 켬' : '🔗 규칙 연결: 끔';
      if (connectHint) connectHint.style.display = uiState.connectMode ? '' : 'none';
      if (canvasWrap) canvasWrap.classList.toggle('connect-mode', uiState.connectMode);
      graphCloseRuleMenu(); graphClearRuleSelection();
    });
  }

  /* 작은⇄큰 같은 글자 전역 토글 */
  const looseBtn = document.getElementById('graphLooseToggle');
  if (looseBtn) {
    var syncLoose = function() {
      looseBtn.classList.toggle('on', !!graphState.looseSmallLarge);
      looseBtn.setAttribute('aria-pressed', String(!!graphState.looseSmallLarge));
      looseBtn.textContent = '작은⇄큰 같은 글자: ' + (graphState.looseSmallLarge ? '켬' : '끔');
    };
    syncLoose();
    looseBtn.addEventListener('click', function() {
      graphState.looseSmallLarge = !graphState.looseSmallLarge;
      graphSaveState();
      syncLoose();
      graphRender();
      graphRefreshEdgePopLabel();
    });
  }

  /* '다음 글자' 순환(끝→처음) 전역 토글 */
  const wrapBtn = document.getElementById('graphWrapToggle');
  if (wrapBtn) {
    var syncWrap = function() {
      wrapBtn.classList.toggle('on', !!graphState.seqWrap);
      wrapBtn.setAttribute('aria-pressed', String(!!graphState.seqWrap));
      wrapBtn.textContent = '순환 ん→あ: ' + (graphState.seqWrap ? '켬' : '끔');
    };
    syncWrap();
    wrapBtn.addEventListener('click', function() {
      graphState.seqWrap = !graphState.seqWrap;
      graphSaveState();
      syncWrap();
      graphRender();
      graphRefreshEdgePopLabel();
    });
  }

  /* 탁음 '다음 글자' 처리 전역 토글 — 행 안에서만 → が→ざ→だ→ば → ぱ행까지 (순환) */
  const voicedBtn = document.getElementById('graphVoicedToggle');
  if (voicedBtn) {
    const syncVoiced = function() {
      voicedBtn.classList.toggle('on', graphState.voicedChain !== 'row');
      voicedBtn.setAttribute('aria-pressed', String(graphState.voicedChain !== 'row'));
      voicedBtn.textContent = '탁음 다음: ' + VOICED_CHAIN_LABEL[graphState.voicedChain];
    };
    syncVoiced();
    voicedBtn.addEventListener('click', function() {
      const i = VOICED_CHAIN_ORDER.indexOf(graphState.voicedChain);
      graphState.voicedChain = VOICED_CHAIN_ORDER[(i + 1) % VOICED_CHAIN_ORDER.length];
      graphSaveState();
      syncVoiced();
      graphRender();
      graphRefreshEdgePopLabel();
    });
  }

  /* 규칙선 표시/숨김 전역 토글 — 숨겨도 규칙·추론은 유지 */
  const edgesBtn = document.getElementById('graphEdgesToggle');
  if (edgesBtn) {
    var syncEdges = function() {
      edgesBtn.classList.toggle('on', graphState.showEdges !== false);
      edgesBtn.setAttribute('aria-pressed', String(graphState.showEdges !== false));
      edgesBtn.textContent = '규칙선 표시: ' + (graphState.showEdges !== false ? '켬' : '끔');
    };
    syncEdges();
    edgesBtn.addEventListener('click', function() {
      graphState.showEdges = graphState.showEdges === false;
      graphSaveState();
      syncEdges();
      if (graphState.showEdges === false) graphClearRuleSelection();  /* 선이 없으면 선택·팝업도 닫기 */
      graphRender();
    });
  }

  /* 규칙선 삭제 팝업 버튼 */
  var edgeDelBtn = document.getElementById('graph-edge-del');
  if (edgeDelBtn) edgeDelBtn.addEventListener('click', function(e) { e.stopPropagation(); graphDeleteSelectedRule(); });

  /* 바깥 클릭 시 메뉴/규칙선 선택 닫기 */
  document.addEventListener('pointerdown', function(e) {
    var t = e.target as Element;
    if (!(t.closest && t.closest('#graph-rule-menu'))) graphCloseRuleMenu();
    if (!(t.closest && t.closest('#graph-cell-menu'))) graphCloseCellMenu();
    if (!(t.closest && (t.closest('#graph-edge-pop') || t.closest('.graph-edge')))) graphClearRuleSelection();
  });

  /* Delete/Backspace 로 선택된 규칙선 삭제 (입력 중이 아닐 때) */
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && uiState.selectedRuleIdx !== null) {
      var t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      graphDeleteSelectedRule();
    }
  });
}
