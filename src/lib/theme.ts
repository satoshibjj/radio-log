/**
 * 表示テーマ（夜＝ダーク／昼＝ライト／端末に合わせる）。
 * 選んだ値は localStorage `radiolog.theme` に保存し、<html data-theme="night|day"> で切り替える。
 * 初回表示のちらつきを防ぐため、index.html の先頭のスクリプトでも同じ処理をしている。
 */
export type ThemePref = 'night' | 'day' | 'system';
export type ResolvedTheme = 'night' | 'day';

export const THEME_KEY = 'radiolog.theme';
export const DEFAULT_THEME: ThemePref = 'night';
const THEME_COLOR: Record<ResolvedTheme, string> = { night: '#0F1B33', day: '#EFE7D6' };

export const THEME_OPTIONS: { value: ThemePref; label: string; sub: string }[] = [
  { value: 'night', label: '🌙 夜', sub: 'ダーク' },
  { value: 'day', label: '☀️ 昼', sub: 'ライト' },
  { value: 'system', label: '📱 端末に合わせる', sub: '' },
];

const isPref = (v: unknown): v is ThemePref => v === 'night' || v === 'day' || v === 'system';

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isPref(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return systemDark() ? 'night' : 'day';
  return pref;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
  return t;
}

export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* 保存できなくても今の表示は切り替える */
  }
  applyTheme(pref);
}

/** 起動時：保存した設定を当て、「端末に合わせる」なら端末の切り替えにも追従する */
export function initTheme(): void {
  applyTheme(loadThemePref());
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (loadThemePref() === 'system') applyTheme('system');
  });
}
