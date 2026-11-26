import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { useUi } from '../components/UiProvider';
import { ShareImageModal } from '../components/ShareImageModal';
import { createShareImage, shareFileName } from '../lib/shareImage';
import { deleteEpisodeLog } from '../db/repo';
import { useData } from '../state/DataContext';
import { errorMessage, formatYmd } from '../lib/util';

/** S6：聴取ログ詳細 */
export function LogDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, programById, personById, appearancesByLog, reload } = useData();
  const { confirm, alert, toast } = useUi();
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  // 別のログへ移動したらシェア画面を閉じる
  useEffect(() => setSharing(false), [id]);

  const log = data.episodeLogs.find((l) => l.id === id);
  if (loading) return <PageHeader title="読み込み中…" back />;
  if (!log)
    return (
      <>
        <PageHeader title="リピート回が見つかりません" back />
        <EmptyState title="削除された可能性があります">
          <Link to="/" className="btn">
            一覧へ
          </Link>
        </EmptyState>
      </>
    );

  const program = programById.get(log.programId);
  const apps = appearancesByLog.get(log.id) ?? [];

  const onDelete = async () => {
    const ok = await confirm({
      title: 'このリピート回を削除しますか？',
      message: `${formatYmd(log.broadcastDate)}「${program?.name ?? ''}」の記録を削除します。この操作は取り消せません。`,
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteEpisodeLog(log.id);
      await reload();
      toast('リピート回を削除しました');
      navigate('/', { replace: true });
    } catch (err) {
      setDeleting(false);
      await alert('削除できませんでした', errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={formatYmd(log.broadcastDate)}
        kicker="ON AIR"
        back
        actions={
          <Link to={`/logs/${log.id}/edit`} className="btn btn-small">
            編集
          </Link>
        }
      />
      <article className="card detail-card">
        {program ? (
          <Link to={`/programs/${program.id}`} className="detail-program">
            <span className="detail-program-name">{program.name}</span>
            {program.station && <span className="station-badge">{program.station}</span>}
            <span className="detail-program-arrow" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : (
          <div className="detail-program">（不明な番組）</div>
        )}

        <h2 className="section-title small">出演者</h2>
        {apps.length === 0 ? (
          <p className="muted">登録なし</p>
        ) : (
          <div className="chips">
            {apps.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${a.role === 'guest' ? 'is-guest' : ''}`}
                title="この人が出演しているリピート回を表示"
                onClick={() => navigate(`/?person=${encodeURIComponent(a.personId)}`)}
              >
                {personById.get(a.personId)?.name ?? '?'}
                {a.role === 'guest' && <span className="chip-tag">ゲスト</span>}
              </button>
            ))}
          </div>
        )}

        <h2 className="section-title small">リピートしたい理由・メモ</h2>
        {log.memo ? <p className="memo-full">{log.memo}</p> : <p className="muted">メモなし</p>}
      </article>

      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => setSharing(true)}>
          シェア画像を作成
        </button>
        <Link to={`/logs/${log.id}/edit`} className="btn btn-block">
          編集する
        </Link>
        <button type="button" className="btn btn-danger-outline btn-block" onClick={() => void onDelete()} disabled={deleting}>
          削除する
        </button>
      </div>
      {sharing && (
        <ShareImageModal
          onClose={() => setSharing(false)}
          fileName={shareFileName(log.broadcastDate)}
          title={`${program?.name ?? ''} ${log.broadcastDate}`}
          create={() =>
            createShareImage({
              programName: program?.name ?? '（不明な番組）',
              station: program?.station ?? '',
              broadcastDate: log.broadcastDate,
              memo: log.memo,
              cast: apps.map((a) => ({ name: personById.get(a.personId)?.name ?? '?', role: a.role })),
            })
          }
        />
      )}
    </>
  );
}
