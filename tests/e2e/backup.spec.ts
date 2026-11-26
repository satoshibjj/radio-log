import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disableShare, idbCount, mockShare, open, seed, sharedFiles, type Seed } from './helpers';

/** アップロード用ファイルは ASCII だけのパスに置く（日本語を含むパスだとブラウザが読めないことがある） */
const uploadPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'radiolog-e2e-')), name);

const DATA: Seed = {
  persons: [{ id: 'p1', name: '架空甲' }],
  programs: [{ id: 'A', name: '架空番組A' }],
  logs: [
    { id: 'l1', programId: 'A', date: '2026-11-01', cast: [['p1', 'regular']] },
    { id: 'l2', programId: 'A', date: '2026-11-08' },
  ],
};

test('保存（ダウンロード）→ 不正ファイルは拒否 → 置き換え復元', async ({ page }, info) => {
  await disableShare(page);
  await seed(page, DATA, '/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'この端末にファイルを保存' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^radio-log-backup-\d{8}-\d{6}\.json$/);
  const path = info.outputPath('backup.json');
  await dl.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json).toMatchObject({ appName: 'radio-log', schemaVersion: 2 });
  expect(json.episodeLogs[0].links).toEqual([]);
  expect(json.episodeLogs).toHaveLength(2);
  expect(json.episodeAppearances).toHaveLength(1);

  // 不正（存在しない人物を参照）→ 拒否・データ不変
  const bad = structuredClone(json);
  bad.episodeAppearances[0].personId = 'missing';
  const badPath = uploadPath('bad.json');
  writeFileSync(badPath, JSON.stringify(bad));
  await page.locator('input[type=file]').setInputFiles(badPath);
  await expect(page.getByText('インポートできません')).toBeVisible();
  await expect(page.locator('.modal-body')).toContainText('存在しない人物');
  await page.getByRole('button', { name: 'OK' }).click();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);

  // 1件消してから .txt で復元 → 元に戻る
  await open(page, '/logs/l2');
  await page.getByRole('button', { name: '削除する' }).click();
  await page.locator('.modal').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('リピート回を削除しました')).toBeVisible();
  const txtPath = uploadPath('backup.txt');
  writeFileSync(txtPath, JSON.stringify(json));
  await open(page, '/data');
  await page.locator('input[type=file]').setInputFiles(txtPath);
  await expect(page.getByText('現在のデータを置き換えます')).toBeVisible();
  await page.getByRole('button', { name: '消去して置き換える' }).click();
  await expect(page.getByText('インポートが完了しました')).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);
});

test('バックアップを送る：共有シート、Android は .txt にフォールバック', async ({ page }) => {
  await mockShare(page, { txtOnly: true });
  await seed(page, DATA, '/data');
  await page.getByRole('button', { name: /バックアップを送る/ }).click();
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  const [f] = await sharedFiles(page);
  expect(f.name).toMatch(/\.txt$/);
  expect(f.type).toBe('text/plain');
  expect(JSON.parse(f.text ?? '{}').episodeLogs).toHaveLength(2);
  await expect(page.getByText('まだありません')).toHaveCount(0); // 最終バックアップ日時が入る
});

test('ホームのお知らせ：未バックアップ → 送る → 14日後に再表示 → あとで', async ({ page }) => {
  await mockShare(page);
  await seed(page, DATA, '/');
  await expect(page.getByText('まだバックアップしていません')).toBeVisible();
  await page.getByRole('button', { name: '今すぐバックアップ' }).click();
  await expect(page.getByText('バックアップを送りました')).toBeVisible();
  await expect(page.locator('.backup-reminder')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('radiolog.lastBackupAt', new Date(Date.now() - 15 * 864e5).toISOString()));
  await page.reload();
  await expect(page.getByText('最後のバックアップから15日')).toBeVisible();
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.reload();
  await expect(page.locator('.home-stats')).toBeVisible();
  await expect(page.locator('.backup-reminder')).toHaveCount(0);
});
