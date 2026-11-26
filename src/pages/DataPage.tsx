import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { ThemePicker } from '../components/ThemePicker';
import { useUi } from '../components/UiProvider';
import { appUrl, BackupValidationError, validateBackup } from '../db/backup';
import { replaceAllData } from '../db/repo';
import { canShareFiles, downloadBackup, getLastBackupAt, shareBackup } from '../lib/backupActions';
import { useData } from '../state/DataContext';
import { errorMessage } from '../lib/util';

type PersistState = 'unknown' | 'persisted' | 'not-persisted' | 'unsupported';

/** S7：データ管理 */
export function DataPage() {
  const { data, reload } = useData();
  const { confirm, alert, toast } = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [persist, setPersist] = useState<PersistState>('unknown');

  useEffect(() => {
    const s = navigator.storage;
    if (!s?.persisted) {
      setPersist('unsupported');
      return;
    }
    s.persisted()
      .then((v) => setPersist(v ? 'persisted' : 'not-persisted'))
      .catch(() => setPersist('unsupported'));
  }, []);

  const [lastBackup, setLastBackup] = useState<Date | null>(() => getLastBackupAt());
  const shareable = canShareFiles();

  const onShare = async () => {
    try {
      const r = await shareBackup(data);
      if (r === 'cancelled') return;
      setLastBackup(getLastBackupAt());
      toast(r === 'shared' ? 'バックアップを送りました' : 'バックアップを保存しました');
    } catch (err) {
      await alert('バックアップできませんでした', errorMessage(err));
    }
  };

  const onExport = () => {
    try {
      downloadBackup(data);
      setLastBackup(getLastBackupAt());
      toast('バックアップを保存しました');
    } catch (err) {
      void alert('バックアップできませんでした', errorMessage(err));
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを再選択できるように
    if (!file) return;
    setBusy(true);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error('JSONとして読み込めませんでした。ファイルが壊れていないか確認してください。');
      }
      const { data: incoming, meta } = validateBackup(json);
      const ok = await confirm({
        title: '現在のデータを置き換えます',
        danger: true,
        confirmLabel: '消去して置き換える',
        message: (
          <div className="usage">
            <p>
              <strong>この端末の現在のデータはすべて消去され</strong>、選択したファイルの内容に置き換わります。元に戻せません。
            </p>
            <p>必要なら先に「エクスポート」で現在のデータを保存してください。</p>
            <table className="compare-table">
              <thead>
                <tr>
                  <th />
                  <th>現在</th>
                  <th>ファイル</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>番組</th>
                  <td>{data.programs.length}</td>
                  <td>{incoming.programs.length}</td>
                </tr>
                <tr>
                  <th>人物</th>
                  <td>{data.persons.length}</td>
                  <td>{incoming.persons.length}</td>
                </tr>
                <tr>
                  <th>リピート回</th>
                  <td>{data.episodeLogs.length}</td>
                  <td>{incoming.episodeLogs.length}</td>
                </tr>
              </tbody>
            </table>
            {meta.exportedAt && <p className="muted">ファイルの作成日時：{new Date(meta.exportedAt).toLocaleString('ja-JP')}</p>}
          </div>
        ),
      });
      if (!ok) return;
      // 1トランザクションで消去＋投入。途中で失敗した場合は自動的にロールバックされ元データが残る
      await replaceAllData(incoming);
      await reload();
      await alert('インポートが完了しました', `番組 ${incoming.programs.length} 件・人物 ${incoming.persons.length} 件・リピート回 ${incoming.episodeLogs.length} 件を読み込みました。`);
    } catch (err) {
      if (err instanceof BackupValidationError) {
        await alert('インポートできません', <pre className="pre-wrap">{err.message}</pre>);
      } else {
        await alert('インポートに失敗しました', `${errorMessage(err)}\n（データは変更されていません）`);
      }
    } finally {
      setBusy(false);
    }
  };

  const requestPersist = async () => {
    try {
      const granted = (await navigator.storage?.persist?.()) ?? false;
      setPersist(granted ? 'persisted' : 'not-persisted');
      toast(granted ? '永続化が許可されました' : 'ブラウザにより永続化が許可されませんでした');
    } catch {
      setPersist('unsupported');
    }
  };

  return (
    <>
      <PageHeader title="データのバックアップ" kicker="BACKUP" back description="記録を外に保管したり、保管したファイルから戻したりできます。" />


      <section className="card stats-card" aria-label="保存件数">
        <div className="stat">
          <span className="stat-num">{data.programs.length}</span>
          <span className="stat-label">番組</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.persons.length}</span>
          <span className="stat-label">人物</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.episodeLogs.length}</span>
          <span className="stat-label">リピート回</span>
        </div>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">バックアップ（エクスポート）</h2>
        <p className="muted">
          全データを1つのファイルにします。<strong>「送る」</strong>を押すと共有画面が開くので、Gmail（自分宛て）・LINE の Keep メモ・Google ドライブ・iCloud の「ファイル」などを選ぶと、スマホの外に保管できます。
        </p>
        <p className="muted">送るときの本文には、このアプリの URL と復元のしかたも入ります（機種変更したとき用）。</p>
        <div className="app-url-row">
          <span className="app-url-label">アプリの URL</span>
          <code className="app-url">{appUrl()}</code>
          <button
            type="button"
            className="btn btn-small"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(appUrl())
                .then(() => toast('URL をコピーしました'))
                .catch(() => toast('コピーできませんでした。長押しでコピーしてください'))
            }
          >
            コピー
          </button>
        </div>
        <p className="backup-last">
          最後のバックアップ：<strong>{lastBackup ? lastBackup.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : 'まだありません'}</strong>
        </p>
        {shareable && (
          <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void onShare()} disabled={busy}>
            📤 バックアップを送る
          </button>
        )}
        <button
          type="button"
          className={`btn btn-block ${shareable ? '' : 'btn-primary btn-large'}`}
          onClick={onExport}
          disabled={busy}
        >
          この端末にファイルを保存
        </button>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">バックアップから復元（インポート）</h2>
        <p className="muted">
          バックアップしたファイル（.json または .txt）を読み込み、<strong>現在のデータを消去して置き換え</strong>ます。
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json,text/plain,.txt" hidden onChange={(e) => void onFile(e)} />
        <button type="button" className="btn btn-danger-outline btn-block" onClick={() => fileRef.current?.click()} disabled={busy}>
          バックアップファイルを選択
        </button>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">見た目</h2>
        <p className="muted">夜（ダーク）と昼（ライト）を選べます。ホームの右上の ☀️／🌙 でも切り替えられます。</p>
        <ThemePicker />
      </section>

      <section className="card section-card">
        <h2 className="section-title small">シェアされたリスト</h2>
        <p className="muted">
          友だちから「ファイルで送る」で受け取ったリスト（.json / .txt）はここから開けます。リンクで受け取った場合は、そのリンクを開くだけです。開いただけではリピート帳に入りません。
        </p>
        <Link to="/shared" className="btn btn-block">
          📂 受け取ったリストを開く
        </Link>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">保存について</h2>
        <p className="muted">
          データはこの端末のブラウザ内（IndexedDB）にのみ保存され、外部へは送信されません。ブラウザのデータ削除や機種変更で消えるため、ときどきバックアップしてください（14日たつとホームでお知らせします）。ホーム画面に追加して使うと、Safari の履歴削除の影響を受けにくくなります。
        </p>
        <p className="muted">
          番組登録で番組名を入力したとき（候補表示のため）と、出演者の「Wikipediaで候補を検索」を押したときだけ、検索語が Apple（Apple Podcasts の検索）または Wikipedia に送信されます。「YouTube から題名を取得」を押したときは、貼った URL だけが YouTube に送信されます。記録したデータが送られることはありません（リスト共有のリンクは、あなたが選んだ回の内容をリンク自体に入れて送ります。サーバーには保存されません）。
        </p>
        <p>
          ストレージ永続化：
          <strong>
            {persist === 'persisted' && '有効'}
            {persist === 'not-persisted' && '未許可'}
            {persist === 'unsupported' && '非対応'}
            {persist === 'unknown' && '確認中…'}
          </strong>
        </p>
        {persist === 'not-persisted' && (
          <button type="button" className="btn btn-block" onClick={() => void requestPersist()}>
            永続化をリクエスト
          </button>
        )}
      </section>
      <p className="app-version">Radio Log v{__APP_VERSION__}</p>
    </>
  );
}
