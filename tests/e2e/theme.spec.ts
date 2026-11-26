import { expect, test } from '@playwright/test';
import { collectErrors, open } from './helpers';

/** 見た目の切り替え：夜（ダーク・既定）／昼（ライト）／端末に合わせる */
const theme = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme);

test('既定は夜。ホームの ☀️ で昼、もう一度で夜。選んだ見た目は再読み込み後も残る', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/');
  expect(await theme(page)).toBe('night');
  await expect(page.locator('.home-night-road')).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0F1B33');

  await page.getByRole('button', { name: '昼（ライト）の見た目にする' }).click();
  expect(await theme(page)).toBe('day');
  await expect(page.locator('.home-night-road')).toBeHidden();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#EFE7D6');
  await page.reload();
  expect(await theme(page)).toBe('day');

  await page.getByRole('button', { name: '夜（ダーク）の見た目にする' }).click();
  expect(await theme(page)).toBe('night');
  expect(errors).toEqual([]);
});

test('データ画面で「端末に合わせる」を選ぶと、端末のダーク／ライトに追従する', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, '/data');
  await expect(page.getByRole('button', { name: /🌙 夜/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /端末に合わせる/ }).click();
  expect(await theme(page)).toBe('day');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('night');
  await page.reload();
  expect(await theme(page)).toBe('night');
  await page.getByRole('button', { name: /☀️ 昼/ }).click();
  expect(await theme(page)).toBe('day');
  await expect(page.getByRole('button', { name: /☀️ 昼/ })).toHaveAttribute('aria-pressed', 'true');
});
