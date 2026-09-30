const STORAGE_KEY = 'apng2.theme';
const VALID = ['dark', 'light'];

function getStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : null;
  } catch {
    return null;
  }
}

const THEME_COLOR = { dark: '#16171a', light: '#eceae6' };

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme] ?? THEME_COLOR.dark);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable
  }
}

function current() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function toggle() {
  apply(current() === 'dark' ? 'light' : 'dark');
}

function init() {
  const stored = getStored();
  apply(stored ?? 'dark');
}

export { init, toggle, apply, current };
