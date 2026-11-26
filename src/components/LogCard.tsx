import { Link } from 'react-router-dom';
import type { EpisodeLog } from '../db/types';
import { useData } from '../state/DataContext';
import { formatLogDate } from '../lib/util';
import { detectService, linksOf } from '../lib/links';

interface Props {
  log: EpisodeLog;
  /** 番組名を表示しない（番組詳細内など） */
  hideProgram?: boolean;
}

export function LogCard({ log, hideProgram }: Props) {
  const { programById, personById, appearancesByLog } = useData();
  const program = programById.get(log.programId);
  const apps = appearancesByLog.get(log.id) ?? [];
  // リンク先のサービス名（重複は1つに）。カード全体がリンクなので、ここは表示だけ
  const services = Array.from(new Set(linksOf(log).map((l) => detectService(l.url).name)));

  return (
    <Link to={`/logs/${log.id}`} className="card log-card">
      <div className="log-card-top">
        {log.broadcastDate ? (
          <time className="date-badge" dateTime={log.broadcastDate}>
            {formatLogDate(log.broadcastDate)}
          </time>
        ) : (
          <span className="date-badge is-nodate">{formatLogDate('')}</span>
        )}
        {!hideProgram && program?.station && <span className="station-badge">{program.station}</span>}
        {services.length > 0 && (
          <span className="link-badge" aria-label={`リンクあり：${services.join('・')}`}>
            🔗 {services.join('・')}
          </span>
        )}
      </div>
      {!hideProgram && <div className="log-card-program">{program?.name ?? '（不明な番組）'}</div>}
      {apps.length > 0 && (
        <div className="log-card-persons">
          {apps.map((a) => (
            <span key={a.id} className={`mini-chip ${a.role === 'guest' ? 'is-guest' : ''}`}>
              {personById.get(a.personId)?.name ?? '?'}
            </span>
          ))}
        </div>
      )}
      {log.memo && <p className="log-card-memo">{log.memo}</p>}
    </Link>
  );
}
