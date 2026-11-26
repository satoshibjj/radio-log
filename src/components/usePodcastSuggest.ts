import { useEffect, useRef, useState } from 'react';
import { searchPodcasts, type PodcastResult } from '../lib/external';
import { errorMessage } from '../lib/util';

const DEBOUNCE_MS = 700;
export const PODCAST_MIN_CHARS = 2;
/** 同じ語は再検索しない（API の回数制限対策）。番組登録と回の追加で共有 */
const cache = new Map<string, PodcastResult[]>();

/**
 * 入力中の番組名で Apple Podcasts の候補を検索する（入力が止まって 700ms 後・2文字以上・キャッシュあり）。
 * active が false の間は検索しない（画面を開いただけ・URL が入っている時など）。
 */
export function usePodcastSuggest(value: string, active: boolean) {
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const term = value.trim();
  const enabled = active && term.length >= PODCAST_MIN_CHARS;

  useEffect(() => {
    setError('');
    if (!enabled) {
      seq.current++;
      setResults([]);
      setLoading(false);
      return;
    }
    const cached = cache.get(term);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchPodcasts(term)
        .then((r) => {
          cache.set(term, r);
          if (my === seq.current) setResults(r);
        })
        .catch((err) => {
          if (my === seq.current) {
            setResults([]);
            setError(errorMessage(err));
          }
        })
        .finally(() => {
          if (my === seq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, enabled]);

  return { term, enabled, results, loading, error };
}
