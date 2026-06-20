const KEY_BLOCKLIST = new Set(['F12']);

const RESTRICTED_COMBOS: Array<(e: KeyboardEvent) => boolean> = [
  (e) => e.ctrlKey && e.shiftKey && /^(I|J|C|K)$/i.test(e.key),
  (e) => e.metaKey && e.altKey && /^(I|J|C|K)$/i.test(e.key),
  (e) => e.ctrlKey && /^(U|S)$/i.test(e.key) && !e.shiftKey,
  (e) => e.metaKey && /^(U|S)$/i.test(e.key) && !e.shiftKey,
];

let installed = false;

function blockKeydown(event: KeyboardEvent): void {
  if (KEY_BLOCKLIST.has(event.key) || RESTRICTED_COMBOS.some((test) => test(event))) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function blockContext(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"], .allow-select')) return;
  event.preventDefault();
}

export function installAntiDebug(_options: { lockScreen?: boolean; silenceConsole?: boolean } = {}): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;

  window.addEventListener('keydown', blockKeydown, { capture: true });
  document.addEventListener('contextmenu', blockContext, { capture: true });

  document.addEventListener('dragstart', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'IMG' || target?.tagName === 'VIDEO') event.preventDefault();
  });
}
