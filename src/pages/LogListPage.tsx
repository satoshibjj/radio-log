import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { LogCard } from '../components/LogCard';
import { PersonPicker } from '../components/PersonPicker';
import { useData } from '../state/DataContext';
import { compareLogsDesc } from '../lib/util';

/** S1：聴取ログ一覧（ホーム） */
export function LogListPage() {
  const { data, loading, personById, appearancesByLog } = useData();
  const [params, setParams] = useSearchParams();

  // URL の ?person=ID&person=ID で出演者フィルタを保持（S6 のチップから遷移可能）
  const selected = useMemo(
    () => Array.from(new Set(params.getAll('person'))).filter((id) => personById.has(id)),
    [params, personById],
  );

  const setSelected = (ids: string[]) => {
    const next = new URLSearchParams();
    ids.forEach((id) => next.append('person', id));
    setParams(next, { replace: true });
  };

  const logs = useMemo(() => {
    const sorted = [...data.episodeLogs].sort(compareLogsDesc);
    if (selected.length === 0) return sorted;
    // AND 検索：選択した全員が出演しているログのみ
    return sorted.filter((l) => {
      const ids = new Set((appearancesByLog.get(l.id) ?? []).map((a) => a.personId));
      return selected.every((id) => ids.has(id));
    });
  }, [data.episodeLogs, selected, appearancesByLog]);

  return (
    <>
      <PageHeader title="リピートしたい回" kicker="REPEAT LOG" />
      <section className="filter-box" aria-label="出演者で絞り込み">
        <PersonPicker
          label="出演者で絞り込み（AND）"
          excludeIds={selected}
          onPick={(id) => setSelected([...selected, id])}
        />
        {selected.length > 0 && (
          <div className="chips">
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                className="chip is-selected"
                aria-label={`${personById.get(id)?.name} の絞り込みを解除`}
                onClick={() => setSelected(selected.filter((x) => x !== id))}
              >
                {personById.get(id)?.name} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="chip chip-clear" onClick={() => setSelected([])}>
              すべて解除
            </button>
          </div>
        )}
      </section>

      <div className="list-meta">
        {loading ? '読み込み中…' : `${logs.length} 件${selected.length ? `（全 ${data.episodeLogs.length} 件中）` : ''}`}
      </div>

      {!loading && logs.length === 0 ? (
        data.episodeLogs.length === 0 ? (
          <EmptyState title="まだリピート回がありません">
            {data.programs.length === 0 ? (
              <>
                <p>まずは番組を登録しましょう。</p>
                <Link className="btn btn-primary" to="/programs/new">
                  番組を登録
                </Link>
              </>
            ) : (
              <Link className="btn btn-primary" to="/logs/new">
                リピート回を記録する
              </Link>
            )}
          </EmptyState>
        ) : (
          <EmptyState title="条件に合うリピート回がありません" />
        )
      ) : (
        <div className="card-list">
          {logs.map((l) => (
            <LogCard key={l.id} log={l} />
          ))}
        </div>
      )}
    </>
  );
}
