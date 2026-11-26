import { expect, test } from '@playwright/test';
import { disableShare, mockShare, open, seed, sharedFiles, type Seed } from './helpers';

const DATA: Seed = {
  persons: [
    { id: 'p1', name: '架空甲', aliases: ['こうちゃん'] },
    { id: 'p2', name: '架空乙' },
  ],
  programs: [
    { id: 'Z', name: 'わ行の架空番組', station: '架空放送' },
    { id: 'A', name: 'あ行の架空番組' },
  ],
  logs: [
    { id: 'l1', programId: 'Z', date: '2026-11-20', createdAt: '2026-11-21T00:00:00Z', cast: [['p1', 'regular']] },
    { id: 'l2', programId: 'A', date: '2026-11-10', createdAt: '2026-11-25T00:00:00Z', cast: [['p1', 'regular'], ['p2', 'guest']] },
    { id: 'l3', programId: 'Z', date: '2026-11-01', createdAt: '2026-11-02T00:00:00Z' },
    { id: 'l4', programId: 'A', date: '2026-11-15', createdAt: '2026-11-16T00:00:00Z', memo: 'メモ' },
  ],
};
const dates = (page: import('@playwright/test').Page) =>
  page.locator('.log-card .date-badge').evaluateAll((els) => els.map((e) => e.getAttribute('datetime')));

test('並び替え4種・番組ごとの見出し・選択の保持', async ({ page }) => {
  await seed(page, DATA);
  await expect.poll(() => dates(page)).toEqual(['2026-11-20', '2026-11-15', '2026-11-10', '2026-11-01']);
  await page.getByRole('button', { name: '古い順' }).click();
  await expect.poll(() => dates(page)).toEqual(['2026-11-01', '2026-11-10', '2026-11-15', '2026-11-20']);
  await page.getByRole('button', { name: '追加した順' }).click();
  await expect.poll(() => dates(page)).toEqual(['2026-11-10', '2026-11-20', '2026-11-15', '2026-11-01']);
  await page.getByRole('button', { name: '番組ごと' }).click();
  await expect(page.locator('.group-title a')).toHaveText(['あ行の架空番組', 'わ行の架空番組']);
  await expect.poll(() => dates(page)).toEqual(['2026-11-15', '2026-11-10', '2026-11-20', '2026-11-01']);
  await open(page, '/programs');
  await open(page, '/logs');
  await expect(page.locator('.sort-chip.is-selected')).toHaveText('番組ごと');
});

test('おまかせ1本：連続で同じ回が出ない・絞り込み中はその中から', async ({ page }) => {
  await seed(page, DATA);
  await page.locator('.random-fab').click();
  await expect(page.getByText('TUNED IN!')).toBeVisible();
  let prev = await page.locator('.pick-date').getAttribute('datetime');
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: '🎲 別の回を引き直す' }).click();
    const cur = await page.locator('.pick-date').getAttribute('datetime');
    expect(cur).not.toBe(prev);
    prev = cur;
  }
  await page.getByRole('button', { name: '閉じる' }).click();

  await open(page, '/logs?person=p2');
  await expect(page.locator('.random-fab-sub')).toHaveText('絞り込み中 1件から');
  await page.locator('.random-fab').click();
  await expect(page.locator('.pick-date')).toHaveAttribute('datetime', '2026-11-10');
  await expect(page.getByRole('button', { name: '🎲 別の回を引き直す' })).toBeDisabled();
});

test('シェア画像：1回分（保存・共有）と上位5件', async ({ page }) => {
  await mockShare(page);
  await seed(page, DATA, '/logs/l2');
  await page.getByRole('button', { name: 'シェア画像を作成' }).click();
  const img = page.locator('.share-preview img');
  await img.waitFor();
  const size = await img.evaluate((el: HTMLImageElement) =>
    el.complete ? [el.naturalWidth, el.naturalHeight] : new Promise((r) => (el.onload = () => r([el.naturalWidth, el.naturalHeight]))),
  );
  expect(size).toEqual([1080, 1350]);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '画像を保存（PNG）' }).click()]);
  expect(dl.suggestedFilename()).toBe('radio-log-2026-11-10.png');
  await page.getByRole('button', { name: '共有する' }).click();
  await expect.poll(async () => (await sharedFiles(page)).map((f) => `${f.name}:${f.type}`)).toEqual(['radio-log-2026-11-10.png:image/png']);
  await page.getByRole('button', { name: '閉じる' }).click();

  await open(page, '/logs');
  await page.getByRole('button', { name: '📷 上位4件をシェア' }).click();
  await page.locator('.share-preview img').waitFor();
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '画像を保存（PNG）' }).click()]);
  expect(dl2.suggestedFilename()).toMatch(/^radio-log-top4-\d{4}-\d{2}-\d{2}\.png$/);
});

test('共有非対応の環境では「共有する」を出さない', async ({ page }) => {
  await disableShare(page);
  await seed(page, DATA, '/logs/l1');
  await page.getByRole('button', { name: 'シェア画像を作成' }).click();
  await page.locator('.share-preview img').waitFor();
  await expect(page.getByRole('button', { name: '共有する' })).toHaveCount(0);
});

test('検索欄の候補（番組・出演者・絞り込み欄のよく出る人）', async ({ page }) => {
  await seed(page, DATA);
  await page.locator('.filter-box .picker input').click();
  await expect(page.getByText('よく出る人', { exact: true })).toBeVisible();
  await expect(page.locator('.filter-box .suggest-item').first()).toContainText('架空甲');

  await open(page, '/programs');
  await page.locator('.filter-box input').fill('架空放送');
  await expect(page.locator('.filter-box .suggest-item')).toHaveCount(1);
  await page.locator('.filter-box .suggest-item').click();
  await expect(page).toHaveURL(/#\/programs\/Z$/);

  await open(page, '/persons');
  await page.locator('.filter-box input').fill('コウ');
  await expect(page.locator('.filter-box .suggest-item').first()).toContainText('別名: こうちゃん');
  await page.locator('.filter-box .suggest-item').first().click();
  await expect(page.locator('.person-form input').first()).toHaveValue('架空甲');
});
