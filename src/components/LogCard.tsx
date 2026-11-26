import { Link } from 'react-router-dom';
import type { EpisodeLog } from '../db/types';
import { useData } from '../state/DataContext';
import { formatYmd } from '../lib/util';

interface Props {
  log: EpisodeLog;
  /** 番組名を表示しない（番組詳細内など） */
  hideProgram?: boolean;
}

export function LogCard({ log, hideProgram }: Props) {
  const { programById, personById, appearancesByLog } = useData();
  const program = programById.get(log.programId);
  const apps = appearancesByLog.get(log.id) ?? [];

  return (
    <Link to={`/logs/${log.id}`} className="card log-card">
      <div className="log-card-top">
        <time className="date-badge" dateTime={log.broadcastDate}>
          {formatYmd(log.broadcastDate)}
        </time>
        {!hideProgram && program?.station && <span className="station-badge">{program.station}</span>}
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
