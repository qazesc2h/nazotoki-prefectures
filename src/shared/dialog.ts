/* 공용 확인·알림 대화상자 — window.confirm / alert 대체.
   아티팩트처럼 샌드박스 iframe 에 올라가면 네이티브 confirm 이 조용히 false 를 돌려줘 버튼이 "아무 일도 안 하는" 것처럼 보인다.
   <dialog> 로 페이지 안에서 직접 띄우고, <dialog> 를 지원하지 않는 아주 옛 브라우저에서만 네이티브로 물러난다. */
let dlg: HTMLDialogElement | null = null;
let msgEl: HTMLElement | null = null, okBtn: HTMLButtonElement | null = null, cancelBtn: HTMLButtonElement | null = null;
let resolver: ((ok: boolean) => void) | null = null;

function ensure(): HTMLDialogElement | null {
  if (dlg) return dlg;
  if (typeof HTMLDialogElement === 'undefined') return null;
  dlg = document.createElement('dialog');
  dlg.className = 'nz-dialog';
  dlg.innerHTML = '<p class="nz-dialog-msg"></p><div class="nz-dialog-btns"><button type="button" class="btn" data-act="cancel">취소</button><button type="button" class="btn nz-dialog-ok" data-act="ok">확인</button></div>';
  document.body.appendChild(dlg);
  msgEl = dlg.querySelector('.nz-dialog-msg');
  okBtn = dlg.querySelector('[data-act="ok"]');
  cancelBtn = dlg.querySelector('[data-act="cancel"]');
  okBtn!.addEventListener('click', () => finish(true));
  cancelBtn!.addEventListener('click', () => finish(false));
  dlg.addEventListener('cancel', e => { e.preventDefault(); finish(false); });   /* Esc */
  dlg.addEventListener('click', e => { if (e.target === dlg) finish(false); });    /* 바깥 클릭 */
  return dlg;
}
function finish(ok: boolean): void {
  const r = resolver; resolver = null;
  if (dlg && dlg.open) dlg.close();
  if (r) r(ok);
}
function show(msg: string, ok: string, cancel: string | null): Promise<boolean> {
  const d = ensure();
  if (!d) return Promise.resolve(cancel === null ? (window.alert(msg), true) : window.confirm(msg));
  if (resolver) finish(false);   /* 이미 떠 있던 것은 취소 처리 */
  msgEl!.textContent = msg;
  okBtn!.textContent = ok;
  cancelBtn!.classList.toggle('hidden', cancel === null);
  if (cancel !== null) cancelBtn!.textContent = cancel;
  return new Promise<boolean>(resolve => {
    resolver = resolve;
    d.showModal();
    okBtn!.focus();
  });
}
/** 확인/취소 — 확인이면 true */
export function askConfirm(msg: string, opts: { ok?: string; cancel?: string } = {}): Promise<boolean> {
  return show(msg, opts.ok || '확인', opts.cancel || '취소');
}
/** 알림 (확인만) */
export function notify(msg: string): Promise<void> {
  return show(msg, '확인', null).then(() => undefined);
}
