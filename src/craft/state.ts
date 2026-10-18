/* 공작 — 상태 · 저장/복원 · 되돌리기 · 사진 저장(IndexedDB) */
import { loadJSON, saveJSON } from '../shared/dom';
import { newDoc, cloneDoc } from './model';
import type { Doc } from './model';

const LS_CRAFT = 'nazotoki-craft-v1';
const DB_NAME = 'nazotoki-craft', DB_STORE = 'images';

export type Tool = 'select' | 'cut' | 'fold' | 'text' | 'inspect';
export type Side = 'front' | 'back';
export interface PhotoCal { w: number; h: number; }   /* 사진 픽셀 크기 (격자 전체가 사진 전체에 딱 맞는다고 가정) */
export interface CraftState {
  w: number; h: number;
  doc: Doc;
  texts: Record<Side, Record<string, string>>;   /* "r,c" → 글자. 뒷면은 종이를 좌우로 뒤집어 본 좌표 */
  photo: Record<Side, PhotoCal | null>;
  tool: Tool;
  foldOver: boolean;        /* 접기: 넘어간 쪽을 위로(true) / 아래로(false) */
  showGrid: boolean;
  showBackThrough: boolean; /* 투시: 아래 층을 비쳐 보기 */
  zoom: number;             /* px per 칸 */
  steps: string[];          /* 수행한 단계 설명 (표시용) */
}

export const craftState: CraftState = {
  w: 4, h: 3, doc: newDoc(4, 3), texts: { front: {}, back: {} }, photo: { front: null, back: null },
  tool: 'select', foldOver: true, showGrid: true, showBackThrough: false, zoom: 56, steps: [],
};

export function craftLoadState(): void {
  const raw = loadJSON<Partial<CraftState>>(LS_CRAFT);
  if (!raw || typeof raw !== 'object') return;
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  craftState.w = num(raw.w, 4, 1, 30); craftState.h = num(raw.h, 3, 1, 30);
  if (raw.doc && Array.isArray(raw.doc.facets) && raw.doc.facets.length) craftState.doc = raw.doc as Doc; else craftState.doc = newDoc(craftState.w, craftState.h);
  if (raw.texts && raw.texts.front && raw.texts.back) craftState.texts = raw.texts;
  if (raw.photo) craftState.photo = { front: raw.photo.front || null, back: raw.photo.back || null };
  if (raw.tool === 'select' || raw.tool === 'cut' || raw.tool === 'fold' || raw.tool === 'text' || raw.tool === 'inspect') craftState.tool = raw.tool;
  (['foldOver', 'showGrid', 'showBackThrough'] as const).forEach(k => { if (typeof raw[k] === 'boolean') craftState[k] = raw[k] as boolean; });
  craftState.zoom = num(raw.zoom, 56, 16, 160);
  if (Array.isArray(raw.steps)) craftState.steps = raw.steps.filter((s): s is string => typeof s === 'string');
}
export function craftSaveState(): void { saveJSON(LS_CRAFT, craftState); }

/* ---- 되돌리기 (doc·texts·steps) ---- */
interface Snap { doc: Doc; texts: CraftState['texts']; steps: string[]; }
const undoStack: Snap[] = [], redoStack: Snap[] = [];
const snap = (): Snap => ({ doc: cloneDoc(craftState.doc), texts: JSON.parse(JSON.stringify(craftState.texts)), steps: craftState.steps.slice() });
const restore = (s: Snap) => { craftState.doc = s.doc; craftState.texts = s.texts; craftState.steps = s.steps; };
export function pushUndo(): void { undoStack.push(snap()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
export function undo(): boolean { const s = undoStack.pop(); if (!s) return false; redoStack.push(snap()); restore(s); return true; }
export function redo(): boolean { const s = redoStack.pop(); if (!s) return false; undoStack.push(snap()); restore(s); return true; }
export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

/* ---- 사진 (IndexedDB, 이 브라우저에만 저장) ---- */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 없음')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function savePhoto(side: Side, dataUrl: string | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const st = tx.objectStore(DB_STORE);
      if (dataUrl) st.put(dataUrl, side); else st.delete(side);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } catch (_) { /* 저장 불가 환경: 메모리에만 유지 */ }
}
export async function loadPhoto(side: Side): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(side);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) { return null; }
}
