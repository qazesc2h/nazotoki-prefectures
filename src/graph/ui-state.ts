/* 규칙 그래프 — UI 전용 휘발 상태 (저장하지 않음). 여러 UI 모듈이 함께 읽고 쓴다. */
export const uiState = {
  connectMode: false,                 /* 🔗 규칙 연결 모드 */
  selectedRuleIdx: null as number | null,   /* 클릭해 선택한 규칙선 인덱스 (삭제 팝업 대상) */
};
