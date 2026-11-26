import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectErrors, createV1Database, disableShare, idbCount, idbGet, idbVersion, mockExternal, open, seed, type Seed } from './helpers';

/** スキーマ v2：リンク・日付なし・ラジオ以外（YouTube 等）・v1 からの移行と取り込み */

const uploadPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'radiolog-e2e-')), name);
const dateTexts = (page: Page) => page.locator('.log-card .date-badge').allInnerTexts();

test('日付なし＋リンク（radiko・YouTube）で追加 → 詳細から開ける・題名の自動入力', async ({ page, context }) => {
  const errors = collectErrors(page);
  const seen = await mockExternal(context);
  await seed(page, { programs: [{ id: 'A', name: '架空番組A', station: '架空放送' }] }, '/logs/new?programId=A');

  // 放送・配信日は任意：「日付なし」にできる
  await page.getByRole('button', { name: '日付なし' }).click();
  await expect(page.locator('#ldate')).toHaveValue('');
  await expect(page.getByText('日付なしで保存します')).toBeVisible();

  // リンク：radiko（期限の注意）と YouTube（題名を取得）
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク1の URL').fill('https://radiko.jp/#!/ts/XXX/20261120010000');
  await expect(page.locator('.link-row').nth(0).locator('.station-badge')).toHaveText('radiko');
  await expect(page.getByText('おおむね1週間で聴けなくなります')).toBeVisible();
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク2の URL').fill('youtu.be/abcdEFGH123'); // スキーム無しでも OK
  expect(seen.youtube).toEqual([]); // 押すまで送らない
  await page.getByRole('button', { name: '▶ YouTube から題名を取得' }).click();
  await expect(page.getByLabel('リンク2の表示名')).toHaveValue('架空動画 第12回 アーカイブ');
  expect(seen.youtube).toEqual(['https://youtu.be/abcdEFGH123']);

  await page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();
  await expect(page.getByRole('heading', { name: '日付なし' })).toBeVisible();
  const open1 = page.locator('a.link-open');
  await expect(open1).toHaveCount(2);
  await expect(open1.nth(0)).toHaveAttribute('href', 'https://radiko.jp/#!/ts/XXX/20261120010000');
  await expect(open1.nth(0)).toHaveAttribute('target', '_blank');
  await expect(open1.nth(0)).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(open1.nth(1)).toContainText('架空動画 第12回 アーカイブ');
  await expect(open1.nth(1)).toContainText('YouTube');
  await expect(page.locator('.detail-card')).toContainText('おおむね1週間で聴けなくなります');

  // 日付なしは何件追加しても重複確認は出ない
  await open(page, '/logs/new?programId=A');
  await page.getByRole('button', { name: '日付なし' }).click();
  await page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();
  await expect(page.getByRole('heading', { name: '日付なし' })).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);

  // 一覧のカードにリンクのサービス名
  await open(page, '/logs');
  await expect(page.locator('.log-card .link-badge')).toHaveText(['🔗 radiko・YouTube']);
  expect(errors).toEqual([]);
});

test('リンクは http(s) のみ（javascript: などは保存できない）・編集で削除できる', async ({ page }) => {
  await seed(
    page,
    {
      programs: [{ id: 'A', name: '架空番組A' }],
      logs: [{ id: 'l1', programId: 'A', date: '2026-11-01', links: [{ url: 'https://open.spotify.com/episode/xxxx' }] }],
    },
    '/logs/l1/edit',
  );
  await expect(page.getByLabel('リンク1の URL')).toHaveValue('https://open.spotify.com/episode/xxxx');
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク2の URL').fill('javascript:alert(1)');
  await expect(page.getByText('http:// か https:// で始まる URL を入力してください')).toBeVisible();
  await page.getByRole('button', { name: '更新する' }).click();
  await expect(page.getByRole('heading', { name: '保存できませんでした' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  expect((await idbGet<{ links: unknown[] }>(page, 'episodeLogs', 'l1'))?.links).toEqual([{ url: 'https://open.spotify.com/episode/xxxx' }]);

  // 不正な行と Spotify を消して保存 → リンクなし
  await page.getByRole('button', { name: 'リンク2を削除' }).click();
  await page.getByRole('button', { name: 'リンク1を削除' }).click();
  await page.getByRole('button', { name: '更新する' }).click();
  await expect(page.getByText('ON AIR')).toBeVisible();
  await expect(page.locator('a.link-open')).toHaveCount(0);
  expect((await idbGet<{ links: unknown[] }>(page, 'episodeLogs', 'l1'))?.links).toEqual([]);
});

const MIXED: Seed = {
  programs: [
    { id: 'A', name: 'あ行の架空番組' },
    { id: 'Z', name: 'わ行の架空番組' },
  ],
  logs: [
    { id: 'd1', programId: 'A', date: '2026-11-10', createdAt: '2026-11-11T00:00:00Z' },
    { id: 'n1', programId: 'Z', date: '', createdAt: '2026-11-20T00:00:00Z', memo: '日付なし・古い追加' },
    { id: 'd2', programId: 'Z', date: '2026-11-15', createdAt: '2026-11-16T00:00:00Z' },
    { id: 'n2', programId: 'A', date: '', createdAt: '2026-11-25T00:00:00Z', memo: '日付なし・新しい追加' },
  ],
};

test('日付なしの回は、新しい順・古い順のどちらでも最後に「日付なし」としてまとまる（追加した順）', async ({ page }) => {
  await seed(page, MIXED);
  await expect(page.locator('.sort-chip.is-selected')).toHaveText('新しい順');
  await expect.poll(() => dateTexts(page)).toEqual([expect.stringMatching(/2026\.11\.15/), expect.stringMatching(/2026\.11\.10/), '日付なし', '日付なし']);
  await expect(page.locator('.group-title')).toHaveText([/日付なし\s*2 回/]);
  await expect(page.locator('.log-card .log-card-memo')).toHaveText(['日付なし・新しい追加', '日付なし・古い追加']);

  await page.getByRole('button', { name: '古い順' }).click();
  await expect.poll(() => dateTexts(page)).toEqual([expect.stringMatching(/2026\.11\.10/), expect.stringMatching(/2026\.11\.15/), '日付なし', '日付なし']);
  await expect(page.locator('.log-card .log-card-memo')).toHaveText(['日付なし・新しい追加', '日付なし・古い追加']);

  // 番組ごと：各番組の中でも日付なしは最後
  await page.getByRole('button', { name: '番組ごと' }).click();
  await expect.poll(() => dateTexts(page)).toEqual([expect.stringMatching(/2026\.11\.10/), '日付なし', expect.stringMatching(/2026\.11\.15/), '日付なし']);

  // 詳細画面の見出しも「日付なし」
  await open(page, '/logs?sort=new');
  await page.locator('.log-card').nth(2).click();
  await expect(page.getByRole('heading', { name: '日付なし' })).toBeVisible();
});

test('シェア画像：日付なしの回も作れる（ファイル名 nodate）・上位件数にも含まれる', async ({ page }) => {
  await disableShare(page);
  await seed(page, MIXED, '/logs/n1');
  await page.getByRole('button', { name: 'シェア画像を作成' }).click();
  await page.locator('.share-preview img').waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '画像を保存（PNG）' }).click()]);
  expect(dl.suggestedFilename()).toBe('radio-log-nodate.png');
  await page.getByRole('button', { name: '閉じる' }).click();

  await open(page, '/logs');
  await page.getByRole('button', { name: '📷 上位4件をシェア' }).click();
  await page.locator('.share-preview img').waitFor();
});

test('YouTube：動画 URL からチャンネル名と配信元を入力（Podcast 候補は検索しない）・回の追加で番組を自動選択', async ({ page, context }) => {
  const errors = collectErrors(page);
  const seen = await mockExternal(context);
  await open(page, '/programs/new');
  await expect(page.getByText('番組・チャンネル名')).toBeVisible();
  await expect(page.getByText('放送局・配信元')).toBeVisible();
  await page.fill('#pname', 'https://www.youtube.com/watch?v=abcdEFGH123');
  await page.waitForTimeout(1000); // デバウンス待ち
  expect(seen.itunes).toEqual([]); // URL は Apple に送らない
  await page.getByRole('button', { name: '▶ この YouTube 動画のチャンネル名を入力' }).click();
  await expect(page.locator('#pname')).toHaveValue('架空チャンネル');
  await expect(page.locator('#pstation')).toHaveValue('YouTube');
  await expect(page.locator('.platform-chips .chip', { hasText: 'YouTube' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByRole('heading', { name: '架空チャンネル' })).toBeVisible();

  // 回の追加：番組を選ばずに YouTube の題名を取得 → 同じ名前の番組が選ばれる
  await open(page, '/programs/new');
  await page.fill('#pname', '架空のラジオ番組');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByRole('heading', { name: '架空のラジオ番組' })).toBeVisible();
  await open(page, '/logs/new');
  await expect(page.locator('#lprogram')).toHaveValue('');
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク1の URL').fill('https://www.youtube.com/live/abcdEFGH123');
  await page.getByRole('button', { name: '▶ YouTube から題名を取得' }).click();
  await expect(page.getByText('番組「架空チャンネル」を選びました')).toBeVisible();
  await expect(page.locator('#lprogram')).toHaveValue('架空チャンネル');
  await expect(page.locator('.program-picked-tag')).toHaveText('登録済み');

  // 取得できない動画はメッセージを出して手入力に任せる
  await page.getByLabel('リンク1の URL').fill('https://www.youtube.com/watch?v=PRIVATE0001');
  await page.getByRole('button', { name: '▶ YouTube から題名を取得' }).click();
  await expect(page.getByText('この動画は情報を取得できません')).toBeVisible();
  expect(errors).toEqual([]);
});

test('配信元チップ（YouTube など）はいつも表示され、ワンタップで選べる', async ({ page }) => {
  await open(page, '/programs/new');
  for (const name of ['YouTube', 'Podcast', 'Spotify', 'Voicy', 'stand.fm']) {
    await expect(page.locator('.platform-chips .chip', { hasText: name })).toBeVisible();
  }
  await page.locator('.platform-chips .chip', { hasText: 'Voicy' }).click();
  await expect(page.locator('#pstation')).toHaveValue('Voicy');
});

test('v1 のデータベースは v2 に自動移行され、既存の回はそのまま使える', async ({ page }) => {
  const errors = collectErrors(page);
  await createV1Database(page, {
    persons: [{ id: 'p1', name: '架空甲' }],
    programs: [{ id: 'A', name: '架空番組A', station: '文化放送' }],
    logs: [{ id: 'old1', programId: 'A', date: '2026-10-01', memo: 'v1 のころの記録' }],
  });
  expect(await idbVersion(page)).toBe(1);
  await open(page, '/logs');
  await expect(page.locator('.log-card')).toHaveCount(1);
  await expect(page.locator('.log-card-memo')).toHaveText('v1 のころの記録');
  expect(await idbVersion(page)).toBe(2);
  expect(await idbGet(page, 'episodeLogs', 'old1')).toMatchObject({ broadcastDate: '2026-10-01', links: [], memo: 'v1 のころの記録' });

  // 移行後の回にリンクを足して保存できる
  await open(page, '/logs/old1/edit');
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク1の URL').fill('https://podcasts.apple.com/jp/podcast/xxxx');
  await page.getByRole('button', { name: '更新する' }).click();
  await expect(page.locator('a.link-open')).toHaveText([/Apple Podcasts/]);
  expect(errors).toEqual([]);
});

test('バックアップ：v1 形式（リンクなし）と v2 形式（リンク・日付なし）の両方を取り込める・不正なリンクは拒否', async ({ page }) => {
  await seed(page, { programs: [{ id: 'X', name: '消える架空番組' }] }, '/data');
  const t = '2026-01-01T00:00:00.000Z';
  const base = {
    appName: 'radio-log',
    exportedAt: t,
    persons: [{ id: 'p1', name: '架空甲', aliases: [], createdAt: t, updatedAt: t }],
    programs: [{ id: 'A', name: '架空番組A', station: '', defaultPersonIds: ['p1'], createdAt: t, updatedAt: t }],
    episodeAppearances: [{ id: 'a1', episodeLogId: 'l1', personId: 'p1', role: 'regular', sortOrder: 0 }],
  };
  const importFile = async (obj: unknown, name: string) => {
    const path = uploadPath(name);
    writeFileSync(path, JSON.stringify(obj));
    await open(page, '/data');
    await page.locator('input[type=file]').setInputFiles(path);
  };

  // v1：links が無く、放送日は必須
  await importFile(
    { ...base, schemaVersion: 1, episodeLogs: [{ id: 'l1', programId: 'A', broadcastDate: '2026-11-01', memo: '', createdAt: t, updatedAt: t }] },
    'v1.json',
  );
  await page.getByRole('button', { name: '消去して置き換える' }).click();
  await expect(page.getByText('インポートが完了しました')).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  expect(await idbGet(page, 'episodeLogs', 'l1')).toMatchObject({ links: [] });
  expect(await idbCount(page, 'programs')).toBe(1);

  // v1 で日付なしは不正（v2 から）
  await importFile(
    { ...base, schemaVersion: 1, episodeLogs: [{ id: 'l1', programId: 'A', broadcastDate: '', memo: '', createdAt: t, updatedAt: t }] },
    'v1-bad.json',
  );
  await expect(page.locator('.modal-body')).toContainText('broadcastDate');
  await page.getByRole('button', { name: 'OK' }).click();

  // v2：日付なし＋リンク
  const v2Logs = [
    {
      id: 'l1',
      programId: 'A',
      broadcastDate: '',
      memo: '',
      links: [{ url: 'https://www.youtube.com/watch?v=abcdEFGH123', label: '架空動画' }, { url: 'https://radiko.jp/#!/ts/XXX/1' }],
      createdAt: t,
      updatedAt: t,
    },
  ];
  await importFile({ ...base, schemaVersion: 2, episodeLogs: v2Logs }, 'v2.json');
  await page.getByRole('button', { name: '消去して置き換える' }).click();
  await expect(page.getByText('インポートが完了しました')).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await open(page, '/logs/l1');
  await expect(page.getByRole('heading', { name: '日付なし' })).toBeVisible();
  await expect(page.locator('a.link-open')).toHaveText([/架空動画/, /radiko/]);

  // 不正なリンク（javascript:）・未来の形式は拒否され、データは変わらない
  await importFile({ ...base, schemaVersion: 2, episodeLogs: [{ ...v2Logs[0], links: [{ url: 'javascript:alert(1)' }] }] }, 'bad-link.json');
  await expect(page.locator('.modal-body')).toContainText('http(s) の URL ではありません');
  await page.getByRole('button', { name: 'OK' }).click();
  await importFile({ ...base, schemaVersion: 3, episodeLogs: v2Logs }, 'future.json');
  await expect(page.locator('.modal-body')).toContainText('新しい形式');
  await page.getByRole('button', { name: 'OK' }).click();
  expect(await idbGet(page, 'episodeLogs', 'l1')).toMatchObject({ broadcastDate: '' });
});
