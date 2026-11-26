import { useState } from 'react';
import { searchPodcasts, type PodcastResult } from '../lib/external';
import { errorMessage } from '../lib/util';

interface Props {
  /** 検索欄の初期値（入力中の番組名） */
  initialTerm: string;
  onSelect: (r: PodcastResult) => void;
}

/** S4：Podcast/番組を検索して自動入力（iTunes Search API） */
export function PodcastSearch({ initialTerm, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PodcastResult[] | null>(null);
  const [error, setError] = useState('');

  const run = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      setResults(await searchPodcasts(q));
    } catch (err) {
      setResults(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-small btn-assist"
        onClick={() => {
          setOpen(true);
          setTerm(initialTerm.trim());
          setResults(null);
          setError('');
          if (initialTerm.trim()) void run(initialTerm);
        }}
      >
        🔍 Podcast/番組を検索して自動入力
      </button>
    );
  }

  return (
    <div className="assist-panel">
      <div className="assist-row">
        <input
          className="input"
          type="search"
          value={term}
          placeholder="番組名・パーソナリティ名で検索"
          aria-label="Podcast/番組を検索"
          enterKeyHint="search"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void run(term);
            }
          }}
        />
        <button type="button" className="btn btn-primary" onClick={() => void run(term)} disabled={loading || !term.trim()}>
          検索
        </button>
      </div>
      {loading && <p className="muted">検索中…</p>}
      {error && <p className="field-error">{error}</p>}
      {results && !loading && (
        results.length === 0 ? (
          <p className="muted">見つかりませんでした。番組名を手入力してください。</p>
        ) : (
          <ul className="suggest assist-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="suggest-item assist-item"
                  onClick={() => {
                    onSelect(r);
                    setOpen(false);
                  }}
                >
                  <span className="assist-item-text">
                    <span>{r.name}</span>
                    {r.artist && <span className="suggest-via">{r.artist}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      <div className="assist-footer">
        <span className="muted">検索語のみ Apple（iTunes Search API）に送信されます</span>
        <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
    </div>
  );
}
