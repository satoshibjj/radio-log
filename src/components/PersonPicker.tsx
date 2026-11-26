import { useId, useMemo, useState } from 'react';
import { useData } from '../state/DataContext';
import { useUi } from './UiProvider';
import { savePerson } from '../db/repo';
import type { Person } from '../db/types';
import { cleanName, errorMessage, normalizeForSearch } from '../lib/util';

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
  const inputId = useId();

  const nq = normalizeForSearch(q);
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
    return out.sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name, 'ja')).slice(0, 8);
  }, [data.persons, exclude, nq]);

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
  };

  const create = async () => {
    const name = cleanName(q);
    if (!name || busy) return;
    setBusy(true);
    try {
      const p = await savePerson({ name, aliases: [] });
      await reload();
      onPick(p.id);
      // 保存中に入力が変わっていたら消さない
      setQ((cur) => (cleanName(cur) === name ? '' : cur));
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
          {!allowCreate && matches.length === 0 && !exact && <li className="suggest-empty">該当する人物がいません</li>}
        </ul>
      )}
    </div>
  );
}
