import { useRegisterSW } from 'virtual:pwa-register/react';

/** Service Worker 登録と「新しいバージョン」通知 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.warn('Service Worker の登録に失敗しました', err);
    },
  });

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="update-banner" role="status">
      {needRefresh ? (
        <>
          <span>新しいバージョンがあります。</span>
          <button type="button" className="btn btn-small btn-primary" onClick={() => void updateServiceWorker(true)}>
            更新
          </button>
          <button type="button" className="btn btn-small" onClick={() => setNeedRefresh(false)}>
            後で
          </button>
        </>
      ) : (
        <>
          <span>オフラインでも使えるようになりました。</span>
          <button type="button" className="btn btn-small" onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </>
      )}
    </div>
  );
}
