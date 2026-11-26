import { expect, test } from '@playwright/test';
import { collectErrors, idbCount, mockExternal, open, seed, type Seed } from './helpers';

/** 回の追加の「番組・チャンネル」欄：登録済みから選ぶ／打って候補（登録済み・Apple Podcasts）から選ぶ／候補なしでそのまま手入力 */

const DATA: Seed = {
  persons: [{ id: 'p1', name: '架空甲' }],
  programs: [
    { id: 'A', name: '架空番組A', station: '架空放送', defaultPersonIds: ['p1'] },
    { id: 'B', name: 'ＡＢＣ架空ラジオ' },
  ],
};
const save = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();

test('登録済みの番組から選ぶ（タップで一覧・いつもの出演者が入る・Podcast は検索しない）', async ({ page, context }) => {
  const errors = collectErrors(page);
  const seen = await mockExternal(context);
  await seed(page, DATA, '/logs/new');
  await expect(page.locator('#lprogram')).toHaveValue('');
  await page.locator('#lprogram').click();
  await expect(page.locator('.program-suggest .suggest-head')).toHaveText(['登録済みの番組（タップで選ぶ）']);
  await expect(page.locator('.program-suggest .suggest-item')).toHaveCount(2);
  await page.locator('.program-suggest .suggest-item', { hasText: '架空番組A' }).click();
  await expect(page.locator('#lprogram')).toHaveValue('架空番組A');
  await expect(page.locator('.program-suggest')).toHaveCount(0);
  await expect(page.locator('.program-picked-tag')).toHaveText('登録済み');
  await expect(page.locator('.person-row-name')).toHaveText(['架空甲']);
  await expect(page.locator('.new-program-box')).toHaveCount(0);
  await save(page);
  await expect(page.locator('.detail-program-name')).toHaveText('架空番組A');
  expect(await idbCount(page, 'programs')).toBe(2);
  expect(seen.itunes).toEqual([]);
  expect(errors).toEqual([]);
});

test('打って候補から選ぶ：登録済み（表記ゆれも）と Apple Podcasts の候補 → 新しい番組として一緒に登録', async ({ page, context }) => {
  const errors = collectErrors(page);
  const seen = await mockExternal(context);
  await seed(page, DATA, '/logs/new');

  // 登録済み：途中まで打つと候補、全角半角が違っても同じ番組になる
  await page.fill('#lprogram', 'abc');
  await expect(page.locator('.program-suggest .suggest-item', { hasText: 'ＡＢＣ架空ラジオ' })).toBeVisible();
  await page.fill('#lprogram', 'ABC架空ラジオ');
  await expect(page.locator('.program-picked-tag')).toHaveText('登録済み');

  // Apple Podcasts の候補
  await page.fill('#lprogram', 'サンプル');
  await expect(page.getByText('Apple Podcasts の候補（タップで入力）')).toBeVisible();
  await page.locator('.program-suggest .suggest-item', { hasText: 'サンプル深夜便' }).first().click();
  expect(seen.itunes).toContain('サンプル');
  await expect(page.locator('#lprogram')).toHaveValue('サンプル深夜便');
  await expect(page.locator('.program-picked.is-new')).toContainText('新しい番組');
  await expect(page.locator('#lstation')).toHaveValue('TBSラジオ'); // 提供者名から放送局を推定
  await save(page);
  await expect(page.getByText('番組「サンプル深夜便」も登録')).toBeVisible();
  await expect(page.locator('.detail-program-name')).toHaveText('サンプル深夜便');
  await expect(page.locator('.detail-program .station-badge')).toHaveText('TBSラジオ');
  expect(await idbCount(page, 'programs')).toBe(3);

  // 次からは登録済みとして選べる
  await open(page, '/logs/new');
  await expect(page.locator('.recent-chips .chip')).toHaveText(['サンプル深夜便']);
  expect(errors).toEqual([]);
});

test('候補がなくてもそのまま手入力で追加でき、番組もできる（番組が1件もなくても OK）', async ({ page, context }) => {
  const errors = collectErrors(page);
  await mockExternal(context);
  await open(page, '/');
  await page.getByRole('link', { name: '＋ また聴きたい回を追加' }).click();
  await expect(page.locator('#lprogram')).toBeVisible();

  // 空のまま保存 → エラー
  await save(page);
  await expect(page.getByText('番組を選ぶか、番組名を入力してください')).toBeVisible();

  await page.fill('#lprogram', '  架空の手入力番組  ');
  await page.getByRole('button', { name: '＋「架空の手入力番組」を新しい番組として入れる' }).click();
  await expect(page.locator('.program-picked.is-new')).toContainText('保存するときに番組としても登録されます');
  await page.locator('.new-program-box .chip', { hasText: '文化放送' }).click();
  await expect(page.locator('#lstation')).toHaveValue('文化放送');
  await save(page);
  await expect(page.locator('.detail-program-name')).toHaveText('架空の手入力番組');
  await expect(page.locator('.detail-program .station-badge')).toHaveText('文化放送');
  expect(await idbCount(page, 'programs')).toBe(1);
  expect(await idbCount(page, 'episodeLogs')).toBe(1);

  // 同じ名前を手入力すると登録済みの番組を使う（番組は増えない）・同じ日なら確認
  await open(page, '/logs/new');
  await page.fill('#lprogram', '架空の手入力番組');
  await expect(page.locator('.program-picked-tag')).toHaveText('登録済み');
  await save(page);
  await expect(page.getByText('同じ放送回が既に記録されています')).toBeVisible();
  await page.getByRole('button', { name: 'このまま登録' }).click();
  await expect(page.getByText('ON AIR')).toBeVisible();
  expect(await idbCount(page, 'programs')).toBe(1);

  // URL は番組名にできない
  await open(page, '/logs/new');
  await page.fill('#lprogram', 'https://example.com/');
  await page.locator('#lprogram').press('Enter');
  await save(page);
  await expect(page.getByText('番組名に URL が入っています')).toBeVisible();
  expect(errors).toEqual([]);
});

test('YouTube の題名取得：番組が未登録ならチャンネル名を新しい番組として入れる', async ({ page, context }) => {
  await mockExternal(context);
  await seed(page, {}, '/logs/new');
  await page.getByRole('button', { name: '＋ リンクを追加' }).click();
  await page.getByLabel('リンク1の URL').fill('https://youtu.be/abcdEFGH123');
  await page.getByRole('button', { name: '▶ YouTube から題名を取得' }).click();
  await expect(page.locator('#lprogram')).toHaveValue('架空チャンネル');
  await expect(page.locator('#lstation')).toHaveValue('YouTube');
  await save(page);
  await expect(page.locator('.detail-program-name')).toHaveText('架空チャンネル');
  expect(await idbCount(page, 'programs')).toBe(1);
});
