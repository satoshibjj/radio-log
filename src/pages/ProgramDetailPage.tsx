import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { LogCard } from '../components/LogCard';
import { useData } from '../state/DataContext';
import { compareLogsDesc } from '../lib/util';

/** S3：番組詳細 */
export function ProgramDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, programById, personById } = useData();
  const program = programById.get(id);

  const logs = useMemo(
    () => data.episodeLogs.filter((l) => l.programId === id).sort(compareLogsDesc),
    [data.episodeLogs, id],
  );

  if (loading) return <PageHeader title="読み込み中…" back />;
  if (!program)
    return (
      <>
        <PageHeader title="番組が見つかりません" back />
        <EmptyState title="削除された可能性があります">
          <Link to="/programs" className="btn">
            番組一覧へ
          </Link>
        </EmptyState>
      </>
    );

  return (
    <>
      <PageHeader
        title={program.name}
        kicker={program.station || 'PROGRAM'}
        back
        actions={
          <Link to={`/programs/${program.id}/edit`} className="btn btn-small">
            編集
          </Link>
        }
      />
      <section className="card info-card">
        <dl className="info-list">
          <dt>放送局</dt>
          <dd>{program.station || '—'}</dd>
          <dt>基本パーソナリティ</dt>
          <dd>
            {program.defaultPersonIds.length === 0 ? (
              '—'
            ) : (
              <div className="chips">
                {program.defaultPersonIds.map((pid) => (
                  <Link key={pid} to={`/logs?person=${encodeURIComponent(pid)}`} className="chip">
                    {personById.get(pid)?.name ?? '?'}
                  </Link>
                ))}
              </div>
            )}
          </dd>
          <dt>リピート記録</dt>
          <dd>{logs.length} 回</dd>
        </dl>
      </section>

      <div className="sticky-action">
        <button
          type="button"
          className="btn btn-primary btn-block btn-large"
          onClick={() => navigate(`/logs/new?programId=${encodeURIComponent(program.id)}`)}
        >
          この番組のリピート回を記録
        </button>
      </div>

      <h2 className="section-title">リピート回</h2>
      {logs.length === 0 ? (
        <EmptyState title="この番組のリピート回はまだありません" />
      ) : (
        <div className="card-list">
          {logs.map((l) => (
            <LogCard key={l.id} log={l} hideProgram />
          ))}
        </div>
      )}
    </>
  );
}
