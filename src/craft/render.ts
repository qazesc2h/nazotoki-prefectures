/* 공작 — 캔버스 그리기. 작업대 좌표(칸 단위) → 화면 px 변환(View)과, 면을 층(z) 순서로 칠하는 painter 방식.
   각 면은 자기 다각형으로 클리핑한 뒤 종이색 → 사진 → 격자 → 글자 순으로 그리고, 테두리·접힘선을 긋는다. */
import { compose, bbox } from './geom';
import type { Pt, Xf } from './geom';
import { docBounds, isBack, classifyEdges, snapPoints } from './model';
import type { Doc } from './model';
import { craftState } from './state';
import type { Side } from './state';

export interface View { ox: number; oy: number; zoom: number; cssW: number; cssH: number; }
export const MARGIN = 1;   /* 종이 둘레 여백 (칸) */

export function computeView(doc: Doc, zoom: number): View {
  const b = docBounds(doc);
  const ox = b.minX - MARGIN, oy = b.minY - MARGIN;
  return { ox, oy, zoom, cssW: Math.max(zoom, Math.ceil((b.maxX - b.minX + 2 * MARGIN) * zoom)), cssH: Math.max(zoom, Math.ceil((b.maxY - b.minY + 2 * MARGIN) * zoom)) };
}
export function toPx(v: View, p: Pt): Pt { return [(p[0] - v.ox) * v.zoom, (p[1] - v.oy) * v.zoom]; }
export function fromPx(v: View, p: Pt): Pt { return [p[0] / v.zoom + v.ox, p[1] / v.zoom + v.oy]; }
function viewXf(v: View): Xf { return [v.zoom, 0, 0, v.zoom, -v.ox * v.zoom, -v.oy * v.zoom]; }

/** 그리기 위에 얹는 임시 표시 (도구 진행 상태) */
export interface Overlay {
  selected: Set<number>;     /* 선택한 조각의 면 id */
  cutPts: Pt[];              /* 자르기 진행 중 점들 */
  foldPts: Pt[];             /* 접기 선 점들 (최대 2) */
  hover: Pt | null;          /* 포인터 위치 (작업대 좌표) */
  snap: Pt | null;           /* 포인터에 가장 가까운 스냅 점 */
  inspectPt: Pt | null;      /* 층 검사 지점 */
  showSnaps: boolean;
}
/** 사진 (메모리) — 저장은 state.ts 의 IndexedDB */
export const photos: Record<Side, HTMLImageElement | null> = { front: null, back: null };

const PAPER = { front: '#fffdf4', back: '#e3e7ea' };
const PAPER_DARK = { front: '#f3efe0', back: '#9aa3aa' };
function isDark(): boolean { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches; }

function cellTextsOf(side: Side): [number, number, string][] {
  const out: [number, number, string][] = [];
  const t = craftState.texts[side];
  for (const k in t) { const s = t[k]; if (!s) continue; const [r, c] = k.split(',').map(Number); if (Number.isFinite(r) && Number.isFinite(c)) out.push([r, c, s]); }
  return out;
}

export function drawCraft(canvas: HTMLCanvasElement, ov: Overlay): View {
  const doc = craftState.doc;
  const v = computeView(doc, craftState.zoom);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(v.cssW * dpr) || canvas.height !== Math.round(v.cssH * dpr)) { canvas.width = Math.round(v.cssW * dpr); canvas.height = Math.round(v.cssH * dpr); }
  canvas.style.width = v.cssW + 'px'; canvas.style.height = v.cssH + 'px';
  const ctx = canvas.getContext('2d'); if (!ctx) return v;
  const base: Xf = [dpr, 0, 0, dpr, 0, 0];
  const V = viewXf(v);
  const setXf = (m: Xf) => { const t = compose(base, m); ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]); };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setXf([1, 0, 0, 1, 0, 0]);
  const dark = isDark();
  const paper = dark ? PAPER_DARK : PAPER;
  const W = doc.w, H = doc.h;
  const facets = doc.facets.slice().sort((a, b) => a.z - b.z);
  const { outline, crease } = classifyEdges(doc);
  const through = craftState.showBackThrough;

  const pathPoly = (poly: Pt[]) => { ctx.beginPath(); poly.forEach((p, i) => { const q = toPx(v, p); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }); ctx.closePath(); };

  for (const f of facets) {
    const back = isBack(f);
    const side: Side = back ? 'back' : 'front';
    ctx.save();
    if (through) ctx.globalAlpha = 0.6;
    setXf([1, 0, 0, 1, 0, 0]);
    pathPoly(f.poly);
    ctx.clip();
    /* 종이색 */
    ctx.fillStyle = paper[side];
    ctx.fill();
    /* 사진: 이미지 px → 종이 좌표 → 작업대 → 화면 */
    const img = photos[side];
    if (img && img.naturalWidth) {
      const S: Xf = back ? [-W / img.naturalWidth, 0, 0, H / img.naturalHeight, W, 0] : [W / img.naturalWidth, 0, 0, H / img.naturalHeight, 0, 0];
      setXf(compose(V, compose(f.xf, S)));
      ctx.drawImage(img, 0, 0);
    }
    /* 격자 (종이 좌표) */
    if (craftState.showGrid) {
      setXf(compose(V, f.xf));
      ctx.lineWidth = 1 / v.zoom;
      ctx.strokeStyle = img ? 'rgba(0,0,0,.35)' : (dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.14)');
      ctx.beginPath();
      for (let x = 0; x <= W; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y <= H; y++) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    /* 글자: 칸 중심에, 면이 놓인 방향대로 (뒷면은 좌우 반전 보정) */
    const texts = cellTextsOf(side);
    if (texts.length) {
      const ang = back ? Math.atan2(-f.xf[1], -f.xf[0]) : Math.atan2(f.xf[1], f.xf[0]);
      ctx.fillStyle = '#1a1a1a';
      const fb = bbox([f.poly]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [r, c, s] of texts) {
        if (r < 0 || r >= H || c < 0 || c >= W) continue;
        const u = (back ? W - 1 - c : c) + 0.5, vv = r + 0.5;
        const wp: Pt = [f.xf[0] * u + f.xf[2] * vv + f.xf[4], f.xf[1] * u + f.xf[3] * vv + f.xf[5]];
        /* 칸이 이 면에 조금이라도 걸칠 수 있는 범위(칸 반대각선 ≈0.71)를 벗어나면 생략. 걸치는 칸은 클리핑으로 잘린 부분만 보인다 */
        if (wp[0] < fb.minX - 0.75 || wp[0] > fb.maxX + 0.75 || wp[1] < fb.minY - 0.75 || wp[1] > fb.maxY + 0.75) continue;
        const q = toPx(v, wp);
        setXf([1, 0, 0, 1, 0, 0]);
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
        let fs = Math.round(v.zoom * 0.46);
        ctx.font = fs + 'px ' + FONT;
        const mw = ctx.measureText(s).width;
        if (mw > v.zoom * 0.9) { fs = Math.max(7, Math.floor(fs * (v.zoom * 0.9) / mw)); ctx.font = fs + 'px ' + FONT; }
        if (img) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(s, 0, 0); }
        ctx.fillText(s, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
    /* 테두리 · 접힘선 */
    setXf([1, 0, 0, 1, 0, 0]);
    ctx.lineCap = 'round';
    const o = outline.get(f.id) || [];
    ctx.strokeStyle = dark ? '#cfd6cf' : '#333'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath(); for (const [p, q] of o) { const a = toPx(v, p), b = toPx(v, q); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
    const cr = crease.get(f.id) || [];
    if (cr.length) {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); for (const [p, q] of cr) { const a = toPx(v, p), b = toPx(v, q); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* 선택 조각 강조 */
  if (ov.selected.size) {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.setLineDash([]);
    ctx.beginPath();
    for (const f of facets) if (ov.selected.has(f.id)) for (const [p, q] of outline.get(f.id) || []) { const a = toPx(v, p), b = toPx(v, q); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
  /* 스냅 점 */
  if (ov.showSnaps) {
    ctx.fillStyle = dark ? 'rgba(245,166,35,.45)' : 'rgba(217,119,6,.45)';
    for (const p of snapPoints(doc)) { const q = toPx(v, p); ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  if (ov.snap) { const q = toPx(v, ov.snap); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, Math.PI * 2); ctx.stroke(); }
  /* 자르기 진행선 */
  if (ov.cutPts.length) {
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ov.cutPts.forEach((p, i) => { const q = toPx(v, p); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
    const tail = ov.snap || ov.hover; if (tail) { const q = toPx(v, tail); ctx.lineTo(q[0], q[1]); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e53935';
    for (const p of ov.cutPts) { const q = toPx(v, p); ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.fill(); }
  }
  /* 접기 선 */
  if (ov.foldPts.length) {
    const a = ov.foldPts[0], b = ov.foldPts[1] || ov.snap || ov.hover;
    ctx.fillStyle = '#1e88e5';
    for (const p of ov.foldPts) { const q = toPx(v, p); ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.fill(); }
    if (b && (Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9)) {
      /* 캔버스를 가로지르는 무한 직선 */
      const dx = b[0] - a[0], dy = b[1] - a[1], L = 1000 / Math.hypot(dx, dy);
      const p1 = toPx(v, [a[0] - dx * L, a[1] - dy * L]), p2 = toPx(v, [a[0] + dx * L, a[1] + dy * L]);
      ctx.strokeStyle = '#1e88e5'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  /* 층 검사 지점 */
  if (ov.inspectPt) {
    const q = toPx(v, ov.inspectPt);
    ctx.strokeStyle = '#8e24aa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(q[0] - 11, q[1]); ctx.lineTo(q[0] + 11, q[1]); ctx.moveTo(q[0], q[1] - 11); ctx.lineTo(q[0], q[1] + 11); ctx.stroke();
  }
  return v;
}
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
