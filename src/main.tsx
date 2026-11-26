import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initTheme } from './lib/theme';

initTheme();

/** ストレージ永続化をリクエスト（対応ブラウザのみ・失敗しても無視） */
function requestPersistentStorage(): void {
  try {
    const p = navigator.storage?.persist?.();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  } catch {
    /* 非対応・例外は握りつぶす */
  }
}
requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
