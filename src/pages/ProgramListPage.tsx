import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { useData } from '../state/DataContext';
import { includesNormalized } from '../lib/util';

/** S2：番組一覧 */
export function ProgramListPage() {
  const { data, loading, logCountByProgram } = useData();
  const [q, setQ] = useState('');

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
        <input
          className="input"
          type="search"
          placeholder="番組名・放送局で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="番組を検索"
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
