import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { useUi } from '../components/UiProvider';
import { deletePerson, PersonInUseError, savePerson } from '../db/repo';
import type { Person } from '../db/types';
import { useData } from '../state/DataContext';
import { cleanName, errorMessage, includesNormalized, normalizeForSearch, splitAliasText } from '../lib/util';

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
        title="人物"
        kicker="PERSONALITIES"
        actions={
          <button type="button" className="btn btn-small btn-primary" onClick={() => setEditing('new')}>
            ＋ 新規
          </button>
        }
      />
      <div className="filter-box">
        <input
          className="input"
          type="search"
          placeholder="名前・別名で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="人物を検索"
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
        <EmptyState title={data.persons.length === 0 ? '人物が登録されていません' : '該当する人物がいません'}>
          {data.persons.length === 0 && <p>番組登録や記録の画面からも追加できます。</p>}
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
                <Link to={`/?person=${encodeURIComponent(p.id)}`} className="count-meter" aria-label={`${p.name} の出演リピート回`}>
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
