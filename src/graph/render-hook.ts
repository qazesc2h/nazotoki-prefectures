/* 규칙 그래프 — 전체 재렌더 진입점.
   렌더 구현(ui.ts)은 단어 목록·캔버스·규칙선 모듈을 모두 import 하고, 그 모듈들도 재렌더를 요청해야 하므로
   순환 import 를 피하려고 여기서 함수를 간접 호출한다. ui.ts 가 초기화 때 setGraphRenderer 로 등록한다. */
let renderer: () => void = () => {};
export function setGraphRenderer(fn: () => void): void { renderer = fn; }
/** 엔진 재계산 + 단어 목록·캔버스·규칙선·범례 전체 재렌더 */
export function graphRender(): void { renderer(); }
