import { expect, test } from '@playwright/test';
import { collectErrors, open, seed } from './helpers';

test('はじめての画面：紹介・最初の一歩・ガイドが開いている・下部ナビ', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/');
  await expect(page.getByText('ラジオの「また聴きたい回」をストックするアプリ')).toBeVisible();
  await expect(page.getByRole('link', { name: '① まず番組を登録する' })).toBeVisible();
  await expect(page.locator('.home-guide')).toHaveAttribute('open', '');
  await expect(page.locator('.home-stats')).toHaveCount(0);
  await expect(page.locator('.bottom-nav .nav-item span, .nav-fab-label')).toHaveText(['ホーム', 'リピート帳', '回を追加', '番組', '出演者']);
  expect(errors).toEqual([]);
});

test('データがある時：最近の3件・ガイドは畳む・バックアップ欄はガイドの上', async ({ page }) => {
  await seed(
    page,
    {
      programs: [{ id: 'A', name: '架空番組A' }],
      logs: [1, 2, 3, 4, 5].map((i) => ({ id: `l${i}`, programId: 'A', date: `2026-11-0${i}`, createdAt: `2026-11-1${i}T00:00:00Z` })),
    },
    '/',
  );
  await expect(page.locator('.log-card .date-badge')).toHaveText([/2026\.11\.05/, /2026\.11\.04/, /2026\.11\.03/]);
  await expect(page.locator('.home-guide')).not.toHaveAttribute('open', '');
  await expect(page.locator('.home-stats .stat-num')).toHaveText(['5', '1', '0']);
  const backupAboveGuide = await page.evaluate(() => {
    const b = document.querySelector('.home-backup');
    const g = document.querySelector('.home-guide');
    return Boolean(b && g && b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(backupAboveGuide).toBe(true);

  await page.getByRole('button', { name: /おまかせ1本/ }).click();
  await expect(page.getByText('TUNED IN!')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();

  await page.getByRole('link', { name: /リピート帳をすべて見る（5件）/ }).click();
  await expect(page).toHaveURL(/#\/logs$/);
  await expect(page.locator('.nav-item.active')).toContainText('リピート帳');

  await open(page, '/guide'); // 旧ルートはホームへ
  await expect(page).toHaveURL(/#\/$/);
});
