import { useState } from 'react';
import { loadThemePref, saveThemePref, THEME_OPTIONS, type ThemePref } from '../lib/theme';

/** 見た目の切り替え（夜＝ダーク／昼＝ライト／端末に合わせる） */
export function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>(() => loadThemePref());
  return (
    <div className="chips theme-picker" role="group" aria-label="見た目">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`chip ${pref === o.value ? 'is-selected' : ''}`}
          aria-pressed={pref === o.value}
          onClick={() => {
            saveThemePref(o.value);
            setPref(o.value);
          }}
        >
          {o.label}
          {o.sub && <span className="chip-sub">（{o.sub}）</span>}
        </button>
      ))}
    </div>
  );
}

/** ホーム用：夜⇄昼をワンタップで切り替えるボタン */
export function ThemeToggleButton() {
  const [night, setNight] = useState(() => document.documentElement.dataset.theme !== 'day');
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={night ? '昼（ライト）の見た目にする' : '夜（ダーク）の見た目にする'}
      onClick={() => {
        saveThemePref(night ? 'day' : 'night');
        setNight(!night);
      }}
    >
      {night ? '☀️' : '🌙'}
    </button>
  );
}
