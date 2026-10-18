/* 공작 — 상태 · 저장/복원 · 되돌리기 · 사진 저장(IndexedDB) */
import { loadJSON, saveJSON } from '../shared/dom';
import { newDoc, cloneDoc } from './model';
import type { Doc, Facet } from './model';

const LS_CRAFT = 'nazotoki-craft-v2', LS_CRAFT_V1 = 'nazotoki-craft-v1';
const DB_NAME = 'nazotoki-craft', DB_STORE = 'images';

export type Tool = 'select' | 'cut' | 'fold' | 'text' | 'inspect';
export type Side = 'front' | 'back';
export interface PhotoCal { w: number; h: number; }   /* 사진 픽셀 크기 (격자 전체가 사진 전체에 딱 맞는다고 가정) */
/** 종이 한 장의 내용 (모양·위치는 doc 의 면들이 가짐) */
export interface Sheet {
  id: number; w: number; h: number;
  texts: Record<Side, Record<string, string>>;   /* "r,c" → 글자. 뒷면은 종이를 좌우로 뒤집어 본 좌표 */
  photo: Record<Side, PhotoCal | null>;
}
/** 보관함 항목: 작업대에서 치워 둔 조각 (면 목록은 치울 때의 좌표 그대로) */
export interface StashItem { id: number; facets: Facet[]; }
export interface CraftState {
  sheets: Sheet[];
  stash: StashItem[];
  curSheet: number;         /* 오른쪽 패널에서 편집 중인 장 */
  doc: Doc;
  tool: Tool;
  foldOver: boolean;        /* 접기: 넘어간 쪽을 위로(true) / 아래로(false) */
  showGrid: boolean;
  showBackThrough: boolean; /* 투시: 아래 층을 비쳐 보기 */
  zoom: number;             /* px per 칸 */
  steps: string[];          /* 수행한 단계 설명 (표시용) */
}

export function newSheet(id: number, w: number, h: number): Sheet { return { id, w, h, texts: { front: {}, back: {} }, photo: { front: null, back: null } }; }
export const craftState: CraftState = {
  sheets: [newSheet(1, 4, 3)], stash: [], curSheet: 1, doc: newDoc(4, 3),
  tool: 'select', foldOver: true, showGrid: true, showBackThrough: false, zoom: 56, steps: [],
};
export function sheetById(id: number): Sheet | undefined { return craftState.sheets.find(s => s.id === id); }
export function currentSheet(): Sheet { return sheetById(craftState.curSheet) || craftState.sheets[0]; }

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
function sanitizeSheet(raw: Partial<Sheet>, fallbackId: number): Sheet {
  const s = newSheet(num(raw.id, fallbackId, 1, 1e9), num(raw.w, 4, 1, 30), num(raw.h, 3, 1, 30));
  if (raw.texts && raw.texts.front && raw.texts.back) s.texts = raw.texts;
  if (raw.photo) s.photo = { front: raw.photo.front || null, back: raw.photo.back || null };
  return s;
}
export function craftLoadState(): void {
  let raw = loadJSON<Partial<CraftState>>(LS_CRAFT);
  if (!raw || typeof raw !== 'object') {
    /* v1 (한 장) → v2 */
    const v1 = loadJSON<{ w?: number; h?: number; doc?: { facets: Record<string, unknown>[]; cuts: Record<string, unknown>[]; nextId: number }; texts?: Sheet['texts']; photo?: Sheet['photo'] } & Partial<CraftState>>(LS_CRAFT_V1);
    if (!v1 || typeof v1 !== 'object') return;
    const s = sanitizeSheet({ id: 1, w: v1.w, h: v1.h, texts: v1.texts, photo: v1.photo }, 1);
    raw = { ...v1, sheets: [s], curSheet: 1 };
    if (v1.doc && Array.isArray(v1.doc.facets)) raw.doc = { facets: v1.doc.facets.map(f => ({ sheet: 1, ...f })), cuts: (v1.doc.cuts || []).map(c => ({ sheet: 1, ...c })), nextId: v1.doc.nextId } as Doc;
  }
  if (Array.isArray(raw.sheets) && raw.sheets.length) craftState.sheets = raw.sheets.map((s, i) => sanitizeSheet(s, i + 1));
  craftState.curSheet = sheetById(num(raw.curSheet, 1, 1, 1e9)) ? num(raw.curSheet, 1, 1, 1e9) : craftState.sheets[0].id;
  if (raw.doc && Array.isArray(raw.doc.facets) && Array.isArray(raw.doc.cuts) && raw.doc.facets.every(f => typeof f.sheet === 'number')) craftState.doc = raw.doc as Doc;
  else { const s = craftState.sheets[0]; craftState.doc = newDoc(s.w, s.h); }
  if (Array.isArray(raw.stash)) craftState.stash = raw.stash.filter(it => it && Array.isArray(it.facets) && it.facets.length);
  if (raw.tool === 'select' || raw.tool === 'cut' || raw.tool === 'fold' || raw.tool === 'text' || raw.tool === 'inspect') craftState.tool = raw.tool;
  (['foldOver', 'showGrid', 'showBackThrough'] as const).forEach(k => { if (typeof raw![k] === 'boolean') craftState[k] = raw![k] as boolean; });
  craftState.zoom = num(raw.zoom, 56, 16, 160);
  if (Array.isArray(raw.steps)) craftState.steps = raw.steps.filter((s): s is string => typeof s === 'string');
}
export function craftSaveState(): void { saveJSON(LS_CRAFT, craftState); }

/* ---- 되돌리기 (doc·sheets·steps) ---- */
interface Snap { doc: Doc; sheets: Sheet[]; stash: StashItem[]; curSheet: number; steps: string[]; }
const undoStack: Snap[] = [], redoStack: Snap[] = [];
const snap = (): Snap => ({ doc: cloneDoc(craftState.doc), sheets: JSON.parse(JSON.stringify(craftState.sheets)), stash: JSON.parse(JSON.stringify(craftState.stash)), curSheet: craftState.curSheet, steps: craftState.steps.slice() });
const restore = (s: Snap) => { craftState.doc = s.doc; craftState.sheets = s.sheets; craftState.stash = s.stash; craftState.curSheet = s.curSheet; craftState.steps = s.steps; };
export function pushUndo(): void { undoStack.push(snap()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
export function undo(): boolean { const s = undoStack.pop(); if (!s) return false; redoStack.push(snap()); restore(s); return true; }
export function redo(): boolean { const s = redoStack.pop(); if (!s) return false; undoStack.push(snap()); restore(s); return true; }
export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

/* ---- 사진 (IndexedDB, 이 브라우저에만 저장). 키 = "장id:면" ---- */
export const photoKey = (sheet: number, side: Side): string => sheet + ':' + side;
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 없음')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function savePhoto(key: string, dataUrl: string | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const st = tx.objectStore(DB_STORE);
      if (dataUrl) st.put(dataUrl, key); else st.delete(key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } catch (_) { /* 저장 불가 환경: 메모리에만 유지 */ }
}
export async function loadPhoto(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      /* v1 키("front"/"back") 도 장 1 의 것으로 읽는다 */
      const st = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE);
      const req = st.get(key);
      req.onsuccess = () => {
        if (typeof req.result === 'string') { resolve(req.result); return; }
        if (key.startsWith('1:')) { const r2 = st.get(key.slice(2)); r2.onsuccess = () => resolve(typeof r2.result === 'string' ? r2.result : null); r2.onerror = () => resolve(null); }
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) { return null; }
}
