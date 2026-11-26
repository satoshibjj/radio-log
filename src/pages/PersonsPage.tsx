import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { SuggestInput, type SuggestItem } from '../components/SuggestInput';
import { useUi } from '../components/UiProvider';
import { deletePerson, PersonInUseError, savePerson } from '../db/repo';
import type { Person } from '../db/types';
import { useData } from '../state/DataContext';
import { cleanName, errorMessage, includesNormalized, matchRank, normalizeForSearch, splitAliasText } from '../lib/util';

/** 人物管理（表示名・別名の編集、参照チェック付き削除） */
export function PersonsPage() {
  const { data, loading, reload } = useData();
  const { confirm, alert, toast } = useUi();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const appearanceCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data.episodeAppearances) m.set(a.personId, (m.get(a.personId) ?? 0) + 1);
    return m;
  }, [data.episodeAppearances]);

  const persons = useMemo(
    () =>
      data.persons
        .filter((p) => includesNormalized(p.name, q) || p.aliases.some((a) => includesNormalized(a, q)))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [data.persons, q],
  );

  const suggestions = useMemo<SuggestItem[]>(() => {
    const out: { item: SuggestItem; rank: number; count: number }[] = [];
    for (const p of data.persons) {
      let rank = matchRank(p.name, q);
      let via = '';
      if (rank < 0) {
        for (const a of p.aliases) {
          const r = matchRank(a, q);
          if (r >= 0 && (rank < 0 || r + 3 < rank)) {
            rank = r + 3;
            via = a;
          }
        }
      }
      if (rank < 0) continue;
      const count = appearanceCount.get(p.id) ?? 0;
      out.push({ rank, count, item: { key: p.id, label: p.name, sub: [via && `別名: ${via}`, `出演 ${count} 回`].filter(Boolean).join('・') } });
    }
    return out
      .sort((a, b) => a.rank - b.rank || b.count - a.count || a.item.label.localeCompare(b.item.label, 'ja'))
      .slice(0, 6)
      .map((x) => x.item);
  }, [data.persons, q, appearanceCount]);

  const onDelete = async (p: Person) => {
    const ok = await confirm({
      title: '人物を削除しますか？',
      message: `「${p.name}」を削除します。`,
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePerson(p.id);
      await reload();
      setEditing(null);
      toast('人物を削除しました');
    } catch (err) {
      if (err instanceof PersonInUseError) {
        const u = err.usage;
        await alert(
          '削除できません',
          <div className="usage">
            <p>「{err.personName}」は次のデータで参照されています。参照を外してから削除してください。</p>
            {u.defaultOfPrograms.length > 0 && (
              <>
                <h3>基本パーソナリティに登録している番組</h3>
                <ul>
                  {u.defaultOfPrograms.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            {u.logCount > 0 && (
              <>
                <h3>出演者として登録されているリピート回：計 {u.logCount} 件</h3>
                <ul>
                  {u.logsByProgram.map((x) => (
                    <li key={x.programName}>
                      {x.programName}：{x.count} 件
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>,
        );
      } else {
        await alert('削除できませんでした', errorMessage(err));
      }
    }
  };

  return (
    <>
      <PageHeader
        title="出演者"
        kicker="PERSONALITIES"
        description="パーソナリティ・ゲストの名簿です。回を追加するときに入力した人も自動でここに入ります。"
        actions={
          <button type="button" className="btn btn-small btn-primary" onClick={() => setEditing('new')}>
            ＋ 新規
          </button>
        }
      />
      <div className="filter-box">
        <SuggestInput
          value={q}
          onChange={setQ}
          items={suggestions}
          onPick={(id) => {
            const p = data.persons.find((x) => x.id === id);
            if (!p) return;
            setQ(p.name);
            setEditing(p);
          }}
          placeholder="名前・別名で検索"
          ariaLabel="出演者を検索"
          heading="候補（タップで編集）"
        />
      </div>

      {editing === 'new' && (
        <PersonForm
          onCancel={() => setEditing(null)}
          onSaved={async (p, isNew) => {
            await reload();
            setEditing(null);
            toast(isNew ? `「${p.name}」を追加しました` : '更新しました');
          }}
          existingPersons={data.persons}
          confirm={confirm}
        />
      )}

      {!loading && persons.length === 0 ? (
        <EmptyState title={data.persons.length === 0 ? '出演者が登録されていません' : '該当する出演者がいません'}>
          {data.persons.length === 0 && <p>番組の登録や回の追加の画面からも追加できます。</p>}
        </EmptyState>
      ) : (
        <div className="card-list">
          {persons.map((p) =>
            editing !== 'new' && editing?.id === p.id ? (
              <PersonForm
                key={p.id}
                person={p}
                onCancel={() => setEditing(null)}
                onDelete={() => void onDelete(p)}
                onSaved={async () => {
                  await reload();
                  setEditing(null);
                  toast('更新しました');
                }}
                existingPersons={data.persons}
                confirm={confirm}
              />
            ) : (
              <div key={p.id} className="card person-card">
                <button type="button" className="person-card-main" onClick={() => setEditing(p)} aria-label={`${p.name} を編集`}>
                  <span className="person-card-name">{p.name}</span>
                  {p.aliases.length > 0 && <span className="person-card-aliases">別名：{p.aliases.join('、')}</span>}
                </button>
                <Link to={`/logs?person=${encodeURIComponent(p.id)}`} className="count-meter" aria-label={`${p.name} の出演リピート回`}>
                  <span className="count-meter-num">{appearanceCount.get(p.id) ?? 0}</span>
                  <span className="count-meter-unit">出演</span>
                </Link>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}

interface FormProps {
  person?: Person;
  existingPersons: Person[];
  onCancel: () => void;
  onSaved: (p: Person, isNew: boolean) => Promise<void>;
  onDelete?: () => void;
  confirm: ReturnType<typeof useUi>['confirm'];
}

function PersonForm({ person, existingPersons, onCancel, onSaved, onDelete, confirm }: FormProps) {
  const [name, setName] = useState(person?.name ?? '');
  const [aliasText, setAliasText] = useState(person?.aliases.join('、') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = cleanName(name);
    if (!n) {
      setError('名前を入力してください');
      return;
    }
    const nn = normalizeForSearch(n);
    const dup = existingPersons.find(
      (p) => p.id !== person?.id && (normalizeForSearch(p.name) === nn || p.aliases.some((a) => normalizeForSearch(a) === nn)),
    );
    if (dup) {
      const ok = await confirm({
        title: '同じ名前の人物がいます',
        message: `「${dup.name}」が既に登録されています。別人として保存しますか？`,
        confirmLabel: '保存する',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const saved = await savePerson({ id: person?.id, name: n, aliases: splitAliasText(aliasText) });
      await onSaved(saved, !person);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="card person-form" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor={`pn-${person?.id ?? 'new'}`}>
          表示名 <span className="req">必須</span>
        </label>
        <input
          id={`pn-${person?.id ?? 'new'}`}
          className={`input ${error ? 'has-error' : ''}`}
          value={name}
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
        {error && <p className="field-error">{error}</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`pa-${person?.id ?? 'new'}`}>
          別名・愛称・表記ゆれ
        </label>
        <input
          id={`pa-${person?.id ?? 'new'}`}
          className="input"
          value={aliasText}
          autoComplete="off"
          placeholder="「、」または「,」区切り"
          onChange={(e) => setAliasText(e.target.value)}
        />
      </div>
      <div className="row-actions">
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          保存
        </button>
      </div>
      {onDelete && (
        <button type="button" className="btn btn-danger-outline btn-block" onClick={onDelete} disabled={busy}>
          この人物を削除
        </button>
      )}
    </form>
  );
}
