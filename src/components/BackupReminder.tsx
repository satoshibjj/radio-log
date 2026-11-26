import { useState } from 'react';
import { useData } from '../state/DataContext';
import { useUi } from './UiProvider';
import { backupReminder, shareBackup, snoozeBackupReminder } from '../lib/backupActions';
import { errorMessage } from '../lib/util';

/** リピート帳の上に出す「バックアップしましょう」バナー */
export function BackupReminder() {
  const { data } = useData();
  const { toast } = useUi();
  const [hidden, setHidden] = useState(false);
  const { due, daysSince } = backupReminder(data.episodeLogs.length);
  if (hidden || !due) return null;

  const run = async () => {
    try {
      const r = await shareBackup(data);
      if (r === 'cancelled') return;
      toast(r === 'shared' ? 'バックアップを送りました' : 'バックアップを保存しました');
      setHidden(true);
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  return (
    <div className="backup-reminder" role="status">
      <div className="backup-reminder-text">
        <strong>{daysSince === null ? 'まだバックアップしていません' : `最後のバックアップから${daysSince}日`}</strong>
        <span>機種変更やブラウザのデータ削除で消えないよう、保存しておきましょう。</span>
      </div>
      <div className="backup-reminder-actions">
        <button type="button" className="btn btn-small btn-primary" onClick={() => void run()}>
          今すぐバックアップ
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            snoozeBackupReminder();
            setHidden(true);
          }}
        >
          あとで
        </button>
      </div>
    </div>
  );
}
