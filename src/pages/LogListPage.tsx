import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { LogCard } from '../components/LogCard';
import { PersonPicker } from '../components/PersonPicker';
import { RandomPickModal } from '../components/RandomPickModal';
import { useUi } from '../components/UiProvider';
import { BackupReminder } from '../components/BackupReminder';
import { ShareImageModal } from '../components/ShareImageModal';
import { createTopImage } from '../lib/shareImage';
import { useData } from '../state/DataContext';
import { compareLogsDesc, todayLocal } from '../lib/util';
import type { EpisodeLog } from '../db/types';

type SortKey = 'new' | 'old' | 'program' | 'added';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'new', label: '新しい順' },
  { key: 'old', label: '古い順' },
  { key: 'program', label: '番組ごと' },
  { key: 'added', label: '追加した順' },
];
const SORT_STORAGE = 'radiolog.sort';
const isSortKey = (v: unknown): v is SortKey => SORTS.some((s) => s.key === v);
function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE);
    return isSortKey(v) ? v : 'new';
  } catch {
    return 'new';
  }
}

/** S1：聴取ログ一覧（ホーム） */
export function LogListPage() {
  const { data, loading, personById, programById, appearancesByLog } = useData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useUi();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  /** 直前に選ばれた回（連続で同じ回を出さないため） */
  const lastPickedId = useRef<string | null>(null);
  const [sharingTop, setSharingTop] = useState(false);

  // URL の ?person=ID&person=ID で出演者フィルタを保持（S6 のチップから遷移可能）
  const selected = useMemo(
    () => Array.from(new Set(params.getAll('person'))).filter((id) => personById.has(id)),
    [params, personById],
  );

  // 並び順：URL の ?sort= を優先、なければ前回の選択
  const sortParam = params.get('sort');
  const sort: SortKey = isSortKey(sortParam) ? sortParam : loadSort();

  const setSelected = (ids: string[]) => {
    const next = new URLSearchParams();
    ids.forEach((id) => next.append('person', id));
    if (isSortKey(sortParam)) next.set('sort', sortParam);
    setParams(next, { replace: true });
  };

  const setSort = (key: SortKey) => {
    try {
      localStorage.setItem(SORT_STORAGE, key);
    } catch {
      /* noop */
    }
    const next = new URLSearchParams(params);
    next.set('sort', key);
    setParams(next, { replace: true });
  };

  const logs = useMemo(() => {
    const sorted = [...data.episodeLogs].sort(compareLogsDesc);
    if (selected.length === 0) return sorted;
    // AND 検索：選択した全員が出演しているログのみ
    return sorted.filter((l) => {
      const ids = new Set((appearancesByLog.get(l.id) ?? []).map((a) => a.personId));
      return selected.every((id) => ids.has(id));
    });
  }, [data.episodeLogs, selected, appearancesByLog]);

  /** 表示用の並び（番組ごとは見出し付きグループ） */
  const groups = useMemo<{ key: string; title?: string; sub?: string; logs: EpisodeLog[] }[]>(() => {
    if (sort === 'old') return [{ key: 'all', logs: [...logs].reverse() }];
    if (sort === 'added')
      return [{ key: 'all', logs: [...logs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)) }];
    if (sort === 'program') {
      const map = new Map<string, EpisodeLog[]>();
      for (const l of logs) {
        const list = map.get(l.programId);
        if (list) list.push(l);
        else map.set(l.programId, [l]);
      }
      return [...map.entries()]
        .map(([pid, list]) => {
          const p = programById.get(pid);
          return { key: pid, title: p?.name ?? '（不明な番組）', sub: p?.station, logs: list };
        })
        .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ja'));
    }
    return [{ key: 'all', logs }];
  }, [logs, sort, programById]);

  /** いま画面に表示している順の上位5件 */
  const top5 = useMemo(() => groups.flatMap((g) => g.logs).slice(0, 5), [groups]);
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';

  const createTop = () =>
    createTopImage({
      sortLabel,
      scopeLabel:
        selected.length > 0
          ? `出演：${selected.map((id) => personById.get(id)?.name ?? '?').join('・')}`
          : `全 ${logs.length} 件から`,
      items: top5.map((l) => {
        const p = programById.get(l.programId);
        return {
          programName: p?.name ?? '（不明な番組）',
          station: p?.station ?? '',
          broadcastDate: l.broadcastDate,
          memo: l.memo,
          castNames: (appearancesByLog.get(l.id) ?? []).map((a) => personById.get(a.personId)?.name ?? '?'),
        };
      }),
    });

  const filtered = selected.length > 0;
  /** まだ1件も無い（はじめての状態） */
  const isEmpty = !loading && data.episodeLogs.length === 0;
  const scopeLabel = filtered ? `絞り込み中の ${logs.length} 件から抽選` : `全 ${logs.length} 件から抽選`;

  /** おまかせ1本：対象が2件以上なら直前と同じ回を除外して抽選 */
  const draw = () => {
    if (logs.length === 0) {
      toast(filtered ? '条件に合うリピート回がありません' : 'まずはリピート回を記録してください');
      return;
    }
    const pool = logs.length >= 2 ? logs.filter((l) => l.id !== lastPickedId.current) : logs;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastPickedId.current = pick.id;
    setPickedId(pick.id);
    setDrawCount((n) => n + 1);
  };
  const picked = pickedId ? data.episodeLogs.find((l) => l.id === pickedId) : undefined;

  return (
    <>
      <PageHeader
        title="リピート帳"
        kicker="REPEAT LOG"
        description="「また聴きたい！」と思った放送回の一覧です。"
        actions={
          <Link to="/guide" className="btn btn-small" aria-label="使い方ガイド">
            ？使い方
          </Link>
        }
      />
      {!isEmpty && <BackupReminder />}

      {!isEmpty && (
      <section className="filter-box" aria-label="出演者で絞り込み">
        <PersonPicker
          label="出演者で絞り込み（AND）"
          showFrequentOnFocus
          excludeIds={selected}
          onPick={(id) => setSelected([...selected, id])}
        />
        {selected.length > 0 && (
          <div className="chips">
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                className="chip is-selected"
                aria-label={`${personById.get(id)?.name} の絞り込みを解除`}
                onClick={() => setSelected(selected.filter((x) => x !== id))}
              >
                {personById.get(id)?.name} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="chip chip-clear" onClick={() => setSelected([])}>
              すべて解除
            </button>
          </div>
        )}
      </section>
      )}

      {!isEmpty && (
      <div className="list-meta">
        {loading ? '読み込み中…' : `${logs.length} 件${selected.length ? `（全 ${data.episodeLogs.length} 件中）` : ''}`}
      </div>
      )}

      {!loading && logs.length === 0 ? (
        data.episodeLogs.length === 0 ? (
          <section className="card welcome">
            <h2>はじめての方へ</h2>
            <p>また聴きたい放送回をストックするアプリです。3ステップで使えます。</p>
            <ol className="welcome-steps">
              <li className={data.programs.length > 0 ? 'is-done' : ''}>
                <strong>番組を登録</strong>（最初だけ）
              </li>
              <li>
                真ん中の赤い<strong>「＋ 回を追加」</strong>で、また聴きたい回を追加
              </li>
              <li>
                ここ<strong>「リピート帳」</strong>で見返す
              </li>
            </ol>
            {data.programs.length === 0 ? (
              <Link className="btn btn-primary btn-block" to="/programs/new">
                ① 番組を登録する
              </Link>
            ) : (
              <Link className="btn btn-primary btn-block" to="/logs/new">
                ② また聴きたい回を追加する
              </Link>
            )}
            <Link className="btn btn-block" to="/guide">
              使い方ガイドを見る
            </Link>
          </section>
        ) : (
          <EmptyState title="条件に合うリピート回がありません" />
        )
      ) : (
        <>
          <div className="sort-row">
          <div className="sort-bar" role="group" aria-label="並び順">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`sort-chip ${sort === s.key ? 'is-selected' : ''}`}
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
            <button
              type="button"
              className="btn btn-small top-share-btn"
              onClick={() => setSharingTop(true)}
            >
              📷 上位{top5.length}件をシェア
            </button>
          </div>
          {groups.map((g) => (
            <section key={g.key} className="log-group">
              {g.title && (
                <h2 className="group-title">
                  <Link to={`/programs/${g.key}`}>{g.title}</Link>
                  {g.sub && <span className="station-badge">{g.sub}</span>}
                  <span className="group-count">{g.logs.length} 回</span>
                </h2>
              )}
              <div className="card-list">
                {g.logs.map((l) => (
                  <LogCard key={l.id} log={l} hideProgram={sort === 'program'} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <div className="fab-spacer" aria-hidden="true" />

      {/* 片手で押しやすい右下の「おまかせ1本」 */}
      {!isEmpty && (
      <div className="random-fab-wrap">
        <button
          type="button"
          className={`random-fab ${logs.length === 0 ? 'is-disabled' : ''}`}
          aria-disabled={logs.length === 0}
          onClick={draw}
        >
          <span className="random-fab-main">🎲 おまかせ1本</span>
          <span className="random-fab-sub">{filtered ? `絞り込み中 ${logs.length}件から` : `全${logs.length}件から`}</span>
        </button>
      </div>
      )}

      {sharingTop && top5.length > 0 && (
        <ShareImageModal
          heading={`上位${top5.length}件のシェア画像`}
          title={`Radio Log また聴きたい回 TOP${top5.length}`}
          fileName={`radio-log-top${top5.length}-${todayLocal()}.png`}
          create={createTop}
          onClose={() => setSharingTop(false)}
        />
      )}

      {picked && (
        <RandomPickModal
          log={picked}
          drawCount={drawCount}
          scopeLabel={scopeLabel}
          canReroll={logs.length >= 2}
          onDetail={() => navigate(`/logs/${picked.id}`)}
          onReroll={draw}
          onClose={() => setPickedId(null)}
        />
      )}
    </>
  );
}
