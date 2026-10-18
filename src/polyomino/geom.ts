/* 폴리오미노 — 도면 SVG 의 현재 기하 정보 (board.ts 가 그릴 때 갱신, drag 가 읽음). 의존 없음. */
export const boardGeom = { svg: null as SVGSVGElement | null, px: 36, pad: 6 };

/** 클라이언트 좌표 → 도면 칸 좌표 (도면 밖이면 범위 밖 값이 나올 수 있음, svg 없으면 null) */
export function cellAtClient(clientX: number, clientY: number): { x: number; y: number; fx: number; fy: number } | null {
  const svg = boardGeom.svg;
  if (!svg) return null;
  const bb = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const sx = vb.width / (bb.width || 1), sy = vb.height / (bb.height || 1);
  const fx = ((clientX - bb.left) * sx - boardGeom.pad) / boardGeom.px;
  const fy = ((clientY - bb.top) * sy - boardGeom.pad) / boardGeom.px;
  return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
}
