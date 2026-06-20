const KEY_BLOCKLIST = new Set(['F12', 'F11']);
const DEVTOOLS_GAP = 160;

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
  event.preventDefault();
  event.stopPropagation();
}

function showLockScreen(): void {
  if (document.getElementById('__lumen_locked__')) return;
  const overlay = document.createElement('div');
  overlay.id = '__lumen_locked__';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'radial-gradient(circle at top, #1a0a0f, #050309 70%)',
    color: '#f7f8fb',
    display: 'grid',
    placeItems: 'center',
    zIndex: '2147483647',
    fontFamily: 'Inter, system-ui, sans-serif',
    textAlign: 'center',
    padding: '32px',
  } as CSSStyleDeclaration);
  overlay.innerHTML = `
    <div style="max-width:420px;display:grid;gap:14px;justify-items:center;">
      <div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#e50914,#ff3a44);display:grid;place-items:center;font-weight:800;font-size:1.8rem;box-shadow:0 18px 40px rgba(229,9,20,0.4);">L</div>
      <h1 style="margin:0;font-size:1.6rem;">Inspection disabled</h1>
      <p style="margin:0;color:#8e94ad;line-height:1.6;">For your protection this page is not available while developer tools are open. Please close them and reload.</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLockScreen(): void {
  document.getElementById('__lumen_locked__')?.remove();
}

let lastDetection = 0;
let lockTimer: number | null = null;

function setLocked(locked: boolean): void {
  if (locked) {
    lastDetection = Date.now();
    showLockScreen();
    if (lockTimer === null && typeof window !== 'undefined') {
      lockTimer = window.setInterval(() => {
        if (Date.now() - lastDetection > 1500) {
          hideLockScreen();
          if (lockTimer !== null) {
            window.clearInterval(lockTimer);
            lockTimer = null;
          }
        }
      }, 600);
    }
  }
}

function detectByDimensions(): boolean {
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return widthGap > DEVTOOLS_GAP || heightGap > DEVTOOLS_GAP;
}

function detectByTiming(): boolean {
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  return performance.now() - start > 100;
}

function detectByToString(): boolean {
  let triggered = false;
  const probe = /./;
  probe.toString = () => {
    triggered = true;
    return '';
  };
  // Console object inspection triggers toString in open devtools.
  console.debug('%c', probe);
  console.clear?.();
  return triggered;
}

function runDetectionCycle(): void {
  try {
    if (detectByDimensions() || detectByToString()) {
      setLocked(true);
      return;
    }
  } catch {
    // ignore probe failures
  }
}

function neuterConsole(): void {
  if (typeof console === 'undefined') return;
  const noop = () => undefined;
  const methods: Array<keyof Console> = ['log', 'debug', 'info', 'warn', 'error', 'table', 'dir', 'trace', 'group', 'groupCollapsed', 'groupEnd'];
  methods.forEach((method) => {
    try {
      Object.defineProperty(console, method, { value: noop, configurable: false, writable: false });
    } catch {
      // ignore — some environments lock console
    }
  });
}

export function installAntiDebug(options: { lockScreen?: boolean; silenceConsole?: boolean } = {}): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;

  const { lockScreen = true, silenceConsole = true } = options;

  window.addEventListener('keydown', blockKeydown, { capture: true });
  document.addEventListener('contextmenu', blockContext, { capture: true });
  document.addEventListener('selectstart', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"], .allow-select')) return;
    event.preventDefault();
  });
  document.addEventListener('dragstart', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'IMG' || target?.tagName === 'VIDEO') event.preventDefault();
  });

  if (silenceConsole) {
    neuterConsole();
  }

  if (lockScreen) {
    window.setInterval(runDetectionCycle, 900);
    runDetectionCycle();
    try {
      // The debugger-trap fires only when devtools is paused — kept light.
      window.setInterval(() => {
        if (detectByTiming()) setLocked(true);
      }, 5000);
    } catch {
      // ignore
    }
  }
}
