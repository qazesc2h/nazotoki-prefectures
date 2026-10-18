/* 공작(종이 접기·자르기) — 2D 기하 (순수 함수).
   점은 [x, y], 다각형은 점 배열. 아핀 변환 Xf 는 [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f). */

export type Pt = [number, number];
export type Poly = Pt[];
export type Xf = [number, number, number, number, number, number];

export const EPS = 1e-7;
export const IDENTITY: Xf = [1, 0, 0, 1, 0, 0];

export function apply(m: Xf, p: Pt): Pt { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
export function applyPoly(m: Xf, poly: Poly): Poly { return poly.map(p => apply(m, p)); }
/** compose(A, B) = A ∘ B (B 를 먼저 적용) */
export function compose(A: Xf, B: Xf): Xf {
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}
export function det(m: Xf): number { return m[0] * m[3] - m[1] * m[2]; }
export function invert(m: Xf): Xf {
  const d = det(m); if (Math.abs(d) < EPS) throw new Error('singular transform');
  const a = m[3] / d, b = -m[1] / d, c = -m[2] / d, dd = m[0] / d;
  return [a, b, c, dd, -(a * m[4] + c * m[5]), -(b * m[4] + dd * m[5])];
}
export function translate(dx: number, dy: number): Xf { return [1, 0, 0, 1, dx, dy]; }
/** 점 c 를 중심으로 각도 rad 회전 */
export function rotateAbout(c: Pt, rad: number): Xf {
  const co = Math.cos(rad), si = Math.sin(rad);
  return [co, si, -si, co, c[0] - co * c[0] + si * c[1], c[1] - si * c[0] - co * c[1]];
}
/** 직선(p, 방향 d)에 대한 반사 */
export function reflectAcross(p: Pt, q: Pt): Xf {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const len2 = dx * dx + dy * dy || 1;
  const a = (dx * dx - dy * dy) / len2, b = (2 * dx * dy) / len2;
  /* x' = a·(x-px) + b·(y-py) + px ; y' = b·(x-px) - a·(y-py) + py */
  return [a, b, b, -a, p[0] - a * p[0] - b * p[1], p[1] - b * p[0] + a * p[1]];
}
/** 세로축(x = cx)에 대한 반사 (조각 뒤집기) */
export function mirrorX(cx: number): Xf { return [-1, 0, 0, 1, 2 * cx, 0]; }

/** 직선 p→q 기준으로 점 r 이 어느 쪽인가: >0 왼쪽, <0 오른쪽, 0 위 */
export function side(p: Pt, q: Pt, r: Pt): number { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
/** 다각형을 직선 p→q 로 잘라 {left, right} (Sutherland–Hodgman). 선 위 점은 양쪽에 포함. 빈 쪽은 [] */
export function splitPoly(poly: Poly, p: Pt, q: Pt): { left: Poly; right: Poly } {
  const left: Poly = [], right: Poly = [];
  const n = poly.length;
  if (!n) return { left, right };
  const tol = 1e-9;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const sa = side(p, q, a), sb = side(p, q, b);
    const aL = sa > tol, aR = sa < -tol;
    if (!aL && !aR) { left.push(a); right.push(a); }
    else if (aL) left.push(a); else right.push(a);
    const bL = sb > tol, bR = sb < -tol;
    if ((aL && bR) || (aR && bL)) {
      const t = sa / (sa - sb);
      const x: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      left.push(x); right.push(x);
    }
  }
  const clean = (ps: Poly): Poly => {
    const out: Poly = [];
    for (const pt of ps) { const last = out[out.length - 1]; if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 1e-9) out.push(pt); }
    if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop();
    return Math.abs(area(out)) > 1e-9 ? out : [];
  };
  return { left: clean(left), right: clean(right) };
}
export function area(poly: Poly): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
export function centroid(poly: Poly): Pt {
  const A = area(poly);
  if (Math.abs(A) < EPS) { const n = poly.length || 1; return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]; }
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const w = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * w; cy += (a[1] + b[1]) * w; }
  return [cx / (6 * A), cy / (6 * A)];
}
export function bbox(polys: Poly[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
export function pointInPoly(pt: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function dist(a: Pt, b: Pt): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
/** 점에서 선분 ab 까지 거리와 가장 가까운 점 */
export function distToSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number; q: Pt } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Pt = [a[0] + dx * t, a[1] + dy * t];
  return { d: dist(p, q), t, q };
}
/** 같은 직선 위의 두 선분이 겹치는 구간 (없으면 null) */
export function collinearOverlapSegment(a: Pt, b: Pt, c: Pt, d: Pt): [Pt, Pt] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy); if (len < EPS) return null;
  const ux = dx / len, uy = dy / len;
  const off = (p: Pt) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
  if (off(c) > 1e-6 || off(d) > 1e-6) return null;
  const proj = (p: Pt) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const lo = Math.max(0, Math.min(proj(c), proj(d))), hi = Math.min(len, Math.max(proj(c), proj(d)));
  if (hi - lo < 1e-6) return null;
  return [[a[0] + ux * lo, a[1] + uy * lo], [a[0] + ux * hi, a[1] + uy * hi]];
}
/** 두 선분이 겹치는 길이 (같은 직선 위에 있을 때만, 아니면 0) — 면 인접 판정용 */
export function collinearOverlap(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy); if (len < EPS) return 0;
  const ux = dx / len, uy = dy / len;
  /* c, d 가 직선 ab 위에 있는가 */
  const off = (p: Pt) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
  if (off(c) > 1e-6 || off(d) > 1e-6) return 0;
  const proj = (p: Pt) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const lo = Math.max(0, Math.min(proj(c), proj(d))), hi = Math.min(len, Math.max(proj(c), proj(d)));
  return Math.max(0, hi - lo);
}

/** 두 볼록 다각형이 면적을 두고 겹치는가 (변만 맞닿으면 false). 면은 사각형을 직선으로 잘라 만들어지므로 항상 볼록 */
export function polysOverlap(a: Poly, b: Poly, tol = 1e-6): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const axes = (poly: Poly) => poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return [-(q[1] - p[1]), q[0] - p[0]] as Pt; });
  for (const ax of [...axes(a), ...axes(b)]) {
    const len = Math.hypot(ax[0], ax[1]); if (len < EPS) continue;
    const u: Pt = [ax[0] / len, ax[1] / len];
    const pr = (poly: Poly) => { let lo = Infinity, hi = -Infinity; for (const p of poly) { const v = p[0] * u[0] + p[1] * u[1]; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
    const [a0, a1] = pr(a), [b0, b1] = pr(b);
    if (a1 - b0 <= tol || b1 - a0 <= tol) return false;   /* 이 축에서 떨어져 있거나 변만 닿음 */
  }
  return true;
}
