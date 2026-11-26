import { useEffect, useState } from 'react';
import { createShareImage, shareFileName, type ShareCardData } from '../lib/shareImage';
import { errorMessage } from '../lib/util';
import { useUi } from './UiProvider';

interface Props {
  data: ShareCardData;
  onClose: () => void;
}

/** S6：シェア画像のプレビュー・保存・共有 */
export function ShareImageModal({ data, onClose }: Props) {
  const { toast } = useUi();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [canShareFile, setCanShareFile] = useState(false);
  const fileName = shareFileName(data.broadcastDate);

  useEffect(() => {
    let revoked = false;
    let objectUrl = '';
    createShareImage(data)
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
    // data はモーダル表示中に変わらない
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
      await navigator.share({ files: [file], title: data.programName });
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
          シェア画像
        </h2>
        <div className="share-preview">
          {url ? (
            <img src={url} alt={`${data.programName} ${data.broadcastDate} のシェア画像`} width={1080} height={1350} />
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
