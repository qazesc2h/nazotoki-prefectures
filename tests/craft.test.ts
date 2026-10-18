import { describe, it, expect } from 'vitest';
import { splitPoly, area, reflectAcross, apply, compose, invert, det, rotateAbout, mirrorX, collinearOverlap, pointInPoly } from '../src/craft/geom';
import type { Pt } from '../src/craft/geom';
import { newDoc, cutSegment, cutPolyline, components, foldPiece, flipPiece, flipAll, isBack, layersAt, topFacetAt, snapPoints, sheetPoly, movePiece, rotatePiece, raisePiece, deletePiece, outlineEdges } from '../src/craft/model';

const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

describe('기하', () => {
  it('직선으로 다각형 자르기 · 면적 보존', () => {
    const sq: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const { left, right } = splitPoly(sq, [1, -1], [1, 3]);
    expect(Math.abs(area(left)) + Math.abs(area(right))).toBeCloseTo(4);
    expect(Math.abs(area(left))).toBeCloseTo(2);
    /* 대각선 */
    const d = splitPoly(sq, [0, 0], [2, 2]);
    expect(Math.abs(area(d.left))).toBeCloseTo(2); expect(Math.abs(area(d.right))).toBeCloseTo(2);
    /* 닿지 않는 선 */
    const miss = splitPoly(sq, [5, 0], [5, 2]);
    expect(miss.left.length + miss.right.length).toBe(4);
    expect(miss.left.length === 0 || miss.right.length === 0).toBe(true);
  });
  it('반사·회전·역변환', () => {
    const R = reflectAcross([1, 0], [1, 5]);        /* x = 1 축 */
    expect(near(apply(R, [3, 2]), [-1, 2])).toBe(true);
    expect(det(R)).toBeCloseTo(-1);
    const D = reflectAcross([0, 0], [1, 1]);        /* y = x */
    expect(near(apply(D, [3, 1]), [1, 3])).toBe(true);
    const Rt = rotateAbout([1, 1], Math.PI / 2);
    expect(near(apply(Rt, [2, 1]), [1, 2])).toBe(true);
    const M = compose(mirrorX(0), Rt);
    expect(near(apply(invert(M), apply(M, [0.3, 0.7])), [0.3, 0.7])).toBe(true);
  });
  it('공선 겹침·내부 판정', () => {
    expect(collinearOverlap([0, 0], [4, 0], [1, 0], [3, 0])).toBeCloseTo(2);
    expect(collinearOverlap([0, 0], [4, 0], [1, 1], [3, 1])).toBe(0);
    expect(pointInPoly([1, 1], [[0, 0], [2, 0], [2, 2], [0, 2]])).toBe(true);
    expect(pointInPoly([3, 1], [[0, 0], [2, 0], [2, 2], [0, 2]])).toBe(false);
  });
});

describe('자르기와 조각', () => {
  it('세로로 끝까지 자르면 두 조각, 중간까지(슬릿)면 한 조각', () => {
    const d0 = newDoc(4, 2);
    const d1 = cutSegment(d0, [2, -1], [2, 3]);
    expect(d1.facets).toHaveLength(2);
    expect(components(d1)).toHaveLength(2);
    const d2 = cutSegment(d0, [2, -1], [2, 1]);   /* 위에서 절반까지 */
    expect(d2.facets).toHaveLength(2);           /* 면은 갈리지만 */
    expect(components(d2)).toHaveLength(1);      /* 아래쪽이 이어져 한 조각 */
    expect(d2.cuts).toHaveLength(1);
    expect(d2.cuts[0].b[1]).toBeCloseTo(1);
  });
  it('닫힌 경로로 칸 하나를 오려내면 조각이 분리되고 삭제할 수 있다', () => {
    let d = newDoc(3, 3);
    d = cutPolyline(d, [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]);
    const comps = components(d);
    expect(comps).toHaveLength(2);
    const inner = comps.find(c => c.every(id => { const f = d.facets.find(x => x.id === id)!; return Math.abs(area(f.poly)) <= 1 + 1e-6; }))!;
    const d2 = deletePiece(d, inner);
    expect(d2.facets.reduce((s, f) => s + Math.abs(area(f.poly)), 0)).toBeCloseTo(8);
    expect(topFacetAt(d2, [1.5, 1.5])).toBeNull();
  });
  it('조각 이동·회전은 종이 좌표를 보존한다', () => {
    let d = cutSegment(newDoc(2, 1), [1, -1], [1, 2]);
    const right = components(d).find(c => c.some(id => { const f = d.facets.find(x => x.id === id)!; return f.poly.some(p => p[0] > 1.5); }))!;
    d = movePiece(d, right, 5, 0);
    d = rotatePiece(d, right, Math.PI / 2);
    const f = d.facets.find(x => x.id === right[0])!;
    const sp = sheetPoly(f);
    expect(Math.abs(area(sp))).toBeCloseTo(1);
    expect(sp.some(p => Math.abs(p[0] - 1) < 1e-6) && sp.some(p => Math.abs(p[0] - 2) < 1e-6)).toBe(true);
    expect(isBack(f)).toBe(false);
  });
});

describe('접기', () => {
  it('반으로 접기: 넘어간 쪽은 뒷면이 위로, 위층이 된다', () => {
    const d0 = newDoc(2, 1);
    const d1 = foldPiece(d0, [1], [1, -1], [1, 2], [1.5, 0.5], true);
    expect(d1.facets).toHaveLength(2);
    const top = topFacetAt(d1, [0.5, 0.5])!;
    expect(isBack(top)).toBe(true);
    const layers = layersAt(d1, [0.5, 0.5]);
    expect(layers).toHaveLength(2);
    expect(layers[0].back).toBe(true); expect(layers[1].back).toBe(false);
    /* 위층의 종이 좌표: 작업대 (0.5,0.5) 는 원래 (1.5,0.5) */
    expect(near(layers[0].sheetPt, [1.5, 0.5])).toBe(true);
    expect(near(layers[1].sheetPt, [0.5, 0.5])).toBe(true);
    /* 접힌 뒤에도 한 조각 */
    expect(components(d1)).toHaveLength(1);
  });
  it('아래로 접기(over=false)면 넘어간 쪽이 아래층', () => {
    const d1 = foldPiece(newDoc(2, 1), [1], [1, -1], [1, 2], [1.5, 0.5], false);
    const layers = layersAt(d1, [0.5, 0.5]);
    expect(layers[0].back).toBe(false); expect(layers[1].back).toBe(true);
  });
  it('두 번 접으면 4층, 층 순서가 올바르다 (위→아래: 원래 x 구간)', () => {
    let d = newDoc(4, 1);
    d = foldPiece(d, d.facets.map(f => f.id), [2, -1], [2, 2], [3, 0.5], true);     /* 오른쪽 절반을 위로 */
    d = foldPiece(d, d.facets.map(f => f.id), [1, -1], [1, 2], [1.5, 0.5], true);   /* 다시 오른쪽을 위로 */
    const layers = layersAt(d, [0.5, 0.5]);
    expect(layers).toHaveLength(4);
    const xs = layers.map(l => Math.floor(l.sheetPt[0]));
    expect(xs).toEqual([1, 2, 3, 0]);   /* 맨 위: 1~2 구간(두 번째 접기로 넘어옴), 그 아래 2~3, 3~4, 바닥 0~1 */
    expect(layers.map(l => l.back)).toEqual([true, false, true, false]);
  });
  it('대각선 접기', () => {
    const d = foldPiece(newDoc(2, 2), [1], [0, 0], [2, 2], [1.5, 0.5], true);
    expect(d.facets).toHaveLength(2);
    expect(topFacetAt(d, [0.5, 1.5])).not.toBeNull();
    expect(isBack(topFacetAt(d, [0.5, 1.5])!)).toBe(true);
    expect(topFacetAt(d, [1.5, 0.5])).toBeNull();
  });
});

describe('뒤집기·층·스냅', () => {
  it('조각 뒤집기는 앞뒤와 층 순서를 바꾼다', () => {
    let d = foldPiece(newDoc(2, 1), [1], [1, -1], [1, 2], [1.5, 0.5], true);
    const ids = d.facets.map(f => f.id);
    d = flipPiece(d, ids);
    const layers = layersAt(d, [0.5, 0.5]);
    /* 뒤집으면 바닥(앞면, 종이 0~1)이 위로 올라와 뒷면을 보이고, 위층(종이 1~2)이 바닥으로 가서 앞면을 보인다 */
    expect(layers.map(l => l.back)).toEqual([true, false]);
    expect(near(layers[0].sheetPt, [0.5, 0.5])).toBe(true);
    expect(near(layers[1].sheetPt, [1.5, 0.5])).toBe(true);
    expect(flipAll(d).facets.every(f => !isBack(f) === isBack(d.facets.find(x => x.id === f.id)!))).toBe(true);
  });
  it('조각 위로 올리기', () => {
    let d = cutSegment(newDoc(2, 1), [1, -1], [1, 2]);
    const comps = components(d);
    d = movePiece(d, comps[1], -1, 0);   /* 겹치게 */
    d = raisePiece(d, comps[0]);
    expect(comps[0]).toContain(topFacetAt(d, [0.5, 0.5])!.id);
    d = raisePiece(d, comps[1]);
    expect(comps[1]).toContain(topFacetAt(d, [0.5, 0.5])!.id);
  });
  it('스냅 점: 격자점·변 중점·칸 중심', () => {
    const pts = snapPoints(newDoc(1, 1));
    expect(pts).toHaveLength(9);
    expect(pts.some(p => near(p, [0.5, 0.5]))).toBe(true);
    expect(pts.some(p => near(p, [0.5, 0]))).toBe(true);
  });
  it('테두리 변: 자른 변과 바깥 변만', () => {
    const d = cutSegment(newDoc(2, 1), [1, -1], [1, 1]);   /* 끝까지 자름 → 테두리 변 8개 (양쪽 4개씩) */
    expect(outlineEdges(d)).toHaveLength(8);
    const d2 = foldPiece(newDoc(2, 1), [1], [1, -1], [1, 2], [1.5, 0.5], true);   /* 접힘선은 이어진 변 → 각 면 3변 */
    expect(outlineEdges(d2)).toHaveLength(6);
  });
});
