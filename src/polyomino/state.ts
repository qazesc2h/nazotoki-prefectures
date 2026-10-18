/* 폴리오미노 — 상태 + localStorage 저장/복원 + 되돌리기 스택 */
import { loadJSON, saveJSON } from '../shared/dom';
import type { Board, Placement } from './model';
import type { CustomShape } from './shapes';

const LS_POLY = 'nazotoki-polyomino-v1';

export type EditMode = 'place' | 'hole' | 'letter';
export interface PolyState {
  w: number; h: number;
  holes: string[];                      /* "x,y" */
  letters: Record<string, string>;      /* "x,y" → 글자 */
  editMode: EditMode;
  coverLetters: boolean;                /* 피스가 덮은 글자를 숨김 (기본 끔: 글자가 비쳐 보임) */
  allowRotate: boolean;
  allowFlip: boolean;
  forbidOverlap: boolean;               /* 겹치는 곳에는 놓을 수 없게 */
  counts: Record<string, number | 'inf'>;   /* 카탈로그 키 → 개수 */
  customs: CustomShape[];
  nextCustomId: number;
  placements: Placement[];
  nextPlacementId: number;
  trayOrient: Record<string, number>;   /* 트레이 카드의 현재 변형 인덱스 */
  sizeTab: number;                      /* 피스 선택 탭: 1~6칸, 0 = 자작 */
  customGrid: number;                   /* 자작 피스 격자 크기 (10~20) */
}

export const polyState: PolyState = {
  w: 6, h: 5, holes: [], letters: {}, editMode: 'place', coverLetters: false,
  allowRotate: true, allowFlip: true, forbidOverlap: false,
  counts: {}, customs: [], nextCustomId: 1, placements: [], nextPlacementId: 1,
  trayOrient: {}, sizeTab: 5, customGrid: 10,
};

/** 상태의 도면 뷰 (holes 를 Set 으로) */
export function boardOf(s: PolyState = polyState): Board {
  return { w: s.w, h: s.h, holes: new Set(s.holes), letters: s.letters };
}

export function polyLoadState(): void {
  const raw = loadJSON<Partial<PolyState>>(LS_POLY);
  if (!raw || typeof raw !== 'object') return;
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : d; };
  polyState.w = num(raw.w, 6, 1, 20); polyState.h = num(raw.h, 5, 1, 20);
  if (Array.isArray(raw.holes)) polyState.holes = raw.holes.filter((k): k is string => typeof k === 'string');
  if (raw.letters && typeof raw.letters === 'object') polyState.letters = raw.letters;
  if (raw.editMode === 'hole' || raw.editMode === 'letter' || raw.editMode === 'place') polyState.editMode = raw.editMode;
  (['coverLetters', 'allowRotate', 'allowFlip', 'forbidOverlap'] as const).forEach(k => { if (typeof raw[k] === 'boolean') polyState[k] = raw[k] as boolean; });
  if (raw.counts && typeof raw.counts === 'object') {
    polyState.counts = {};
    for (const k of Object.keys(raw.counts)) { const v = raw.counts[k]; if (v === 'inf' || (typeof v === 'number' && v > 0)) polyState.counts[k] = v; }
  }
  if (Array.isArray(raw.customs)) polyState.customs = raw.customs.filter(c => c && typeof c.rows === 'string' && Number.isFinite(c.id));
  polyState.nextCustomId = Math.max(num(raw.nextCustomId, 1, 1, 1e9), ...polyState.customs.map(c => c.id + 1));
  if (Array.isArray(raw.placements)) polyState.placements = raw.placements.filter(p => p && Array.isArray(p.cells) && Number.isFinite(p.id));
  polyState.nextPlacementId = Math.max(num(raw.nextPlacementId, 1, 1, 1e9), ...polyState.placements.map(p => p.id + 1));
  if (raw.trayOrient && typeof raw.trayOrient === 'object') polyState.trayOrient = raw.trayOrient;
  polyState.sizeTab = num(raw.sizeTab, 5, 0, 6);
  polyState.customGrid = num(raw.customGrid, 10, 10, 20);
}
export function polySaveState(): void { saveJSON(LS_POLY, polyState); }

/* ---- 되돌리기 (배치·도면 편집만, 메모리) ---- */
interface Snap { holes: string[]; letters: Record<string, string>; placements: Placement[]; w: number; h: number; }
const undoStack: Snap[] = [], redoStack: Snap[] = [];
const snap = (): Snap => JSON.parse(JSON.stringify({ holes: polyState.holes, letters: polyState.letters, placements: polyState.placements, w: polyState.w, h: polyState.h }));
const restore = (s: Snap) => { polyState.holes = s.holes; polyState.letters = s.letters; polyState.placements = s.placements; polyState.w = s.w; polyState.h = s.h; };
/** 변경 전에 호출 — 현재 상태를 되돌리기 스택에 쌓는다 */
export function pushUndo(): void { undoStack.push(snap()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
export function undo(): boolean { const s = undoStack.pop(); if (!s) return false; redoStack.push(snap()); restore(s); return true; }
export function redo(): boolean { const s = redoStack.pop(); if (!s) return false; undoStack.push(snap()); restore(s); return true; }
export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }
