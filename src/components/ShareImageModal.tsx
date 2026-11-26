import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/util';
import { useUi } from './UiProvider';

interface Props {
  /** 画像を作る関数（モーダルを開いた時に1回呼ぶ） */
  create: () => Promise<Blob>;
  fileName: string;
  /** 共有時のタイトル・画像の説明 */
  title: string;
  heading?: string;
  onClose: () => void;
}

/** シェア画像のプレビュー・保存・共有（S6 の1回分、リピート帳の TOP5） */
export function ShareImageModal({ create, fileName, title, heading = 'シェア画像', onClose }: Props) {
  const { toast } = useUi();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl = '';
    create()
      .then((b) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
        try {
          const file = new File([b], fileName, { type: 'image/png' });
          setCanShareFile(typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] })));
        } catch {
          setCanShareFile(false);
        }
      })
      .catch((err) => setError(errorMessage(err)));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // create はモーダル表示中に変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('画像を保存しました');
  };

  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // ユーザーがキャンセル
      toast('共有できなかったため、画像を保存します');
      download();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-title" className="modal-title">
          {heading}
        </h2>
        <div className="share-preview">
          {url ? (
            <img src={url} alt={title} width={1080} height={1350} />
          ) : error ? (
            <p className="field-error">{error}</p>
          ) : (
            <p className="muted">作成中…</p>
          )}
        </div>
        <div className="share-actions">
          {canShareFile && (
            <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void share()} disabled={!blob}>
              共有する
            </button>
          )}
          <button
            type="button"
            className={`btn btn-block ${canShareFile ? '' : 'btn-primary btn-large'}`}
            onClick={download}
            disabled={!url}
          >
            画像を保存（PNG）
          </button>
          <button type="button" className="btn btn-block" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
