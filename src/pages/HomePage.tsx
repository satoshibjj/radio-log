import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackupReminder } from '../components/BackupReminder';
import { GuideContent } from '../components/GuideContent';
import { LogCard } from '../components/LogCard';
import { RandomPickModal } from '../components/RandomPickModal';
import { useData } from '../state/DataContext';
import { getLastBackupAt, shareBackup } from '../lib/backupActions';
import { useUi } from '../components/UiProvider';
import { errorMessage } from '../lib/util';

const RECENT_COUNT = 3;
/** この件数未満のうちは使い方ガイドを開いた状態で表示 */
const GUIDE_OPEN_UNDER = 3;

/** ホーム：アプリの入口（紹介・すぐやる操作・最近の回・使い方・バックアップ） */
export function HomePage() {
  const { data, loading } = useData();
  const navigate = useNavigate();
  const logs = data.episodeLogs;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  const lastPickedId = useRef<string | null>(null);

  const recent = useMemo(
    () => [...logs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, RECENT_COUNT),
    [logs],
  );
  const { toast } = useUi();
  const [lastBackup, setLastBackup] = useState<Date | null>(() => getLastBackupAt());

  const backupNow = async () => {
    try {
      const r = await shareBackup(data);
      if (r === 'cancelled') return;
      setLastBackup(getLastBackupAt());
      toast(r === 'shared' ? 'バックアップを送りました' : 'バックアップを保存しました');
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  const draw = () => {
    if (logs.length === 0) return;
    const pool = logs.length >= 2 ? logs.filter((l) => l.id !== lastPickedId.current) : logs;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastPickedId.current = pick.id;
    setPickedId(pick.id);
    setDrawCount((n) => n + 1);
  };
  const picked = pickedId ? logs.find((l) => l.id === pickedId) : undefined;

  return (
    <>
      <header className="home-hero">
        <div className="home-hero-kicker">AM · FM · PODCAST · YOUTUBE</div>
        <h1 className="home-title">Radio Log</h1>
        <p className="home-tagline">
          ラジオの<strong>「また聴きたい回」</strong>をストックするアプリ
        </p>
        <p className="home-tagline-sub">Podcast・YouTube・配信のアーカイブも記録できます</p>
        <div className="dial-scale home-dial" aria-hidden="true" />
      </header>

      {!loading && logs.length > 0 && <BackupReminder />}

      <section className="home-actions" aria-label="すぐやる操作">
        <Link to="/logs/new" className="btn btn-primary btn-block btn-large">
          ＋ また聴きたい回を追加
        </Link>
        {logs.length > 0 && (
          <button type="button" className="btn btn-block home-random" onClick={draw}>
            🎲 おまかせ1本（今日聴く回を選ぶ）
          </button>
        )}
      </section>

      {logs.length > 0 && (
        <section aria-labelledby="home-recent">
          <h2 id="home-recent" className="section-title">
            最近追加した回
          </h2>
          <div className="card-list">
            {recent.map((l) => (
              <LogCard key={l.id} log={l} />
            ))}
          </div>
          <Link to="/logs" className="btn btn-block home-more">
            リピート帳をすべて見る（{logs.length}件）›
          </Link>
        </section>
      )}

      {(logs.length > 0 || data.programs.length > 0 || data.persons.length > 0) && (
      <section className="card stats-card home-stats" aria-label="記録の数">
        <Link to="/logs" className="stat">
          <span className="stat-num">{logs.length}</span>
          <span className="stat-label">リピート回</span>
        </Link>
        <Link to="/programs" className="stat">
          <span className="stat-num">{data.programs.length}</span>
          <span className="stat-label">番組</span>
        </Link>
        <Link to="/persons" className="stat">
          <span className="stat-num">{data.persons.length}</span>
          <span className="stat-label">出演者</span>
        </Link>
      </section>
      )}

      <section className="card home-backup" aria-labelledby="home-backup-title">
        <div className="home-backup-head">
          <h2 id="home-backup-title">💾 データのバックアップ・復元</h2>
          <span className="muted">
            最後のバックアップ：{lastBackup ? lastBackup.toLocaleDateString('ja-JP') : 'まだありません'}
          </span>
        </div>
        <div className="home-backup-actions">
          {logs.length > 0 && (
            <button type="button" className="btn btn-small btn-primary" onClick={() => void backupNow()}>
              📤 今すぐ送る
            </button>
          )}
          <Link to="/data" className="btn btn-small">
            保存・復元の画面へ ›
          </Link>
        </div>
      </section>

      {!loading && (
        <details className="home-guide card" open={logs.length < GUIDE_OPEN_UNDER}>
          <summary>
            <span className="home-guide-icon" aria-hidden="true">
              📻
            </span>
            かんたん使い方ガイド
          </summary>
          <div className="home-guide-body">
            <GuideContent />
          </div>
        </details>
      )}


      {picked && (
        <RandomPickModal
          log={picked}
          drawCount={drawCount}
          scopeLabel={`全 ${logs.length} 件から抽選`}
          canReroll={logs.length >= 2}
          onDetail={() => navigate(`/logs/${picked.id}`)}
          onReroll={draw}
          onClose={() => setPickedId(null)}
        />
      )}
    </>
  );
}
