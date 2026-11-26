import { useMemo } from 'react';
import type { PodcastResult } from '../lib/external';
import { useData } from '../state/DataContext';
import { normalizeForSearch } from '../lib/util';
import { usePodcastSuggest } from './usePodcastSuggest';

interface Props {
  /** 入力中の番組名 */
  value: string;
  /** ユーザーが入力した時だけ true（編集画面を開いただけでは検索しない） */
  active: boolean;
  /** 編集中の番組 id（登録済みチェックから除外） */
  editingId?: string;
  onSelect: (r: PodcastResult) => void;
}

/** 番組名の入力に合わせて Apple Podcasts の候補を自動表示（ボタン不要） */
export function ProgramNameSuggest({ value, active, editingId, onSelect }: Props) {
  const { data } = useData();
  const { term, enabled, results, loading, error } = usePodcastSuggest(value, active);

  /** 同名の番組が既に登録されていないか */
  const duplicate = useMemo(() => {
    const n = normalizeForSearch(term);
    return n ? data.programs.find((p) => p.id !== editingId && normalizeForSearch(p.name) === n) : undefined;
  }, [data.programs, term, editingId]);

  if (!enabled) return null;

  // 入力と完全に同じ名前の候補だけなら出さない（選択済み）
  const shown = results.filter((r) => normalizeForSearch(r.name) !== normalizeForSearch(term));

  return (
    <div className="name-suggest" aria-live="polite">
      {duplicate && <p className="field-warn">「{duplicate.name}」は登録済みです。番組一覧から選べます。</p>}
      {loading && <p className="muted small">候補を検索中…</p>}
      {!loading && error && <p className="muted small">{error}</p>}
      {!loading && shown.length > 0 && (
        <ul className="suggest" role="listbox" aria-label="Apple Podcasts の候補">
          <li className="suggest-head">候補（タップで入力）</li>
          {shown.slice(0, 8).map((r) => (
            <li key={r.id}>
              <button type="button" className="suggest-item" onClick={() => onSelect(r)}>
                <span>{r.name}</span>
                {r.artist && <span className="suggest-via">{r.artist}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && (
        <p className="assist-note">
          {shown.length === 0 && results.length === 0 ? '候補なし。そのまま入力して登録できます。' : ''}
          ※ 候補は Apple Podcasts にある番組だけです（radiko のみ・Spotify 独占配信の番組は出ません）。
        </p>
      )}
    </div>
  );
}
