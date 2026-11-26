import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectErrors, disableShare, idbGet, open, seed, type Seed } from './helpers';

/** タグ（カテゴリ・スキーマ v3）：自由に追加・登録済みから選ぶ・タグごとの並び・番組とタグのドロップダウン絞り込み。データは架空 */

const save = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^(リピート帳に追加|更新する)$/ }).click();
const dates = (page: import('@playwright/test').Page) => page.locator('.log-card .date-badge').allInnerTexts();

test('回の追加でタグを自由に付ける（Enter・追加ボタン・読点区切り・打ったまま保存）→ 次は登録済みから選べる', async ({ page }) => {
  const errors = collectErrors(page);
  await seed(page, { programs: [{ id: 'A', name: '架空番組A' }] }, '/logs/new?programId=A');
  const input = page.locator('#ltag');
  await input.fill('神回');
  await input.press('Enter');
  await input.fill('企画回、 ＃ゲスト回');
  await page.locator('.tag-input-row').getByRole('button', { name: '追加' }).click();
  await expect(page.locator('.tag-selected .chip')).toHaveText([/#神回/, /#企画回/, /#ゲスト回/]);
  await input.fill('神回'); // 同じタグは増えない
  await input.press('Enter');
  await expect(page.locator('.tag-selected .chip')).toHaveCount(3);
  await page.getByRole('button', { name: 'タグ「企画回」を外す' }).click();
  await input.fill('深夜テンション'); // 追加を押さずに保存
  await save(page);
  await expect(page.getByText('ON AIR')).toBeVisible();
  await expect(page.locator('.detail-card .tag-chip')).toHaveText(['#神回', '#ゲスト回', '#深夜テンション']);

  // 次の回：登録済みのタグがタップで選べる・打つと絞り込まれる
  await open(page, '/logs/new?programId=A');
  await expect(page.locator('.tag-suggest .chip')).toHaveCount(3);
  for (const t of ['ゲスト回', '深夜テンション', '神回']) await expect(page.locator('.tag-suggest .chip', { hasText: `#${t}` })).toBeVisible();
  await page.locator('#ltag').fill('ゲスト');
  await expect(page.locator('.tag-suggest .chip')).toHaveText(['＋ #ゲスト回']);
  await page.locator('.tag-suggest .chip').click();
  await expect(page.locator('.tag-selected .chip')).toHaveText([/#ゲスト回/]);
  await page.fill('#ldate', '2026-11-02');
  await save(page);
  await expect(page.locator('.detail-card .tag-chip')).toHaveText(['#ゲスト回']);

  // 詳細のタグから、そのタグの回の一覧へ
  await page.locator('.detail-card .tag-chip').click();
  await expect(page).toHaveURL(/#\/logs\?tag=/);
  await expect(page.locator('#filter-tag')).toHaveValue('ゲスト回');
  await expect(page.locator('.log-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

const DATA: Seed = {
  persons: [{ id: 'p1', name: '架空甲' }],
  programs: [
    { id: 'A', name: 'あ行の架空番組' },
    { id: 'Z', name: 'わ行の架空番組' },
  ],
  logs: [
    { id: 'l1', programId: 'A', date: '2026-11-20', tags: ['神回', '企画回'], cast: [['p1', 'regular']] },
    { id: 'l2', programId: 'Z', date: '2026-11-15', tags: ['神回'] },
    { id: 'l3', programId: 'A', date: '2026-11-10', tags: ['ゲスト回'], cast: [['p1', 'regular']] },
    { id: 'l4', programId: 'Z', date: '2026-11-05' },
  ],
};

test('並び替え「タグごと」：タグの多い順に見出し、複数タグの回は各見出しに、タグなしは最後', async ({ page }) => {
  await seed(page, DATA);
  await expect(page.locator('.log-card .tag-mini').first()).toHaveText('#神回');
  await page.getByRole('button', { name: 'タグごと' }).click();
  await expect(page.locator('.group-title')).toHaveText([/#神回\s*2 回/, /#ゲスト回\s*1 回/, /#企画回\s*1 回/, /タグなし\s*1 回/]);
  await expect.poll(() => dates(page)).toEqual([
    expect.stringMatching(/2026\.11\.20/),
    expect.stringMatching(/2026\.11\.15/),
    expect.stringMatching(/2026\.11\.10/),
    expect.stringMatching(/2026\.11\.20/),
    expect.stringMatching(/2026\.11\.05/),
  ]);
  // シェア画像の上位件数は同じ回を数えない
  await expect(page.getByRole('button', { name: '📷 上位4件をシェア' })).toBeVisible();
  await open(page, '/programs');
  await open(page, '/logs');
  await expect(page.locator('.sort-chip.is-selected')).toHaveText('タグごと');
});

test('番組・タグのドロップダウンで絞り込み（出演者とも組み合わせ・URL に残る）', async ({ page }) => {
  await seed(page, DATA);
  await expect(page.locator('#filter-program option')).toHaveText(['すべての番組', 'あ行の架空番組', 'わ行の架空番組']);
  await expect(page.locator('#filter-tag option')).toHaveText(['すべてのタグ', '#神回（2）', '#ゲスト回（1）', '#企画回（1）']);

  await page.locator('#filter-program').selectOption({ label: 'あ行の架空番組' });
  await expect(page.locator('.log-card')).toHaveCount(2);
  await expect(page.locator('.list-meta')).toHaveText('2 件（全 4 件中）');
  await page.locator('#filter-tag').selectOption({ label: '#神回（2）' });
  await expect(page.locator('.log-card')).toHaveCount(1);
  await expect(page).toHaveURL(/program=A/);
  await expect(page.locator('.random-fab-sub')).toHaveText('絞り込み中 1件から');

  // 番組を「すべて」に戻すとタグだけで絞る
  await page.locator('#filter-program').selectOption('');
  await expect(page.locator('.log-card')).toHaveCount(2);
  // 出演者とも組み合わせ（AND）
  await page.locator('.filter-box .picker input').fill('架空甲');
  await page.locator('.filter-box .suggest-item').first().click();
  await expect(page.locator('.log-card')).toHaveCount(1);
  await expect(page.locator('#filter-tag')).toHaveValue('神回'); // 出演者を選んでもタグの絞り込みは残る
  await page.reload();
  await expect(page.locator('.log-card')).toHaveCount(1);
  await page.locator('#filter-tag').selectOption('');
  await page.getByRole('button', { name: 'すべて解除' }).click();
  await expect(page.locator('.log-card')).toHaveCount(4);
});

test('バックアップ：タグが書き出され、復元で戻る。長すぎるタグは取り込まない', async ({ page }, info) => {
  await disableShare(page);
  await seed(page, DATA, '/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'この端末にファイルを保存' }).click()]);
  const path = info.outputPath('backup.json');
  await dl.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.schemaVersion).toBe(3);
  expect(json.episodeLogs.find((l: { id: string }) => l.id === 'l1').tags).toEqual(['神回', '企画回']);

  const dir = mkdtempSync(join(tmpdir(), 'radiolog-e2e-'));
  const bad = structuredClone(json);
  bad.episodeLogs[0].tags = ['あ'.repeat(21)];
  writeFileSync(join(dir, 'bad.json'), JSON.stringify(bad));
  await page.locator('input[type=file]').setInputFiles(join(dir, 'bad.json'));
  await expect(page.locator('.modal-body')).toContainText('長すぎます');
  await page.getByRole('button', { name: 'OK' }).click();

  json.episodeLogs.find((l: { id: string }) => l.id === 'l4').tags = ['復元した架空タグ'];
  writeFileSync(join(dir, 'ok.json'), JSON.stringify(json));
  await page.locator('input[type=file]').setInputFiles(join(dir, 'ok.json'));
  await page.getByRole('button', { name: '消去して置き換える' }).click();
  await expect(page.getByText('インポートが完了しました')).toBeVisible();
  expect(await idbGet(page, 'episodeLogs', 'l4')).toMatchObject({ tags: ['復元した架空タグ'] });
});
