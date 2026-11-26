import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { SharedItemView } from '../components/SharedItemView';
import { useUi } from '../components/UiProvider';
import { importSharedEpisodes } from '../db/repo';
import { decodeSharedList, parseSharedListText, type SharedItem, type SharedList } from '../lib/sharedList';
import { useData } from '../state/DataContext';
import { errorMessage, formatYmd, normalizeForSearch } from '../lib/util';

const MAX_FILE_BYTES = 300_000;

/**
 * S9：シェアされたリスト（★3）
 * 受け取ったリストを別枠で表示する。開いただけでは自分のリピート帳には何も入らない。
 * 「＋ 自分のリピート帳に入れる」を押した回だけ取り込む。
 */
export function SharedListPage() {
  const { token = '' } = useParams();
  const { data, reload } = useData();
  const { confirm, alert, toast } = useUi();
  const [list, setList] = useState<SharedList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(token));
  /** この画面で取り込んだ回（何件目か） */
  const [imported, setImported] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    decodeSharedList(token)
      .then((l) => alive && setList(l))
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  /** 自分のリピート帳に、同じ番組（名前で照合）・同じ放送日の回があるか */
  const duplicateOf = useMemo(() => {
    const key = (name: string, date: string) => `${normalizeForSearch(name)}\u0000${date}`;
    const programName = new Map(data.programs.map((p) => [p.id, p.name]));
    const mine = new Set(
      data.episodeLogs.filter((l) => l.broadcastDate).map((l) => key(programName.get(l.programId) ?? '', l.broadcastDate)),
    );
    return (it: SharedItem) => Boolean(it.broadcastDate) && mine.has(key(it.programName, it.broadcastDate));
  }, [data.programs, data.episodeLogs]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('ファイルが大きすぎます。');
      setList(parseSharedListText(await file.text()));
      setImported(new Set());
      setError('');
    } catch (err) {
      setList(null);
      setError(errorMessage(err));
    }
  };

  const doImport = async (indexes: number[]) => {
    if (!list || indexes.length === 0) return;
    setBusy(true);
    try {
      const res = await importSharedEpisodes(indexes.map((i) => list.items[i]));
      await reload();
      setImported((cur) => new Set([...cur, ...indexes]));
      const extra = [
        res.newPrograms.length ? `番組 ${res.newPrograms.length} 件` : '',
        res.newPersons.length ? `出演者 ${res.newPersons.length} 人` : '',
      ].filter(Boolean);
      toast(`${indexes.length}件をリピート帳に入れました${extra.length ? `（新しく登録：${extra.join('・')}）` : ''}`);
    } catch (err) {
      await alert('入れられませんでした', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const importOne = async (i: number) => {
    if (!list) return;
    const it = list.items[i];
    if (duplicateOf(it)) {
      const ok = await confirm({
        title: '同じ放送回が既に記録されています',
        message: `「${it.programName}」の ${formatYmd(it.broadcastDate)} の回は、あなたのリピート帳に既にあります。このまま入れますか？`,
        confirmLabel: 'このまま入れる',
      });
      if (!ok) return;
    }
    await doImport([i]);
  };

  const importAll = async () => {
    if (!list) return;
    const rest = list.items.map((_, i) => i).filter((i) => !imported.has(i));
    if (rest.length === 0) return;
    const dups = rest.filter((i) => duplicateOf(list.items[i]));
    let targets = rest;
    if (dups.length > 0) {
      const withDups = await confirm({
        title: '同じ放送回が既に記録されています',
        message: `${rest.length}件のうち ${dups.length}件は、同じ番組・同じ放送日の回が既にあります。重複も入れますか？`,
        confirmLabel: '重複も入れる',
        cancelLabel: '重複は入れない',
      });
      if (!withDups) targets = rest.filter((i) => !dups.includes(i));
    } else {
      const ok = await confirm({ title: `${rest.length}件をリピート帳に入れますか？`, confirmLabel: 'まとめて入れる' });
      if (!ok) return;
    }
    if (targets.length === 0) {
      toast('入れる回はありませんでした');
      return;
    }
    await doImport(targets);
  };

  const filePicker = (
    <>
      <input ref={fileRef} type="file" accept="application/json,.json,text/plain,.txt" hidden onChange={(e) => void onFile(e)} />
      <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
        📂 ファイルから開く
      </button>
    </>
  );

  if (loading) return <PageHeader title="読み込み中…" kicker="SHARED LIST" />;

  if (!list) {
    return (
      <>
        <PageHeader title="シェアされたリスト" kicker="SHARED LIST" description="友だちから送られてきた、また聴きたい回のリストを見る画面です。" />
        <EmptyState title={error ? 'このリストは読み込めません' : 'リストを開いてください'}>
          {error ? <p className="field-error shared-error">{error}</p> : <p>送られてきたリンクを開くか、「ファイルで送る」で受け取ったファイルを選んでください。</p>}
          {filePicker}
          <Link to="/" className="btn btn-small">
            ホームへ
          </Link>
        </EmptyState>
      </>
    );
  }

  const restCount = list.items.length - imported.size;

  return (
    <>
      <PageHeader
        title="シェアされたリスト"
        kicker="SHARED LIST"
        description={`送られてきた ${list.items.length} 件です。まだあなたのリピート帳には入っていません。気に入った回だけ入れられます。`}
      />
      <p className="assist-note shared-note">
        ※ 他の人が作ったリストです。リンクを開く前に、行き先（radiko・YouTube など）を確かめてください。番組と出演者は、あなたの登録済みの名前と照合して使います（なければ新しく登録）。
      </p>
      <div className="card-list shared-list">
        {list.items.map((it, i) => {
          const done = imported.has(i);
          const dup = duplicateOf(it);
          return (
            <SharedItemView key={i} item={it} openableLinks>
              {dup && !done && <p className="field-warn">同じ番組・同じ放送日の回がリピート帳にあります</p>}
              <button
                type="button"
                className={`btn btn-block ${done ? '' : 'btn-primary'} shared-import`}
                disabled={done || busy}
                onClick={() => void importOne(i)}
              >
                {done ? '✓ リピート帳に入れました' : '＋ 自分のリピート帳に入れる'}
              </button>
            </SharedItemView>
          );
        })}
      </div>
      <div className="form-actions sticky-bottom">
        {restCount > 0 ? (
          <button type="button" className="btn btn-primary btn-block btn-large" disabled={busy} onClick={() => void importAll()}>
            まとめて入れる（{restCount}件）
          </button>
        ) : (
          <Link to="/logs" className="btn btn-primary btn-block btn-large">
            リピート帳を見る
          </Link>
        )}
      </div>
      <div className="shared-footer">{filePicker}</div>
    </>
  );
}
