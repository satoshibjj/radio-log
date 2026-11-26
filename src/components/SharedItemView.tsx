import type { ReactNode } from 'react';
import type { SharedItem } from '../lib/sharedList';
import { detectService, linkDisplayName } from '../lib/links';
import { formatLogDate } from '../lib/util';

interface Props {
  item: SharedItem;
  /** リンクを開けるボタンにする（受け取り画面）。false なら表示だけ（送る前のプレビュー） */
  openableLinks?: boolean;
  /** 右下などに出す操作・状態 */
  children?: ReactNode;
}

/** シェアされる／された1回分の表示（すべてテキストとして表示する） */
export function SharedItemView({ item, openableLinks, children }: Props) {
  return (
    <article className="card shared-item">
      <div className="log-card-top">
        {item.broadcastDate ? (
          <time className="date-badge" dateTime={item.broadcastDate}>
            {formatLogDate(item.broadcastDate)}
          </time>
        ) : (
          <span className="date-badge is-nodate">{formatLogDate('')}</span>
        )}
        {item.station && <span className="station-badge">{item.station}</span>}
      </div>
      <div className="log-card-program shared-item-program">{item.programName}</div>
      {item.cast.length > 0 && (
        <div className="log-card-persons">
          {item.cast.map((c) => (
            <span key={c.name} className={`mini-chip ${c.role === 'guest' ? 'is-guest' : ''}`}>
              {c.name}
            </span>
          ))}
        </div>
      )}
      {item.links.length > 0 && (
        <div className="shared-item-links">
          {item.links.map((l, i) =>
            openableLinks ? (
              <a key={i} className="btn btn-small link-open" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="link-open-name">▶ {linkDisplayName(l)}</span>
              </a>
            ) : (
              <span key={i} className="link-badge">
                🔗 {linkDisplayName(l)}
                {l.label ? `（${detectService(l.url).name}）` : ''}
              </span>
            ),
          )}
        </div>
      )}
      {item.memo && <p className="memo-full shared-item-memo">{item.memo}</p>}
      {children}
    </article>
  );
}
