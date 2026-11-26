import { useEffect, useMemo, useState } from 'react';
import {
  buildSharedList,
  encodeSharedList,
  SHARE_LONG_URL,
  SHARE_MEMO_MAX,
  sharedListToFileText,
  sharedListUrl,
  type SharedItem,
} from '../lib/sharedList';
import { errorMessage, todayLocal } from '../lib/util';
import { SharedItemView } from './SharedItemView';
import { useUi } from './UiProvider';

interface Props {
  /** 選んだ回（表示順） */
  items: SharedItem[];
  onClose: () => void;
}

const SHARE_TITLE = 'Radio Log また聴きたい回リスト';

function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** リスト共有：メモを含めるか選ぶ → 相手に見える内容をプレビュー → 共有シート／コピー／ファイル */
export function ShareListModal({ items, onClose }: Props) {
  const { toast } = useUi();
  const [includeMemo, setIncludeMemo] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const hasAnyMemo = items.some((it) => it.memo.trim());

  const list = useMemo(() => buildSharedList(items, includeMemo), [items, includeMemo]);

  useEffect(() => {
    let alive = true;
    setUrl('');
    encodeSharedList(list)
      .then((token) => alive && setUrl(sharedListUrl(token)))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [list]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canShare = typeof navigator.share === 'function';
  const tooLong = url.length > SHARE_LONG_URL;
  const text = `また聴きたい回を${list.items.length}件まとめました（Radio Log）`;

  const share = async () => {
    try {
      await navigator.share({ title: SHARE_TITLE, text, url });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast('共有できませんでした。「リンクをコピー」をお使いください');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('リンクをコピーしました');
    } catch {
      toast('コピーできませんでした。下のリンクを長押ししてコピーしてください');
      (document.getElementById('share-list-url') as HTMLTextAreaElement | null)?.select();
    }
  };

  /** リンクが長すぎる場合など：ファイルで送る（受け取った人は「シェアされたリスト」画面で開く） */
  const sendFile = async () => {
    const body = sharedListToFileText(list);
    const name = `radio-log-list-${todayLocal().replace(/-/g, '')}.json`;
    const candidates = [new File([body], name, { type: 'application/json' }), new File([body], name.replace(/\.json$/, '.txt'), { type: 'text/plain' })];
    const file = canShare ? candidates.find((f) => navigator.canShare?.({ files: [f] })) : undefined;
    if (file) {
      try {
        await navigator.share({ files: [file], title: SHARE_TITLE });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    downloadText(body, name);
    toast('ファイルを保存しました');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal share-list-modal" role="dialog" aria-modal="true" aria-labelledby="share-list-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="share-list-title" className="modal-title">
          {list.items.length}件をシェア
        </h2>

        <label className="check-row">
          <input type="checkbox" checked={includeMemo} disabled={!hasAnyMemo} onChange={(e) => setIncludeMemo(e.target.checked)} />
          <span>
            メモも含める
            <span className="muted small">（各{SHARE_MEMO_MAX}文字まで{hasAnyMemo ? '' : '・メモのある回はありません'}）</span>
          </span>
        </label>

        <p className="share-list-warn">
          ⚠️ リンクを知っている人は誰でも中身を見られます。相手に見える内容を下で確認してください{includeMemo ? '（メモに個人的なことが書かれていないか）' : ''}。
        </p>

        <h3 className="section-title small">相手に見える内容（プレビュー）</h3>
        <div className="card-list share-list-preview">
          {list.items.map((it, i) => (
            <SharedItemView key={i} item={it} />
          ))}
        </div>

        {error && <p className="field-error">{error}</p>}
        {tooLong && (
          <p className="field-warn">
            リンクがとても長いため（{url.length.toLocaleString()}文字）、LINE などでは送れないことがあります。メモを外す・件数を減らすか、「ファイルで送る」をお使いください。
          </p>
        )}

        <div className="share-actions">
          {canShare && (
            <button type="button" className="btn btn-primary btn-block btn-large" disabled={!url} onClick={() => void share()}>
              共有する（LINE・X など）
            </button>
          )}
          <button type="button" className={`btn btn-block ${canShare ? '' : 'btn-primary btn-large'}`} disabled={!url} onClick={() => void copy()}>
            リンクをコピー
          </button>
          <button type="button" className="btn btn-block btn-small" onClick={() => void sendFile()}>
            ファイルで送る
          </button>
          <details className="share-url-box">
            <summary>リンクを表示</summary>
            <textarea id="share-list-url" className="input textarea share-url" readOnly rows={3} value={url} aria-label="シェア用リンク" />
          </details>
          <button type="button" className="btn btn-block" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
