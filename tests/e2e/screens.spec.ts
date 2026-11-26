import { test } from '@playwright/test';
import { mockExternal, open, seed, type Seed } from './helpers';

/**
 * 見た目の確認用スクリーンショット（架空データ）。screenshots/ に保存し、CI（ci.yml）で Artifacts「screenshots」として取り出せる。
 * 判定はしない（壊れていないかは他のテストで確認）。
 */
const DATA: Seed = {
  persons: [
    { id: 'p1', name: '架空甲' },
    { id: 'p2', name: '架空乙' },
  ],
  programs: [
    { id: 'A', name: '架空の深夜番組', station: '架空放送', defaultPersonIds: ['p1'] },
    { id: 'B', name: '架空チャンネル', station: 'YouTube' },
  ],
  logs: [
    {
      id: 'l1',
      programId: 'A',
      date: '2026-11-21',
      memo: '冒頭のフリートークがまた聴きたい。後半のコーナーの掛け合いも最高。',
      cast: [['p1', 'regular'], ['p2', 'guest']],
      links: [{ url: 'https://radiko.jp/#!/ts/XXX/1' }, { url: 'https://www.youtube.com/watch?v=abcdEFGH123', label: '架空動画' }],
    },
    { id: 'l2', programId: 'A', date: '2026-11-14', cast: [['p1', 'regular']] },
    { id: 'l3', programId: 'B', date: '', memo: '日付の分からない配信回' },
  ],
};

test('スクリーンショット（主要画面）', async ({ page, context }) => {
  await mockExternal(context);
  const shot = async (name: string) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 55 });
  };
  await open(page, '/');
  await shot('00-home-empty');
  await seed(page, DATA, '/');
  await shot('01-home');
  await open(page, '/logs');
  await shot('02-logs');
  await page.getByRole('button', { name: '📨 選んでシェア' }).click();
  await page.locator('.log-card.is-selectable').first().click();
  await shot('03-logs-select');
  await page.getByRole('button', { name: '次へ（確認）' }).click();
  await shot('04-share-modal');
  await open(page, '/logs/l1');
  await shot('05-detail');
  await open(page, '/logs/new');
  await page.fill('#lprogram', '新しい架空番組');
  await page.locator('#lprogram').press('Enter');
  await shot('06-form-new-program');
  await page.fill('#lprogram', '');
  await page.locator('#lprogram').click();
  await shot('07-form-program-list');
  await open(page, '/programs');
  await shot('08-programs');
  await open(page, '/programs/A');
  await shot('09-program-detail');
  await open(page, '/programs/new');
  await shot('10-program-form');
  await open(page, '/persons');
  await shot('11-persons');
  await open(page, '/data');
  await shot('12-data');
  await open(page, '/shared/hello');
  await shot('13-shared-error');
});
