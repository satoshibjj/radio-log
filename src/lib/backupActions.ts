/**
 * バックアップの「送る（共有）」「保存（ダウンロード）」と、最終バックアップ日時の管理。
 * 共有はスマホの共有シート（Web Share API）を使う：Gmail・LINE Keep・Google ドライブ・iCloud「ファイル」などへ。
 */
import { backupFileName, backupShareText, buildBackup } from '../db/backup';
import type { DataSnapshot } from '../db/types';

const KEY_LAST = 'radiolog.lastBackupAt';
const KEY_SNOOZE = 'radiolog.backupSnoozeUntil';
/** この日数を過ぎたらリマインド */
export const BACKUP_REMIND_DAYS = 14;
const SNOOZE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* プライベートモード等では保存しない */
  }
}

export function getLastBackupAt(): Date | null {
  const v = lsGet(KEY_LAST);
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function markBackedUp(): void {
  lsSet(KEY_LAST, new Date().toISOString());
}

export function snoozeBackupReminder(): void {
  lsSet(KEY_SNOOZE, new Date(Date.now() + SNOOZE_DAYS * DAY).toISOString());
}

/** リマインドを出すべきか（記録が1件以上あり、未バックアップ or 14日以上経過、かつスヌーズ中でない） */
export function backupReminder(logCount: number, now = Date.now()): { due: boolean; daysSince: number | null } {
  const last = getLastBackupAt();
  const daysSince = last ? Math.floor((now - last.getTime()) / DAY) : null;
  if (logCount === 0) return { due: false, daysSince };
  const snooze = lsGet(KEY_SNOOZE);
  if (snooze && new Date(snooze).getTime() > now) return { due: false, daysSince };
  return { due: daysSince === null || daysSince >= BACKUP_REMIND_DAYS, daysSince };
}

function download(text: string, fileName: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type BackupResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * バックアップを送る（共有シート）。共有できない環境ではダウンロードにフォールバック。
 * ※ ユーザー操作の直後に同期的に share() を呼ぶため、画面が持っているデータから作る。
 */
export async function shareBackup(data: DataSnapshot): Promise<BackupResult> {
  const text = JSON.stringify(buildBackup(data), null, 2);
  const jsonName = backupFileName();
  // Android Chrome は .json の共有を許可しないため .txt（中身は同じ JSON）でも試す
  const candidates = [
    new File([text], jsonName, { type: 'application/json' }),
    new File([text], jsonName.replace(/\.json$/, '.txt'), { type: 'text/plain' }),
  ];
  const file = typeof navigator.share === 'function' ? candidates.find((f) => navigator.canShare?.({ files: [f] })) : undefined;
  if (file) {
    try {
      // 本文にアプリの URL と復元のしかたを入れる（機種変更したときに、どこで復元するか分かるように）
      await navigator.share({ files: [file], title: 'Radio Log バックアップ', text: backupShareText() });
      markBackedUp();
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // NotAllowedError 等は保存にフォールバック
    }
  }
  download(text, jsonName, 'application/json');
  markBackedUp();
  return 'downloaded';
}

/** この端末にファイルとして保存 */
export function downloadBackup(data: DataSnapshot): void {
  download(JSON.stringify(buildBackup(data), null, 2), backupFileName(), 'application/json');
  markBackedUp();
}

export function canShareFiles(): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return [
      new File(['{}'], 'a.json', { type: 'application/json' }),
      new File(['{}'], 'a.txt', { type: 'text/plain' }),
    ].some((f) => navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}
