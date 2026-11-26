import { useState } from 'react';
import type { EpisodeLink } from '../db/types';
import { detectService, isYouTubeVideoUrl, MAX_LINK_LABEL, MAX_LINKS, normalizeHttpUrl } from '../lib/links';
import { fetchYouTubeInfo, type YouTubeInfo } from '../lib/external';
import { errorMessage } from '../lib/util';

interface Props {
  links: EpisodeLink[];
  onChange: (links: EpisodeLink[]) => void;
  /** YouTube から題名を取得したとき（番組の自動選択などに使う） */
  onYouTubeInfo?: (info: YouTubeInfo) => void;
}

/** 回のリンク（聴ける・見られる場所）を入力する欄。空欄でも保存できる（任意） */
export function LinkListEditor({ links, onChange, onYouTubeInfo }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, string>>({});

  const update = (i: number, patch: Partial<EpisodeLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => {
    onChange(links.filter((_, j) => j !== i));
    setMessages({});
  };

  const fetchTitle = async (i: number) => {
    const url = normalizeHttpUrl(links[i].url);
    if (!url) return;
    setBusy(i);
    setMessages((m) => ({ ...m, [i]: '' }));
    try {
      const info = await fetchYouTubeInfo(url);
      if (info.title) update(i, { label: info.title.slice(0, MAX_LINK_LABEL) });
      setMessages((m) => ({ ...m, [i]: `題名を入力しました${info.channel ? `（チャンネル：${info.channel}）` : ''}` }));
      onYouTubeInfo?.(info);
    } catch (err) {
      setMessages((m) => ({ ...m, [i]: errorMessage(err) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="link-editor">
      {links.map((l, i) => {
        const normalized = normalizeHttpUrl(l.url);
        const service = normalized ? detectService(normalized) : undefined;
        const invalid = l.url.trim() !== '' && !normalized;
        return (
          <div className="link-row" key={i}>
            <div className="link-row-top">
              <input
                className={`input ${invalid ? 'has-error' : ''}`}
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={`リンク${i + 1}の URL`}
                placeholder="https://…（radiko・Spotify・YouTube など）"
                value={l.url}
                onChange={(e) => update(i, { url: e.target.value })}
              />
              <button type="button" className="icon-btn link-remove" aria-label={`リンク${i + 1}を削除`} onClick={() => remove(i)}>
                ×
              </button>
            </div>
            {invalid && <p className="field-error">http:// か https:// で始まる URL を入力してください</p>}
            {service && (
              <div className="link-row-meta">
                <span className="station-badge">{service.name}</span>
                <input
                  className="input input-small"
                  aria-label={`リンク${i + 1}の表示名`}
                  placeholder="表示名（任意）"
                  maxLength={MAX_LINK_LABEL}
                  value={l.label ?? ''}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
            )}
            {normalized && isYouTubeVideoUrl(normalized) && (
              <button type="button" className="btn btn-small btn-assist" disabled={busy !== null} onClick={() => void fetchTitle(i)}>
                {busy === i ? '取得中…' : '▶ YouTube から題名を取得'}
              </button>
            )}
            {messages[i] && (
              <p className="assist-note" aria-live="polite">
                {messages[i]}
              </p>
            )}
            {service?.note && <p className="assist-note">※ {service.note}</p>}
          </div>
        );
      })}
      {links.length < MAX_LINKS && (
        <button type="button" className="btn btn-small link-add" onClick={() => onChange([...links, { url: '' }])}>
          ＋ リンクを追加
        </button>
      )}
    </div>
  );
}
