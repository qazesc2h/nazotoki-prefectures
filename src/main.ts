/* 앱 셸: 상단 도구 토글(도도부현/현청소재지/규칙 그래프/바바누키/시리토리) + 콘텐츠 탭 전환.
   각 도구는 자기 모듈이 담당하고, 여기서는 어느 뷰를 보일지만 정한다. */
import './styles.css';
import { $ } from './shared/dom';
import { initPrefectures, renderPrefTab, setMode, clearStruck, state as prefState, refreshStrikeUI } from './prefectures/ui';
import type { Mode } from './prefectures/data';
import { graphInit, graphRender } from './graph/ui';
import { babaInit, babaRender } from './babanuki/ui';
import { shiriInit, shiriRender } from './shiritori/ui';
import { polyInit, polyRender } from './polyomino/ui';
import { craftInit, craftRender } from './craft/ui';

type Tab = 'search' | 'all' | 'map' | 'shapes' | 'graph' | 'babanuki' | 'shiritori' | 'polyomino' | 'craft';
const TOOL_VIEWS: Tab[] = ['graph', 'babanuki', 'shiritori', 'polyomino', 'craft'];   /* 상단 토글 레벨 도구 뷰 (콘텐츠 탭 줄 숨김) */

const app = { tab: 'search' as Tab };

const els = {
  modeSeg: $('#modeSeg'), tabs: $('#tabs'),
  modeSwitch: $('#modeSwitch'), modeToggle: $<HTMLButtonElement>('#modeToggle'), modeToggleLabel: $('#modeToggleLabel'),
  resetStrike: $<HTMLButtonElement>('#resetStrike'),
  sections: {
    search: $('#tab-search'), all: $('#tab-all'), map: $('#tab-map'), shapes: $('#tab-shapes'),
    graph: $('#tab-graph'), babanuki: $('#tab-babanuki'), shiritori: $('#tab-shiritori'), polyomino: $('#tab-polyomino'), craft: $('#tab-craft'),
  } as Record<Tab, HTMLElement>,
};

/* 모바일 햄버거 토글: 현재 선택(.on 버튼) 라벨을 토글 버튼에 반영 */
function syncModeToggleLabel(): void {
  const on = els.modeSeg.querySelector('button.on');
  if (on) els.modeToggleLabel.textContent = on.textContent;
}
function closeModeMenu(): void {
  els.modeSwitch.classList.remove('open');
  els.modeToggle.setAttribute('aria-expanded', 'false');
}

function renderActiveTab(): void {
  if (app.tab === 'graph') graphRender();
  else if (app.tab === 'babanuki') babaRender();
  else if (app.tab === 'shiritori') shiriRender();
  else if (app.tab === 'polyomino') polyRender();
  else if (app.tab === 'craft') craftRender();
  else renderPrefTab(app.tab);
}

export function setTab(tab: Tab): void {
  app.tab = tab;
  const isView = TOOL_VIEWS.includes(tab);
  els.tabs.classList.toggle('hidden', isView);
  els.tabs.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  (Object.keys(els.sections) as Tab[]).forEach(k => els.sections[k].classList.toggle('hidden', k !== tab));
  /* 상단 토글 활성 상태: 도구 뷰 vs 도도부현/현청소재지 */
  els.modeSeg.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
    if (b.dataset.view) b.classList.toggle('on', b.dataset.view === tab);
    else b.classList.toggle('on', !isView && b.dataset.mode === prefState.mode);
  });
  syncModeToggleLabel();
  renderActiveTab();
}

function init(): void {
  initPrefectures({ getTab: () => app.tab });
  graphInit();
  babaInit();
  shiriInit({ isActive: () => app.tab === 'shiritori' });
  polyInit({ isActive: () => app.tab === 'polyomino' });
  craftInit({ isActive: () => app.tab === 'craft' });

  els.modeSeg.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button'); if (!b) return;
    closeModeMenu();   /* 모바일: 항목 선택 시 드롭다운 닫기 */
    if (b.dataset.view) { setTab(b.dataset.view as Tab); return; }
    if (TOOL_VIEWS.includes(app.tab)) setTab('search');   /* 도구 뷰에서 데이터 모드 선택 시 검색 도구로 복귀 */
    setMode(b.dataset.mode as Mode);
    els.modeSeg.querySelectorAll<HTMLButtonElement>('button').forEach(x => x.classList.toggle('on', x.dataset.mode === prefState.mode));
    syncModeToggleLabel();
  });
  /* 햄버거 토글 열기/닫기 + 바깥 클릭·Esc 로 닫기 */
  els.modeToggle.addEventListener('click', () => {
    const open = els.modeSwitch.classList.toggle('open');
    els.modeToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => { if (!els.modeSwitch.contains(e.target as Node)) closeModeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModeMenu(); });
  els.tabs.addEventListener('click', e => { const b = (e.target as Element).closest<HTMLButtonElement>('button'); if (b) setTab(b.dataset.tab as Tab); });
  els.resetStrike.addEventListener('click', clearStruck);

  refreshStrikeUI();
  setTab('search');
}
init();

/* 브라우저 E2E 테스트용 훅 (번들 외부에서 상태를 들여다보기 위함 — 앱 동작에는 쓰지 않음) */
import { graphState } from './graph/state';
import { graphSetCellType, graphCreateRule } from './graph/ui';
import { graphFindLetter } from './graph/state';
import { polyState } from './polyomino/state';
import { craftState } from './craft/state';
import { currentView as craftView } from './craft/canvas';
import { toPx as craftToPx } from './craft/render';
(window as unknown as { __nz: unknown }).__nz = { prefState, graphState, graphFindLetter, graphSetCellType, graphCreateRule, polyState, craftState, craftView, craftToPx };
