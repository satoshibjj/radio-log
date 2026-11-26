import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { useUi } from '../components/UiProvider';
import { BackupValidationError, backupFileName, buildBackup, downloadJson, validateBackup } from '../db/backup';
import { loadSnapshot, replaceAllData } from '../db/repo';
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

  const onExport = async () => {
    setBusy(true);
    try {
      // 画面のキャッシュではなく DB から直接読み出して出力
      const snap = await loadSnapshot();
      downloadJson(buildBackup(snap), backupFileName());
      toast('エクスポートしました');
    } catch (err) {
      await alert('エクスポートできませんでした', errorMessage(err));
    } finally {
      setBusy(false);
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
      <PageHeader title="データ管理" kicker="BACKUP" />

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
        <h2 className="section-title small">エクスポート</h2>
        <p className="muted">全データをJSONファイルに保存します。機種変更やバックアップに使えます。</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void onExport()} disabled={busy}>
          JSONをダウンロード
        </button>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">インポート（置き換え）</h2>
        <p className="muted">
          エクスポートしたJSONを読み込み、<strong>現在のデータを消去して置き換え</strong>ます。
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e)} />
        <button type="button" className="btn btn-danger-outline btn-block" onClick={() => fileRef.current?.click()} disabled={busy}>
          JSONファイルを選択
        </button>
      </section>

      <section className="card section-card">
        <h2 className="section-title small">保存について</h2>
        <p className="muted">
          データはこの端末のブラウザ内（IndexedDB）にのみ保存され、外部へは送信されません。ブラウザのデータ削除で消えるため、定期的なエクスポートをおすすめします。
        </p>
        <p className="muted">
          番組登録・人物追加の「検索」ボタンを押したときだけ、入力した検索語が Apple（iTunes Search API）または Wikipedia に送信されます。記録したデータが送られることはありません。
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
