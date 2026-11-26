import { useId, useMemo, useState } from 'react';
import { useData } from '../state/DataContext';
import { useUi } from './UiProvider';
import { savePerson } from '../db/repo';
import type { Person } from '../db/types';
import { cleanName, errorMessage, normalizeForSearch } from '../lib/util';
import { searchWikipediaPersons, type WikiPersonCandidate } from '../lib/external';
import { appearanceCounts } from '../lib/suggest';

interface Props {
  /** 既に選択済み（候補から除外） */
  excludeIds: string[];
  onPick: (personId: string) => void;
  /** 新規人物のその場追加を許可 */
  allowCreate?: boolean;
  placeholder?: string;
  label?: string;
}

interface Match {
  person: Person;
  /** 別名でヒットした場合の別名 */
  via?: string;
  score: number;
}

/** 人物を name / aliases から検索して選ぶ入力（サジェスト付き） */
export function PersonPicker({ excludeIds, onPick, allowCreate = false, placeholder, label }: Props) {
  const { data, reload } = useData();
  const { toast } = useUi();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  /** Wikipedia 候補（検索した語ごと） */
  const [wiki, setWiki] = useState<{ query: string; loading: boolean; results: WikiPersonCandidate[]; error: string } | null>(null);
  const inputId = useId();

  const nq = normalizeForSearch(q);
  const counts = useMemo(() => appearanceCounts(data.episodeAppearances), [data.episodeAppearances]);
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const matches = useMemo<Match[]>(() => {
    if (!nq) return [];
    const out: Match[] = [];
    for (const p of data.persons) {
      if (exclude.has(p.id)) continue;
      const n = normalizeForSearch(p.name);
      if (n === nq) out.push({ person: p, score: 0 });
      else if (n.startsWith(nq)) out.push({ person: p, score: 1 });
      else if (n.includes(nq)) out.push({ person: p, score: 2 });
      else {
        const alias = p.aliases.find((a) => normalizeForSearch(a).includes(nq));
        if (alias) out.push({ person: p, via: alias, score: normalizeForSearch(alias) === nq ? 0.5 : 3 });
      }
    }
    return out
      .sort(
        (a, b) =>
          a.score - b.score ||
          (counts.get(b.person.id) ?? 0) - (counts.get(a.person.id) ?? 0) ||
          a.person.name.localeCompare(b.person.name, 'ja'),
      )
      .slice(0, 8);
  }, [data.persons, exclude, nq, counts]);

  /** 完全一致する人物（除外済みも含む）があれば新規作成ボタンは出さない */
  const exact = useMemo(
    () =>
      nq
        ? data.persons.find(
            (p) => normalizeForSearch(p.name) === nq || p.aliases.some((a) => normalizeForSearch(a) === nq),
          )
        : undefined,
    [data.persons, nq],
  );

  const pick = (id: string) => {
    onPick(id);
    setQ('');
    setWiki(null);
  };

  const searchWiki = async () => {
    const query = cleanName(q);
    if (!query) return;
    setWiki({ query, loading: true, results: [], error: '' });
    try {
      const results = await searchWikipediaPersons(query);
      setWiki((w) => (w?.query === query ? { query, loading: false, results, error: '' } : w));
    } catch (err) {
      setWiki((w) => (w?.query === query ? { query, loading: false, results: [], error: errorMessage(err) } : w));
    }
  };
  const wikiShown = wiki && wiki.query === cleanName(q) ? wiki : null;

  /** 同名（名前・別名）の既存人物 */
  const findExisting = (name: string) => {
    const n = normalizeForSearch(name);
    return data.persons.find((p) => normalizeForSearch(p.name) === n || p.aliases.some((a) => normalizeForSearch(a) === n));
  };

  const create = async (rawName: string = q) => {
    const name = cleanName(rawName);
    if (!name || busy) return;
    const existing = findExisting(name);
    if (existing) {
      if (exclude.has(existing.id)) toast(`「${existing.name}」は選択済みです`);
      else onPick(existing.id);
      setQ('');
      setWiki(null);
      return;
    }
    setBusy(true);
    try {
      const p = await savePerson({ name, aliases: [] });
      await reload();
      onPick(p.id);
      // 保存中に入力が変わっていたら消さない
      setQ((cur) => (cleanName(cur) === cleanName(q) ? '' : cur));
      setWiki(null);
      toast(`「${p.name}」を人物に追加しました`);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="picker">
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="input"
        type="search"
        value={q}
        placeholder={placeholder ?? '名前・別名で検索'}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[0]) pick(matches[0].person.id);
            else if (allowCreate && !exact) void create();
          }
        }}
      />
      {nq && (
        <ul className="suggest" role="listbox">
          {matches.map((m) => (
            <li key={m.person.id}>
              <button type="button" className="suggest-item" onClick={() => pick(m.person.id)}>
                <span>{m.person.name}</span>
                {m.via && <span className="suggest-via">別名: {m.via}</span>}
              </button>
            </li>
          ))}
          {exact && exclude.has(exact.id) && matches.length === 0 && (
            <li className="suggest-empty">「{exact.name}」は選択済みです</li>
          )}
          {allowCreate && !exact && (
            <li>
              <button type="button" className="suggest-item suggest-create" onClick={() => void create()} disabled={busy}>
                ＋「{cleanName(q)}」を新しい人物として追加
              </button>
            </li>
          )}
          {allowCreate && !wikiShown && (
            <li>
              <button type="button" className="suggest-item suggest-wiki" onClick={() => void searchWiki()}>
                📖 Wikipediaで「{cleanName(q)}」の候補を検索
              </button>
            </li>
          )}
          {wikiShown && (
            <li className="wiki-block">
              <div className="wiki-head">Wikipediaの候補（タップで追加）</div>
              {wikiShown.loading && <div className="suggest-empty">検索中…</div>}
              {wikiShown.error && <div className="suggest-empty field-error">{wikiShown.error}</div>}
              {!wikiShown.loading && !wikiShown.error && wikiShown.results.length === 0 && (
                <div className="suggest-empty">候補が見つかりませんでした</div>
              )}
              {wikiShown.results.map((c) => (
                <button
                  key={c.title}
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() => void create(c.name)}
                >
                  <span>
                    {c.name}
                    {findExisting(c.name) && <span className="badge-registered">登録済み</span>}
                  </span>
                  {(c.qualifier || c.description) && (
                    <span className="suggest-via">{[c.qualifier, c.description].filter(Boolean).join('／')}</span>
                  )}
                </button>
              ))}
              <div className="wiki-foot">検索語のみ Wikipedia に送信されます・出典: Wikipedia</div>
            </li>
          )}
          {!allowCreate && matches.length === 0 && !exact && <li className="suggest-empty">該当する人物がいません</li>}
        </ul>
      )}
    </div>
  );
}
