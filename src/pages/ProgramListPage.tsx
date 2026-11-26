import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { SuggestInput, type SuggestItem } from '../components/SuggestInput';
import { useData } from '../state/DataContext';
import { includesNormalized, matchRank } from '../lib/util';

/** S2：番組一覧 */
export function ProgramListPage() {
  const { data, loading, logCountByProgram } = useData();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const suggestions = useMemo<SuggestItem[]>(() => {
    const out: { item: SuggestItem; rank: number }[] = [];
    for (const p of data.programs) {
      const rn = matchRank(p.name, q);
      const rs = matchRank(p.station, q);
      const rank = rn >= 0 ? rn : rs >= 0 ? rs + 3 : -1;
      if (rank < 0) continue;
      const count = logCountByProgram.get(p.id) ?? 0;
      out.push({ rank, item: { key: p.id, label: p.name, sub: [p.station, `リピート ${count} 回`].filter(Boolean).join('・') } });
    }
    return out
      .sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label, 'ja'))
      .slice(0, 6)
      .map((x) => x.item);
  }, [data.programs, q, logCountByProgram]);

  const programs = useMemo(
    () =>
      data.programs
        .filter((p) => includesNormalized(p.name, q) || includesNormalized(p.station, q))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [data.programs, q],
  );

  return (
    <>
      <PageHeader
        title="番組"
        kicker="STATIONS"
        description="回を追加するときに選ぶ番組の一覧です（登録しただけではリピート帳に入りません）。"
        actions={
          <Link to="/programs/new" className="btn btn-small btn-primary">
            ＋ 新規
          </Link>
        }
      />
      <div className="filter-box">
        <SuggestInput
          value={q}
          onChange={setQ}
          items={suggestions}
          onPick={(id) => navigate(`/programs/${id}`)}
          placeholder="番組名・放送局で検索"
          ariaLabel="番組を検索"
          heading="候補（タップで開く）"
        />
      </div>
      {!loading && programs.length === 0 ? (
        <EmptyState title={data.programs.length === 0 ? '番組が登録されていません' : '該当する番組がありません'}>
          {data.programs.length === 0 && (
            <Link to="/programs/new" className="btn btn-primary">
              番組を登録
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="card-list">
          {programs.map((p) => (
            <Link key={p.id} to={`/programs/${p.id}`} className="card program-card">
              <div className="program-card-main">
                <div className="program-card-name">{p.name}</div>
                {p.station && <div className="program-card-station">{p.station}</div>}
              </div>
              <div className="count-meter" aria-label={`リピート記録 ${logCountByProgram.get(p.id) ?? 0} 回`}>
                <span className="count-meter-num">{logCountByProgram.get(p.id) ?? 0}</span>
                <span className="count-meter-unit">回</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
