/* 규칙 그래프 — 현재 상태로 엔진을 돌린 결과 보관 (저장하지 않음, 매번 재계산) */
import { graphState } from './state';
import { computeEngine } from './engine';
import type { EngineResult } from './engine';

export let graphEngine: EngineResult = { value: {}, state: {}, conflict: {}, ruleViol: {} };
export function graphComputeEngine(): void {
  graphEngine = computeEngine(graphState.words, graphState.rules, graphState);
}
