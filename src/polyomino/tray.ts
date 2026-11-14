/* 폴리오미노 — 피스 트레이 (아직 놓지 않은 피스 카드: 모양·남은 개수·↻⇄, 끌어서 도면에 놓기) */
import { polyState } from './state';
import { shapeSvg, pieceColor } from './draw';
import { catalog, remaining, trayShape, trayRotate, trayFlip, setEditMode, pieceByKey } from './actions';
import { orientations } from './model';
import { startDrag } from './drag';

let warnTimer: ReturnType<typeof setTimeout> | null = null;
/** 배치 모드가 아닐 때 트레이를 끌려고 하면 잠시 경고 (전환 버튼 포함) */
function showModeWarning(): void {
  const el = document.getElementById('poly-mode-warn');
  if (!el) return;
  const label = polyState.editMode === 'hole' ? '구멍' : '글자';
  el.innerHTML = '지금은 「도면 편집: ' + label + '」 모드라 피스를 놓을 수 없습니다. ';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.textContent = '배치 모드로';
  btn.addEventListener('click', () => { hideModeWarning(); setEditMode('place'); });
  el.appendChild(btn);
  el.classList.remove('hidden');
  if (warnTimer) clearTimeout(warnTimer);
  warnTimer = setTimeout(hideModeWarning, 4000);
}
export function hideModeWarning(): void {
  const el = document.getElementById('poly-mode-warn');
  if (el) el.classList.add('hidden');
  if (warnTimer) { clearTimeout(warnTimer); warnTimer = null; }
}

const CARD_PX = 14;

export function renderTray(): void {
  const wrap = document.getElementById('poly-tray');
  const countEl = document.getElementById('poly-tray-count');
  if (!wrap) return;
  wrap.innerHTML = '';
  /* 항목을 카탈로그 순서(같은 피스는 고른 순서)로 */
  const order = new Map(catalog().map((p, i) => [p.key, i]));
  const items = polyState.entries.slice().sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9) || a.id - b.id);
  const opts = { allowRotate: polyState.allowRotate, allowFlip: polyState.allowFlip };
  let totalLeft = 0, hasInf = false;
  for (const e of items) {
    const p = pieceByKey(e.key); if (!p) continue;
    const left = remaining(e.id);
    if (left === Infinity) hasInf = true; else totalLeft += left;
    if (left <= 0) continue;
    const card = document.createElement('div');
    card.className = 'poly-card';
    card.dataset.key = e.key;
    card.dataset.entry = String(e.id);
    const shape = trayShape(e);
    const svg = shapeSvg(shape, pieceColor(p.colorIdx), CARD_PX);
    svg.classList.add('tray-shape');
    svg.setAttribute('role', 'button');
    svg.setAttribute('aria-label', p.name + ' (' + p.size + '칸) 남은 ' + (left === Infinity ? '무제한' : left + '개') + '. 끌어서 도면에 놓습니다');
    svg.addEventListener('pointerdown', ev => {
      if (polyState.editMode !== 'place') { ev.preventDefault(); showModeWarning(); return; }
      ev.preventDefault();
      const bb = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const sx = vb.width / (bb.width || 1), sy = vb.height / (bb.height || 1);
      /* 잡은 위치를 피스 칸 단위(소수)로 — 도면에서 같은 상대 위치에 놓이도록 */
      const gx = ((ev.clientX - bb.left) * sx + 1) / CARD_PX, gy = ((ev.clientY - bb.top) * sy + 1) / CARD_PX;
      startDrag({ key: e.key, entry: e.id, cells: shape, grabDx: gx - 0.5, grabDy: gy - 0.5, fromId: null, startX: ev.clientX, startY: ev.clientY }, ev);
    });
    card.appendChild(svg);
    const nm = document.createElement('span'); nm.className = 'nm';
    nm.textContent = p.name + ' ×' + (left === Infinity ? '∞' : left);
    card.appendChild(nm);
    /* 허용된 범위에서만 돌리기·뒤집기 (둘 다 끄면 고른 방향 고정) */
    const nOr = orientations(e.shape, opts).length;
    const ops = document.createElement('div'); ops.className = 'ops';
    const rot = document.createElement('button'); rot.type = 'button'; rot.className = 'btn'; rot.textContent = '↻'; rot.title = polyState.allowRotate ? '돌리기' : '회전 허용이 꺼져 있어 고른 방향으로만 씁니다';
    rot.disabled = !polyState.allowRotate || nOr < 2; rot.addEventListener('click', () => trayRotate(e.id));
    const flp = document.createElement('button'); flp.type = 'button'; flp.className = 'btn'; flp.textContent = '⇄'; flp.title = polyState.allowFlip ? '뒤집기' : '뒤집기 허용이 꺼져 있어 고른 방향으로만 씁니다';
    flp.disabled = !polyState.allowFlip || nOr < 2; flp.addEventListener('click', () => trayFlip(e.id));
    ops.appendChild(rot); ops.appendChild(flp);
    card.appendChild(ops);
    wrap.appendChild(card);
  }
  if (!wrap.children.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = items.length ? '모든 피스를 놓았습니다.' : '「피스 선택」 패널에서 피스를 고르세요.';
    wrap.appendChild(p);
  }
  if (countEl) countEl.textContent = items.length ? '(남은 ' + totalLeft + (hasInf ? '+∞' : '') + '개)' : '';
}
