import { useEffect } from 'react';
import type { EpisodeLog } from '../db/types';
import { useData } from '../state/DataContext';
import { formatLogDate } from '../lib/util';

interface Props {
  log: EpisodeLog;
  /** 抽選のたびに増える（演出の再生用） */
  drawCount: number;
  scopeLabel: string;
  canReroll: boolean;
  onDetail: () => void;
  onReroll: () => void;
  onClose: () => void;
}

/** S1：おまかせ1本の結果（TUNED IN! カード） */
export function RandomPickModal({ log, drawCount, scopeLabel, canReroll, onDetail, onReroll, onClose }: Props) {
  const { programById, personById, appearancesByLog } = useData();
  const program = programById.get(log.programId);
  const apps = appearancesByLog.get(log.id) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pick-dial" aria-hidden="true">
          <div className="pick-scale" />
          <div className="pick-needle" key={drawCount} />
        </div>
        <div className="pick-badge-row">
          <span className="tuned-badge" key={`b${drawCount}`}>
            TUNED IN!
          </span>
          <span className="pick-scope">{scopeLabel}</span>
        </div>

        <div className="pick-card" key={`c${drawCount}`}>
          <time className="pick-date" dateTime={log.broadcastDate || undefined}>
            {formatLogDate(log.broadcastDate)}
          </time>
          <h2 id="pick-title" className="pick-program">
            {program?.name ?? '（不明な番組）'}
          </h2>
          {program?.station && <span className="station-badge">{program.station}</span>}
          {apps.length > 0 && (
            <div className="log-card-persons">
              {apps.map((a) => (
                <span key={a.id} className={`mini-chip ${a.role === 'guest' ? 'is-guest' : ''}`}>
                  {personById.get(a.personId)?.name ?? '?'}
                </span>
              ))}
            </div>
          )}
          {log.memo && <p className="pick-memo">{log.memo}</p>}
        </div>

        <div className="share-actions">
          <button type="button" className="btn btn-primary btn-block btn-large" onClick={onDetail}>
            詳細を見る
          </button>
          <button type="button" className="btn btn-block" onClick={onReroll} disabled={!canReroll}>
            🎲 別の回を引き直す
          </button>
          <button type="button" className="btn btn-block" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
