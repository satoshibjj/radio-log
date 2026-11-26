import { expect, test } from '@playwright/test';
import { collectErrors, idbCount, open, seed } from './helpers';

test('番組登録 → 回の追加 → 詳細 → 削除（出演者も同時に削除）', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/programs/new');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('番組名を入力してください')).toBeVisible();

  await page.fill('#pname', '  架空番組A  ');
  await page.getByRole('button', { name: '文化放送' }).click();
  const picker = page.locator('.person-editor .picker input');
  await picker.fill('架空甲');
  await page.getByText('＋「架空甲」を新しい人物として追加').click();
  await expect(page.locator('.person-row-name')).toHaveText(['架空甲']);
  // 候補を選ばずに入力したまま保存 → 基本パーソナリティに入る（FR-4-6）
  await picker.fill('架空乙');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByRole('heading', { name: '架空番組A' })).toBeVisible();
  await expect(page.locator('.info-card .chip')).toHaveText(['架空甲', '架空乙']);

  // S3 → S5：番組・今日・基本パーソナリティが入っている
  await page.getByRole('button', { name: 'この番組のリピート回を記録' }).click();
  await expect(page.locator('#lprogram')).not.toHaveValue('');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await expect(page.locator('#ldate')).toHaveValue(today);
  await expect(page.locator('.person-row-name')).toHaveText(['架空甲', '架空乙']);
  await expect(page.locator('.role-toggle')).toHaveText(['レギュラー', 'レギュラー']);

  // 役割切り替え・並び替え
  await page.locator('.role-toggle').nth(1).click();
  await expect(page.locator('.role-toggle').nth(1)).toHaveText('ゲスト');
  await page.locator('.person-row').nth(1).getByRole('button', { name: '上へ' }).click();
  await expect(page.locator('.person-row-name')).toHaveText(['架空乙', '架空甲']);

  // 入力したまま保存 → ゲストとして追加（FR-5-7）
  await page.locator('.person-editor .picker input').fill('架空丙');
  await page.fill('#lmemo', 'オープニングをまた聴きたい');
  await page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();
  await expect(page.getByText('ON AIR')).toBeVisible();
  await expect(page.locator('.detail-card .chip')).toHaveCount(3);
  await expect(page.locator('.detail-card .chip').nth(2)).toContainText('架空丙');
  expect(await idbCount(page, 'episodeAppearances')).toBe(3);

  // 削除：episodeLogs と episodeAppearances が同時に消える（DR-2）
  await page.getByRole('button', { name: '削除する' }).click();
  await page.locator('.modal').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('リピート回を削除しました')).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(0);
  expect(await idbCount(page, 'episodeAppearances')).toBe(0);
  expect(errors).toEqual([]);
});

test('同じ番組・同じ放送日は確認が出る', async ({ page }) => {
  await seed(
    page,
    { programs: [{ id: 'A', name: '架空番組A' }], logs: [{ id: 'l1', programId: 'A', date: '2026-11-21' }] },
    '/logs/new?programId=A',
  );
  await page.fill('#ldate', '2026-11-21');
  await page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();
  await expect(page.getByText('同じ放送回が既に記録されています')).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  expect(await idbCount(page, 'episodeLogs')).toBe(1);
  await page.fill('#ldate', '2026-11-28');
  await page.getByRole('button', { name: 'リピート帳に追加', exact: true }).click();
  await expect(page.getByText('ON AIR')).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);
});

test('出演者のAND絞り込みと、詳細のチップからの絞り込み', async ({ page }) => {
  await seed(page, {
    persons: [
      { id: 'p1', name: '架空甲' },
      { id: 'p2', name: '架空乙', aliases: ['おつちゃん'] },
    ],
    programs: [{ id: 'A', name: '架空番組A' }],
    logs: [
      { id: 'l1', programId: 'A', date: '2026-11-01', cast: [['p1', 'regular']] },
      { id: 'l2', programId: 'A', date: '2026-11-08', cast: [['p1', 'regular'], ['p2', 'guest']] },
    ],
  });
  await expect(page.locator('.log-card .date-badge')).toHaveText([/2026\.11\.08/, /2026\.11\.01/]);
  const filter = page.locator('.filter-box .picker input');
  await filter.fill('オツチャン'); // 別名・カタカナでもヒット
  await page.locator('.filter-box .suggest-item').first().click();
  await expect(page.locator('.log-card')).toHaveCount(1);
  await filter.fill('架空甲');
  await page.locator('.filter-box .suggest-item').first().click();
  await expect(page.locator('.log-card')).toHaveCount(1); // AND
  await page.getByRole('button', { name: 'すべて解除' }).click();
  await expect(page.locator('.log-card')).toHaveCount(2);

  await page.locator('.log-card').first().click();
  await page.locator('.detail-card .chip', { hasText: '架空甲' }).click();
  await expect(page).toHaveURL(/#\/logs\?person=p1/);
  await expect(page.locator('.log-card')).toHaveCount(2);
});

test('参照中の人物・番組は削除できない（DR-3, DR-4）', async ({ page }) => {
  await seed(
    page,
    {
      persons: [{ id: 'p1', name: '架空甲' }],
      programs: [{ id: 'A', name: '架空番組A', defaultPersonIds: ['p1'] }],
      logs: [{ id: 'l1', programId: 'A', date: '2026-11-01', cast: [['p1', 'regular']] }],
    },
    '/persons',
  );
  await page.locator('.person-card-main', { hasText: '架空甲' }).click();
  await page.getByRole('button', { name: 'この人物を削除' }).click();
  await page.locator('.modal').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByRole('heading', { name: '削除できません' })).toBeVisible();
  await expect(page.locator('.modal-body')).toContainText('架空番組A');
  await expect(page.locator('.modal-body')).toContainText('計 1 件');
  await page.getByRole('button', { name: 'OK' }).click();

  await open(page, '/programs/A/edit');
  await page.getByRole('button', { name: 'この番組を削除' }).click();
  await page.locator('.modal').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByRole('heading', { name: '削除できません' })).toBeVisible();
  expect(await idbCount(page, 'programs')).toBe(1);
});
