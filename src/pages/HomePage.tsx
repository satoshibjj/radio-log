import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackupReminder } from '../components/BackupReminder';
import { GuideContent } from '../components/GuideContent';
import { ThemeToggleButton } from '../components/ThemePicker';
import { RandomPickModal } from '../components/RandomPickModal';
import { useData } from '../state/DataContext';
import { getLastBackupAt, shareBackup } from '../lib/backupActions';
import { useUi } from '../components/UiProvider';
import { errorMessage } from '../lib/util';

/** この件数未満のうちは使い方ガイドを開いた状態で表示 */
const GUIDE_OPEN_UNDER = 3;

/** ホーム：アプリの入口（紹介・すぐやる操作・記録の数・使い方・バックアップ） */
export function HomePage() {
  const { data, loading } = useData();
  const navigate = useNavigate();
  const logs = data.episodeLogs;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  const lastPickedId = useRef<string | null>(null);

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
        <ThemeToggleButton />
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

      {/* 夜道の80年代風クーペ（オリジナルの形・飾り） */}
      <div className="home-night-road" aria-hidden="true">
        <svg viewBox="0 0 288 64" preserveAspectRatio="xMidYMax meet">
          <rect x="0" y="52" width="288" height="12" fill="#0a1326" />
          <line x1="0" y1="52" x2="288" y2="52" stroke="#7f77dd" strokeWidth="1" opacity="0.6" />
          {/* 紫のボディ */}
          <path d="M18 52 L20 36 L30 30 L96 26 L124 8 L196 6 L226 22 L268 26 L272 40 L270 52 Z" fill="#534ab7" stroke="#3c3489" strokeWidth="1" />
          {/* 金のボンネット */}
          <path d="M21 37 L30 30.5 L96 26.5 L119 25.5 L120 32 L23 40 Z" fill="#d4a93c" stroke="#a87f1c" strokeWidth="0.6" />
          {/* 窓 */}
          <path d="M130 11 L160 10 L160 24 L118 25 Z M166 10 L194 9 L218 23 L166 24 Z" fill="#0f1b33" stroke="#afa9ec" strokeWidth="0.6" />
          <line x1="24" y1="43" x2="270" y2="40" stroke="#cecbf6" strokeWidth="1" opacity="0.7" />
          <rect x="18" y="36" width="10" height="4" fill="#faeeda" />
          <rect x="264" y="31" width="8" height="5" fill="#e24b4a" />
          {/* 金のホイール */}
          <circle cx="74" cy="53" r="11" fill="#0a1326" stroke="#2c2c2a" strokeWidth="2" />
          <circle cx="74" cy="53" r="6.5" fill="#d4a93c" stroke="#a87f1c" strokeWidth="1" />
          <circle cx="74" cy="53" r="2" fill="#a87f1c" />
          <circle cx="222" cy="53" r="11" fill="#0a1326" stroke="#2c2c2a" strokeWidth="2" />
          <circle cx="222" cy="53" r="6.5" fill="#d4a93c" stroke="#a87f1c" strokeWidth="1" />
          <circle cx="222" cy="53" r="2" fill="#a87f1c" />
        </svg>
      </div>

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
