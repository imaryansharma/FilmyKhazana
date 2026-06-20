export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'filmykhazana.theme';
const LISTENERS = new Set<(theme: Theme) => void>();

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage may be unavailable
  }
  LISTENERS.forEach((fn) => {
    try {
      fn(theme);
    } catch {
      // ignore
    }
  });
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function subscribeTheme(listener: (theme: Theme) => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}
