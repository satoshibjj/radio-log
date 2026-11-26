import { expect, test } from '@playwright/test';
import { collectErrors, mockExternal, open, seed } from './helpers';

test('番組名を入力するとPodcast候補が自動で出る（デバウンス・キャッシュ・放送局推定）', async ({ page, context }) => {
  const seen = await mockExternal(context);
  await open(page, '/programs/new');
  await page.fill('#pname', 'サ');
  await page.waitForTimeout(1000);
  expect(seen.itunes).toEqual([]); // 1文字では検索しない
  await page.locator('#pname').pressSequentially('ンプル', { delay: 60 });
  await page.locator('.name-suggest .suggest-item').first().waitFor();
  expect(seen.itunes).toEqual(['サンプル']); // 打ち終わってから1回だけ
  await expect(page.locator('.name-suggest')).toContainText('Spotify 独占');
  await page.locator('.name-suggest .suggest-item', { hasText: 'サンプル深夜便' }).first().click();
  await expect(page.locator('#pname')).toHaveValue('サンプル深夜便');
  await expect(page.locator('#pstation')).toHaveValue('TBSラジオ');
  await expect(page.locator('.name-suggest')).toHaveCount(0);

  await page.fill('#pname', 'サンプル');
  await page.locator('.name-suggest .suggest-item').first().waitFor();
  expect(seen.itunes).toHaveLength(1); // 同じ語はキャッシュ
});

test('編集画面を開いただけでは検索しない・同名番組の警告・オフライン表示', async ({ page, context }) => {
  const seen = await mockExternal(context);
  await seed(page, { programs: [{ id: 'A', name: '架空番組A' }] }, '/programs/A/edit');
  await page.waitForTimeout(1200);
  expect(seen.itunes).toEqual([]);
  await open(page, '/programs/new');
  await page.fill('#pname', '架空番組A');
  await expect(page.getByText('「架空番組A」は登録済みです')).toBeVisible();
  await context.setOffline(true);
  await page.fill('#pname', '架空オフライン');
  await expect(page.getByText('オフラインのため検索できません')).toBeVisible();
  await context.setOffline(false);
});

test('放送局チップでワンタップ選択', async ({ page }) => {
  await open(page, '/programs/new');
  await page.locator('.station-chips .chip', { hasText: '文化放送' }).click();
  await expect(page.locator('#pstation')).toHaveValue('文化放送');
  await page.locator('.station-chips .chip', { hasText: '文化放送' }).click();
  await expect(page.locator('#pstation')).toHaveValue('');
  await page.locator('.station-chips .chip', { hasText: 'もっと見る' }).click();
  await expect(page.locator('.station-chips .chip', { hasText: 'Podcast' })).toBeVisible();
});

test('Wikipediaの人名候補（押した時だけ・Api-User-Agent付き・括弧除去）', async ({ page, context }) => {
  const errors = collectErrors(page);
  const seen = await mockExternal(context);
  await open(page, '/programs/new');
  await page.locator('.person-editor .picker input').fill('架空花子');
  await page.waitForTimeout(500);
  expect(seen.wiki).toEqual([]);
  await page.getByText('📖 Wikipediaで「架空花子」の候補を検索').click();
  await expect(page.locator('.wiki-block .suggest-item')).toHaveCount(2); // 曖昧さ回避ページは除外
  expect(seen.wiki[0].ua).toMatch(/^RadioLog\//);
  await page.locator('.wiki-block .suggest-item').first().click();
  await expect(page.locator('.person-row-name')).toHaveText(['架空花子']);
  expect(errors).toEqual([]);
});

test('よく出る人・前回と同じ出演者', async ({ page }) => {
  await seed(
    page,
    {
      persons: [
        { id: 'p1', name: '架空甲' },
        { id: 'p2', name: '架空乙' },
        { id: 'p3', name: '架空丙' },
        { id: 'p4', name: '架空丁' },
      ],
      programs: [
        { id: 'A', name: '架空番組A', defaultPersonIds: ['p1'] },
        { id: 'B', name: '架空番組B' },
      ],
      logs: [
        { id: 'l1', programId: 'A', date: '2026-11-14', cast: [['p1', 'regular'], ['p2', 'regular']] },
        { id: 'l2', programId: 'A', date: '2026-11-21', cast: [['p1', 'regular'], ['p2', 'regular'], ['p3', 'guest']] },
        { id: 'l3', programId: 'B', date: '2026-11-20', cast: [['p4', 'regular']] },
      ],
    },
    '/logs/new?programId=A',
  );
  await expect(page.locator('.person-row-name')).toHaveText(['架空甲']);
  const freq = page.locator('.frequent .chip');
  await expect(freq.first()).toContainText('架空乙');
  const prev = page.getByRole('button', { name: /前回（2026\.11\.21/ });
  await prev.click();
  await expect(page.locator('.person-row-name')).toHaveText(['架空甲', '架空乙', '架空丙']);
  await expect(page.locator('.role-toggle')).toHaveText(['レギュラー', 'レギュラー', 'ゲスト']);
  await expect(prev).toHaveCount(0);

  // 編集時は自分自身を「前回」に含めない
  await open(page, '/logs/l2/edit');
  await expect(page.getByRole('button', { name: /前回（2026\.11\.14/ })).toBeVisible();
});
