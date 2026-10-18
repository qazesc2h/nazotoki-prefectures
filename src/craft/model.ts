/* 공작 — 종이 모델 (순수 함수, DOM 비의존)
   종이는 여러 장일 수 있고(sheet id), 각 장은 면(Facet)의 집합. 각 면은 작업대 좌표의 다각형(poly)과,
   그 장의 원래 좌표(격자 단위, 앞면 기준)→작업대 변환(xf)을 가진다. det(xf) < 0 이면 뒷면이 위를 향한 상태.
   자른 선(cuts)은 장별 종이 좌표로 기록하고, 같은 장의 면끼리 종이 좌표에서 변을 공유하면서 그 변이 잘리지 않았으면
   같은 조각(연결)으로 본다. 접기는 선 한쪽의 면을 반사하고 층(z)을 뒤집어 위/아래로 얹는 것. */
import { apply, applyPoly, compose, det, invert, splitPoly, side, area, centroid, bbox, pointInPoly, distToSegment, collinearOverlap, reflectAcross, mirrorX, translate, rotateAbout, polysOverlap, EPS } from './geom';
import type { Pt, Poly, Xf } from './geom';

export interface Facet { id: number; sheet: number; poly: Poly; xf: Xf; z: number; }
export interface Cut { sheet: number; a: Pt; b: Pt; }     /* 그 장의 종이 좌표 */
export interface Doc { facets: Facet[]; cuts: Cut[]; nextId: number; }

const ID: Xf = [1, 0, 0, 1, 0, 0];
/** 새 문서: 장 1 이 격자 w×h 를 덮는 한 면으로 원점에 놓임 */
export function newDoc(w: number, h: number, outline?: Poly): Doc {
  const d: Doc = { facets: [], cuts: [], nextId: 1 };
  return addSheet(d, 1, w, h, [0, 0], outline);
}
/** 장 추가: 평평한 새 종이 한 면을 작업대 at 위치에 (맨 위층으로) 놓는다 */
export function addSheet(doc: Doc, sheet: number, w: number, h: number, at: Pt, outline?: Poly): Doc {
  const out = cloneDoc(doc);
  const base: Poly = outline && outline.length >= 3 ? outline.map(p => [p[0], p[1]] as Pt) : [[0, 0], [w, 0], [w, h], [0, h]];
  const xf = translate(at[0], at[1]);
  const z = out.facets.length ? Math.max(...out.facets.map(f => f.z)) + 1 : 0;
  out.facets.push({ id: out.nextId++, sheet, poly: applyPoly(xf, base), xf, z });
  return out;
}
/** 장 제거 (그 장의 면·자른 선 모두) */
export function removeSheet(doc: Doc, sheet: number): Doc {
  const out = cloneDoc(doc);
  out.facets = out.facets.filter(f => f.sheet !== sheet);
  out.cuts = out.cuts.filter(c => c.sheet !== sheet);
  return out;
}
export function sheetIds(doc: Doc): number[] { return [...new Set(doc.facets.map(f => f.sheet))].sort((a, b) => a - b); }
export function cloneDoc(d: Doc): Doc { return JSON.parse(JSON.stringify(d)); }
export function isBack(f: Facet): boolean { return det(f.xf) < 0; }
export function isFlat(f: Facet): boolean { return f.xf.every((v, i) => Math.abs(v - ID[i]) < 1e-9); }
/** 면의 종이 좌표 다각형 */
export function sheetPoly(f: Facet): Poly { return applyPoly(invert(f.xf), f.poly); }

/* ---- 연결(조각) ---- */
function onCut(cuts: Cut[], sheet: number, p: Pt): boolean {
  for (const c of cuts) { if (c.sheet !== sheet) continue; const r = distToSegment(p, c.a, c.b); if (r.d < 1e-5) return true; }
  return false;
}
/** 같은 장의 두 면이 종이 좌표에서 변을 공유하고 그 변(의 일부)이 잘리지 않았으면 연결 */
function adjacent(a: Facet, b: Facet, cuts: Cut[], sa: Poly, sb: Poly): boolean {
  if (a.sheet !== b.sheet) return false;
  for (let i = 0; i < sa.length; i++) {
    const p = sa[i], q = sa[(i + 1) % sa.length];
    for (let j = 0; j < sb.length; j++) {
      const r = sb[j], s = sb[(j + 1) % sb.length];
      const ov = collinearOverlap(p, q, r, s);
      if (ov < 1e-6) continue;
      /* 겹치는 구간의 여러 지점 중 하나라도 잘리지 않았으면 연결 */
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const proj = (t: Pt) => (t[0] - p[0]) * ux + (t[1] - p[1]) * uy;
      const lo = Math.max(0, Math.min(proj(r), proj(s))), hi = Math.min(len, Math.max(proj(r), proj(s)));
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const t = lo + (hi - lo) * f;
        if (!onCut(cuts, a.sheet, [p[0] + ux * t, p[1] + uy * t])) return true;
      }
    }
  }
  return false;
}
/** 조각(연결 요소) 목록 — 각 조각은 면 id 배열 */
export function components(doc: Doc): number[][] {
  const n = doc.facets.length;
  const parent = [...Array(n).keys()];
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const sheets = doc.facets.map(sheetPoly);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (find(i) === find(j)) continue;
    if (adjacent(doc.facets[i], doc.facets[j], doc.cuts, sheets[i], sheets[j])) parent[find(i)] = find(j);
  }
  const groups = new Map<number, number[]>();
  doc.facets.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(f.id); });
  return [...groups.values()];
}
export function pieceOf(doc: Doc, facetId: number): number[] {
  return components(doc).find(c => c.includes(facetId)) || [facetId];
}
export function facetById(doc: Doc, id: number): Facet | undefined { return doc.facets.find(f => f.id === id); }

/** 포개진 묶음: ids 가 속한 조각과 (작업대에서) 면적을 두고 겹치는 조각들을 연쇄적으로 모은 면 id 목록 — 통째로 뒤집기·옮기기용 */
export function stackOf(doc: Doc, ids: number[]): number[] {
  const comps = components(doc);
  const inSet = new Set<number>();
  const queue: number[][] = [];
  for (const c of comps) if (c.some(id => ids.includes(id))) { queue.push(c); c.forEach(id => inSet.add(id)); }
  const polyOf = (id: number) => facetById(doc, id)!.poly;
  while (queue.length) {
    const cur = queue.pop()!;
    for (const c of comps) {
      if (c.some(id => inSet.has(id))) continue;
      const hit = c.some(x => cur.some(y => polysOverlap(polyOf(x), polyOf(y))));
      if (hit) { queue.push(c); c.forEach(id => inSet.add(id)); }
    }
  }
  return doc.facets.filter(f => inSet.has(f.id)).map(f => f.id);
}

/* ---- 조회 ---- */
export function facetsAt(doc: Doc, pt: Pt): Facet[] {
  return doc.facets.filter(f => pointInPoly(pt, f.poly)).sort((a, b) => b.z - a.z);
}
export function topFacetAt(doc: Doc, pt: Pt): Facet | null { return facetsAt(doc, pt)[0] || null; }
export interface Layer { facet: Facet; back: boolean; sheetPt: Pt; }
/** 한 지점에 쌓인 층 (위→아래) */
export function layersAt(doc: Doc, pt: Pt): Layer[] {
  return facetsAt(doc, pt).map(f => ({ facet: f, back: isBack(f), sheetPt: apply(invert(f.xf), pt) }));
}
export function docBounds(doc: Doc) { return bbox(doc.facets.map(f => f.poly)); }
export function sheetBounds(doc: Doc, sheet: number) { return bbox(doc.facets.filter(f => f.sheet === sheet).map(f => f.poly)); }

/* ---- 자르기 ---- */
function segmentTouchesPoly(a: Pt, b: Pt, poly: Poly): boolean {
  /* 선분의 중간점들이 다각형 안에 있거나, 다각형 변과 교차하면 닿는다 */
  for (const t of [0.5, 0.25, 0.75, 0.05, 0.95]) if (pointInPoly([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const d1 = side(a, b, p), d2 = side(a, b, q), d3 = side(p, q, a), d4 = side(p, q, b);
    if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && Math.abs(d1) > EPS && Math.abs(d2) > EPS) return true;
  }
  return false;
}
/** 작업대 좌표 선분으로 면들을 가르고 자른 선을 종이 좌표로 기록. onlyFacetIds 를 주면 그 면만(조각 단위 자르기) */
export function cutSegment(doc: Doc, a: Pt, b: Pt, onlyFacetIds?: number[]): Doc {
  const out = cloneDoc(doc);
  const next: Facet[] = [];
  for (const f of out.facets) {
    if (onlyFacetIds && !onlyFacetIds.includes(f.id)) { next.push(f); continue; }
    if (!segmentTouchesPoly(a, b, f.poly)) { next.push(f); continue; }
    const { left, right } = splitPoly(f.poly, a, b);
    if (!left.length || !right.length) { next.push(f); continue; }   /* 선이 면을 가르지 않음(가장자리만 스침) */
    next.push({ ...f, poly: left });
    next.push({ ...f, id: out.nextId++, poly: right });
    /* 실제 선분이 이 면 안을 지나는 부분만 자른 선으로 기록 (종이 좌표) */
    const inv = invert(f.xf);
    const clipped = clipSegmentToPoly(a, b, f.poly);
    for (const [p, q] of clipped) out.cuts.push({ sheet: f.sheet, a: apply(inv, p), b: apply(inv, q) });
  }
  out.facets = next;
  return out;
}
/** 선분 ab 중 다각형 안에 있는 구간들 */
function clipSegmentToPoly(a: Pt, b: Pt, poly: Poly): [Pt, Pt][] {
  /* 변과의 교점 파라미터 수집 → 구간별 중간점이 안이면 채택 */
  const ts = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const d1 = side(p, q, a), d2 = side(p, q, b);
    if (Math.abs(d1 - d2) < EPS) continue;
    const t = d1 / (d1 - d2);
    if (t > 0 && t < 1) { const x: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (distToSegment(x, p, q).d < 1e-7) ts.push(t); }
  }
  ts.sort((x, y) => x - y);
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i], t1 = ts[i + 1]; if (t1 - t0 < 1e-9) continue;
    const m: Pt = [a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2];
    if (pointInPoly(m, poly)) out.push([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]);
  }
  return out;
}
export function cutPolyline(doc: Doc, pts: Pt[], onlyFacetIds?: number[]): Doc {
  let d = doc;
  for (let i = 0; i + 1 < pts.length; i++) d = cutSegment(d, pts[i], pts[i + 1], onlyFacetIds);
  return d;
}

/* ---- 접기 ---- */
/**
 * 조각(pieceIds 면들)을 직선 a→b 로 접는다. movePt 쪽이 넘어가는 쪽.
 * over=true 면 넘어간 부분이 위로(앞으로) 올라오고, false 면 아래로(뒤로) 들어간다.
 */
export function foldPiece(doc: Doc, pieceIds: number[], a: Pt, b: Pt, movePt: Pt, over: boolean): Doc {
  const out = cloneDoc(doc);
  const R = reflectAcross(a, b);
  const moveSign = Math.sign(side(a, b, movePt)) || 1;
  const next: Facet[] = [];
  const moving: Facet[] = [];
  for (const f of out.facets) {
    if (!pieceIds.includes(f.id)) { next.push(f); continue; }
    const { left, right } = splitPoly(f.poly, a, b);
    const parts: { poly: Poly; mv: boolean }[] = [];
    if (left.length) parts.push({ poly: left, mv: moveSign > 0 });
    if (right.length) parts.push({ poly: right, mv: moveSign < 0 });
    if (!parts.length) { next.push(f); continue; }
    parts.forEach((p, i) => {
      const nf: Facet = { ...f, id: i === 0 ? f.id : out.nextId++, poly: p.poly };
      if (p.mv) { nf.poly = applyPoly(R, nf.poly); nf.xf = compose(R, nf.xf); moving.push(nf); }
      next.push(nf);
    });
  }
  if (!moving.length) return doc;
  /* 넘어간 부분: 층 순서 뒤집어 위(또는 아래)에 얹기 */
  const zs = next.map(f => f.z);
  const maxZ = Math.max(...zs), minZ = Math.min(...zs);
  moving.sort((x, y) => x.z - y.z);
  const n = moving.length;
  moving.forEach((f, i) => { f.z = over ? maxZ + 1 + (n - 1 - i) : minZ - n + (n - 1 - i); });
  out.facets = next;
  return out;
}

/* ---- 조각 조작 ---- */
export function transformFacets(doc: Doc, ids: number[], m: Xf): Doc {
  const out = cloneDoc(doc);
  for (const f of out.facets) if (ids.includes(f.id)) { f.poly = applyPoly(m, f.poly); f.xf = compose(m, f.xf); }
  return out;
}
export function pieceCenter(doc: Doc, ids: number[]): Pt {
  const b = bbox(doc.facets.filter(f => ids.includes(f.id)).map(f => f.poly));
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}
export function movePiece(doc: Doc, ids: number[], dx: number, dy: number): Doc { return transformFacets(doc, ids, translate(dx, dy)); }
export function rotatePiece(doc: Doc, ids: number[], rad: number, about?: Pt): Doc { return transformFacets(doc, ids, rotateAbout(about || pieceCenter(doc, ids), rad)); }
/** 조각 뒤집기: 세로축 반사 + 조각 안 층 순서 반전 */
export function flipPiece(doc: Doc, ids: number[]): Doc {
  const c = pieceCenter(doc, ids);
  const out = transformFacets(doc, ids, mirrorX(c[0]));
  const fs = out.facets.filter(f => ids.includes(f.id)).sort((a, b) => a.z - b.z);
  const zs = fs.map(f => f.z);
  fs.forEach((f, i) => { f.z = zs[zs.length - 1 - i]; });
  return out;
}
/** 전체 뒤집어 보기: 모든 면을 반사하고 층 순서 전체 반전 (작업대를 뒤에서 본 것과 같음) */
export function flipAll(doc: Doc): Doc {
  const ids = doc.facets.map(f => f.id);
  return flipPiece(doc, ids);
}
export function raisePiece(doc: Doc, ids: number[]): Doc {
  const out = cloneDoc(doc);
  const maxZ = Math.max(...out.facets.map(f => f.z));
  const fs = out.facets.filter(f => ids.includes(f.id)).sort((a, b) => a.z - b.z);
  fs.forEach((f, i) => { f.z = maxZ + 1 + i; });
  return out;
}
export function lowerPiece(doc: Doc, ids: number[]): Doc {
  const out = cloneDoc(doc);
  const minZ = Math.min(...out.facets.map(f => f.z));
  const fs = out.facets.filter(f => ids.includes(f.id)).sort((a, b) => a.z - b.z);
  fs.forEach((f, i) => { f.z = minZ - fs.length + i; });
  return out;
}
export function deletePiece(doc: Doc, ids: number[]): Doc {
  const out = cloneDoc(doc);
  out.facets = out.facets.filter(f => !ids.includes(f.id));
  return out;
}

/* ---- 스냅 점: 격자점 · 변 중점 · 칸 중심 (면 안에 있는 것만, 작업대 좌표) ---- */
export function snapPoints(doc: Doc): Pt[] {
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const f of doc.facets) {
    const sp = sheetPoly(f);
    const b = bbox([sp]);
    const x0 = Math.floor(b.minX * 2) / 2 - 0.5, x1 = Math.ceil(b.maxX * 2) / 2 + 0.5;
    const y0 = Math.floor(b.minY * 2) / 2 - 0.5, y1 = Math.ceil(b.maxY * 2) / 2 + 0.5;
    for (let x = x0; x <= x1 + 1e-9; x += 0.5) for (let y = y0; y <= y1 + 1e-9; y += 0.5) {
      const p: Pt = [x, y];
      if (!pointInPoly(p, sp) && !onBoundary(p, sp)) continue;
      const w = apply(f.xf, p);
      const k = w[0].toFixed(4) + ',' + w[1].toFixed(4);
      if (!seen.has(k)) { seen.add(k); out.push(w); }
    }
  }
  return out;
}
function onBoundary(p: Pt, poly: Poly): boolean {
  for (let i = 0; i < poly.length; i++) if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]).d < 1e-6) return true;
  return false;
}
export function nearestSnap(points: Pt[], p: Pt, radius: number): Pt | null {
  let best: Pt | null = null, bd = radius;
  for (const s of points) { const d = Math.hypot(s[0] - p[0], s[1] - p[1]); if (d < bd) { bd = d; best = s; } }
  return best;
}

/** 변 분류 — outline: 보이는 테두리(잘린 변·바깥 변), crease: 접힘선(종이에서 이어졌지만 놓인 방향이 다른 면과 맞닿는 변).
    같은 변환(xf)의 면끼리 맞닿는 변은 자르기로 생긴 보이지 않는 이음새라 어디에도 넣지 않는다. 작업대 좌표. */
export function classifyEdges(doc: Doc): { outline: Map<number, [Pt, Pt][]>; crease: Map<number, [Pt, Pt][]> } {
  const outline = new Map<number, [Pt, Pt][]>(), crease = new Map<number, [Pt, Pt][]>();
  const sheets = doc.facets.map(sheetPoly);
  const sameXf = (a: Xf, b: Xf) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  doc.facets.forEach((f, fi) => {
    const sp = sheets[fi];
    const o: [Pt, Pt][] = [], c: [Pt, Pt][] = [];
    for (let i = 0; i < sp.length; i++) {
      const p = sp[i], q = sp[(i + 1) % sp.length];
      const m: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const edge: [Pt, Pt] = [f.poly[i], f.poly[(i + 1) % f.poly.length]];
      if (onCut(doc.cuts, f.sheet, m)) { o.push(edge); continue; }
      let shared: Facet | null = null;
      for (let gj = 0; gj < doc.facets.length && !shared; gj++) {
        if (gj === fi || doc.facets[gj].sheet !== f.sheet) continue;
        const sq = sheets[gj];
        for (let j = 0; j < sq.length; j++) if (collinearOverlap(p, q, sq[j], sq[(j + 1) % sq.length]) > 1e-6) { shared = doc.facets[gj]; break; }
      }
      if (!shared) o.push(edge);
      else if (!sameXf(shared.xf, f.xf)) c.push(edge);
    }
    outline.set(f.id, o); crease.set(f.id, c);
  });
  return { outline, crease };
}
/** 면의 변 중 "보이는 테두리"(다른 면과 종이에서 이어지지 않거나 잘린 변) — 그릴 때 선을 긋는 변 */
export function outlineEdges(doc: Doc): [Pt, Pt][] {
  return [...classifyEdges(doc).outline.values()].flat();
}
export { area, centroid };
