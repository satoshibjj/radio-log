import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { collectErrors, idbCount, mockShare, open, seed, sharedFiles, sharedUrls, type Seed } from './helpers';

/** ★3 リスト共有：選んでシェア（最大10件）→ 別枠で受け取り → 選んで取り込み。データはすべて架空 */

const uploadPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'radiolog-e2e-')), name);
const tokenJ = (payload: unknown) => `1j${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
const tokenZ = (payload: unknown) => `1z${deflateRawSync(Buffer.from(JSON.stringify(payload))).toString('base64url')}`;
const KIND = 'radio-log-shared-list';
const item = (over: Record<string, unknown> = {}) => ({ p: '架空番組A', s: '架空放送', d: '2026-11-01', ...over });

const LONG_MEMO = `${'冒頭のフリートークが最高。'.repeat(25)}`; // 200 文字超
const SENDER: Seed = {
  persons: [
    { id: 'p1', name: '架空甲' },
    { id: 'p2', name: '架空乙' },
  ],
  programs: [
    { id: 'A', name: '架空番組A', station: '架空放送' },
    { id: 'B', name: '架空番組B' },
  ],
  logs: Array.from({ length: 12 }, (_, i) => ({
    id: `l${String(i + 1).padStart(2, '0')}`,
    programId: i % 2 ? 'B' : 'A',
    date: i === 11 ? '' : `2026-10-${String(i + 1).padStart(2, '0')}`,
    createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    memo: i === 0 ? LONG_MEMO : i === 1 ? '架空のメモ' : '',
    cast: i % 2 ? ([['p2', 'guest']] as [string, 'guest'][]) : ([['p1', 'regular'], ['p2', 'guest']] as [string, 'regular' | 'guest'][]),
    links: i === 0 ? [{ url: 'https://www.youtube.com/watch?v=abcdEFGH123', label: '架空動画' }] : [],
  })),
};

/** 受け取る人（別の端末＝別のブラウザコンテキスト） */
async function receiver(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ serviceWorkers: 'block', locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

test('選んでシェア（10件まで・メモの有無・プレビュー）→ 受け取りは別枠 → 選んで取り込み', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await mockShare(page);
  await seed(page, SENDER);

  await page.getByRole('button', { name: '📨 選んでシェア' }).click();
  await expect(page.getByText('シェアする回をタップして選んでください')).toBeVisible();
  await expect(page.locator('.random-fab')).toHaveCount(0);
  const cards = page.locator('.log-card.is-selectable');
  await expect(cards).toHaveCount(12);
  for (let i = 0; i < 11; i++) await cards.nth(i).click();
  await expect(page.getByText('シェアできるのは10件までです')).toBeVisible();
  await expect(page.locator('.select-count')).toHaveText('10 / 10 件');
  await cards.nth(1).click(); // 2件外す
  await cards.nth(2).click();
  await expect(page.locator('.select-count')).toHaveText('8 / 10 件');
  // 長いメモの回（日付順で11番目）と、日付なしの回（追加が最新だが日付順では最後）を入れる
  await cards.nth(10).click();
  await cards.nth(11).click();
  await expect(page.locator('.select-count')).toHaveText('10 / 10 件');
  await page.getByRole('button', { name: '次へ（確認）' }).click();

  const modal = page.locator('.share-list-modal');
  await expect(modal.getByRole('heading', { name: '10件をシェア' })).toBeVisible();
  await expect(modal.getByText('リンクを知っている人は誰でも中身を見られます')).toBeVisible();
  await expect(modal.locator('.shared-item')).toHaveCount(10);
  const memoBox = modal.getByRole('checkbox', { name: /メモも含める/ });
  await expect(memoBox).not.toBeChecked(); // 既定はメモなし
  await expect(modal.locator('.shared-item-memo')).toHaveCount(0);
  await memoBox.check();
  await expect(modal.locator('.shared-item-memo')).toHaveCount(2);
  const memo = await modal.locator('.shared-item-memo', { hasText: '冒頭' }).innerText();
  expect(memo.length).toBe(200);
  expect(memo.endsWith('…')).toBe(true);
  await expect(modal.locator('.shared-item').last()).toContainText('日付なし');

  await modal.getByRole('button', { name: '共有する（LINE・X など）' }).click();
  await expect.poll(() => sharedUrls(page)).toHaveLength(1);
  const [url] = await sharedUrls(page);
  expect(url).toMatch(/#\/shared\/1z[A-Za-z0-9_-]+$/);
  expect(await modal.locator('#share-list-url').inputValue()).toBe(url);

  // やめる → 選択モード終了
  await modal.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.locator('.random-fab')).toBeVisible();
  await expect(page.locator('.log-card.is-selectable')).toHaveCount(0);

  // ---- 受け取る側（データなし）
  const r = await receiver(browser);
  const rErrors = collectErrors(r);
  await r.goto(url);
  await expect(r.getByRole('heading', { name: 'シェアされたリスト' })).toBeVisible();
  await expect(r.getByText('まだあなたのリピート帳には入っていません')).toBeVisible();
  await expect(r.locator('.shared-item')).toHaveCount(10);
  expect(await idbCount(r, 'episodeLogs')).toBe(0); // 開いただけでは入らない
  expect(await idbCount(r, 'programs')).toBe(0);
  const link = r.locator('.shared-item a.link-open').first();
  await expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdEFGH123');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(r.locator('.shared-item-memo')).toHaveCount(2);

  await r.getByRole('button', { name: '＋ 自分のリピート帳に入れる' }).first().click();
  await expect(r.getByText('1件をリピート帳に入れました')).toBeVisible();
  await expect(r.locator('.shared-import').first()).toHaveText('✓ リピート帳に入れました');
  expect(await idbCount(r, 'episodeLogs')).toBe(1);
  await r.getByRole('button', { name: 'まとめて入れる（9件）' }).click();
  await r.locator('.modal').getByRole('button', { name: 'まとめて入れる' }).click();
  await expect(r.getByRole('link', { name: 'リピート帳を見る' })).toBeVisible();
  expect(await idbCount(r, 'episodeLogs')).toBe(10);
  expect(await idbCount(r, 'programs')).toBe(2); // 番組は名前で1つにまとまる
  expect(await idbCount(r, 'persons')).toBe(2);

  await r.getByRole('link', { name: 'リピート帳を見る' }).click();
  await expect(r.locator('.log-card')).toHaveCount(10);
  await expect(r.locator('.group-title')).toHaveText([/日付なし/]);
  expect(errors).toEqual([]);
  expect(rErrors).toEqual([]);
  await r.context().close();
});

test('取り込み：番組・出演者は名前（全角半角・別名・カタカナ）で照合して再利用、同じ番組・同じ放送日は確認', async ({ page }) => {
  await seed(
    page,
    {
      persons: [{ id: 'p1', name: '架空甲', aliases: ['こうちゃん'] }],
      programs: [{ id: 'A', name: 'ＡＢＣ架空ラジオ', station: '架空放送' }],
      logs: [{ id: 'mine', programId: 'A', date: '2026-11-01' }],
    },
    '/',
  );
  const token = tokenZ({
    k: KIND,
    v: 1,
    items: [
      item({ p: 'ABC架空ラジオ', c: [['コウチャン', 'r'], ['架空新人', 'g']], l: [['https://radiko.jp/#!/ts/XXX/1']], m: '受け取ったメモ' }),
      item({ p: '初めての架空番組', d: '' }),
    ],
  });
  await open(page, `/shared/${token}`);
  await expect(page.locator('.shared-item')).toHaveCount(2);
  await expect(page.locator('.shared-item').first()).toContainText('同じ番組・同じ放送日の回がリピート帳にあります');

  await page.getByRole('button', { name: '＋ 自分のリピート帳に入れる' }).first().click();
  await expect(page.getByRole('heading', { name: '同じ放送回が既に記録されています' })).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  expect(await idbCount(page, 'episodeLogs')).toBe(1);

  await page.getByRole('button', { name: '＋ 自分のリピート帳に入れる' }).first().click();
  await page.getByRole('button', { name: 'このまま入れる' }).click();
  await expect(page.getByText('1件をリピート帳に入れました（新しく登録：出演者 1 人）')).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);
  expect(await idbCount(page, 'programs')).toBe(1); // ＡＢＣ架空ラジオ を再利用
  expect(await idbCount(page, 'persons')).toBe(2); // 架空甲（別名で一致）＋ 架空新人

  // まとめて入れる：残り1件（日付なしは重複確認なし）
  await page.getByRole('button', { name: 'まとめて入れる（1件）' }).click();
  await page.locator('.modal').getByRole('button', { name: 'まとめて入れる' }).click();
  await expect(page.getByText('新しく登録：番組 1 件')).toBeVisible();
  expect(await idbCount(page, 'programs')).toBe(2);

  // 取り込んだ回は普通の回：出演者・リンク・メモがそのまま
  await open(page, '/logs');
  await page.locator('.log-card', { hasText: '受け取ったメモ' }).click();
  await expect(page.locator('.detail-card .chip')).toHaveText(['架空甲', /架空新人/]);
  await expect(page.locator('a.link-open')).toHaveText([/radiko/]);
});

test('まとめて入れる：重複は入れない を選べる', async ({ page }) => {
  await seed(page, { programs: [{ id: 'A', name: '架空番組A' }], logs: [{ id: 'mine', programId: 'A', date: '2026-11-01' }] }, '/');
  await open(page, `/shared/${tokenJ({ k: KIND, v: 1, items: [item(), item({ d: '2026-11-08' })] })}`);
  await page.getByRole('button', { name: 'まとめて入れる（2件）' }).click();
  await expect(page.locator('.modal-body')).toContainText('2件のうち 1件は');
  await page.getByRole('button', { name: '重複は入れない' }).click();
  await expect(page.getByText('1件をリピート帳に入れました')).toBeVisible();
  expect(await idbCount(page, 'episodeLogs')).toBe(2);
});

test('受け取ったデータは厳しく検証し、不正なら何も表示・保存しない', async ({ page }) => {
  await seed(page, {}, '/');
  const valid = tokenZ({ k: KIND, v: 1, items: [item({ m: 'あ'.repeat(150) })] });
  const cases: [string, RegExp][] = [
    [tokenJ({ k: KIND, v: 1, items: [item({ l: [['javascript:alert(1)']] })] }), /http\(s\) の URL ではありません/],
    [tokenJ({ k: KIND, v: 1, items: [item({ l: [['data:text/html,<b>x</b>']] })] }), /http\(s\) の URL ではありません/],
    [tokenJ({ k: KIND, v: 1, items: Array.from({ length: 11 }, () => item()) }), /10件を超えています/],
    [tokenJ({ k: KIND, v: 1, items: [] }), /回が入っていません/],
    [tokenJ({ k: KIND, v: 1, items: [item({ m: 'あ'.repeat(201) })] }), /メモが長すぎます/],
    [tokenJ({ k: KIND, v: 1, items: [item({ p: 'あ'.repeat(101) })] }), /番組名が長すぎます/],
    [tokenJ({ k: KIND, v: 1, items: [item({ d: '2026-13-01' })] }), /放送日が不正です/],
    [tokenJ({ k: KIND, v: 1, items: [item({ p: '架空\u0007番組' })] }), /使えない文字/],
    [tokenJ({ k: KIND, v: 1, items: [item({ p: '架空‮番組' })] }), /使えない文字/],
    [tokenJ({ k: KIND, v: 1, items: [item({ c: Array.from({ length: 21 }, (_, i) => [`架空${i}`, 'r']) })] }), /出演者が不正です/],
    [tokenJ({ k: KIND, v: 1, items: [item({ c: [['架空甲', 'boss']] })] }), /出演者が不正です/],
    [tokenJ({ k: KIND, v: 1, items: [item({ x: 'evil' })] }), /不明な項目/],
    [tokenJ({ k: 'other-app', v: 1, items: [item()] }), /シェアリストではありません/],
    [tokenJ({ k: KIND, v: 2, items: [item()] }), /新しい形式/],
    ['9jAAAA', /新しい形式/],
    ['1zabc!!', /リンクの文字が正しくありません/],
    [valid.slice(0, Math.floor(valid.length / 2)), /読み取れませんでした|読み込めません|正しくありません/],
    ['hello', /シェアリンクではない/],
  ];
  for (const [token, message] of cases) {
    await open(page, `/shared/${token}`);
    await expect(page.locator('.empty-title'), token.slice(0, 30)).toHaveText('このリストは読み込めません');
    await expect(page.locator('.shared-error')).toHaveText(message);
    await expect(page.locator('.shared-item')).toHaveCount(0);
  }
  // 正しいものは開ける
  await open(page, `/shared/${valid}`);
  await expect(page.locator('.shared-item')).toHaveCount(1);
  expect(await idbCount(page, 'episodeLogs')).toBe(0);
  expect(await idbCount(page, 'programs')).toBe(0);
});

test('長いリンクは注意を出し、ファイルで送れる → 受け取った人はデータ画面からファイルで開ける', async ({ page }) => {
  await mockShare(page);
  // 圧縮しにくい架空のメモ（200文字）を10件
  let seedN = 7;
  const rand = () => (seedN = (seedN * 1103515245 + 12345) % 2147483648);
  const memo = () => Array.from({ length: 200 }, () => String.fromCharCode(0x4e00 + (rand() % 20000))).join('');
  await seed(page, {
    programs: [{ id: 'A', name: '架空番組A' }],
    logs: Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, programId: 'A', date: `2026-10-${String(i + 1).padStart(2, '0')}`, memo: memo() })),
  });
  await page.getByRole('button', { name: '📨 選んでシェア' }).click();
  const cards = page.locator('.log-card.is-selectable');
  for (let i = 0; i < 10; i++) await cards.nth(i).click();
  await page.getByRole('button', { name: '次へ（確認）' }).click();
  await expect(page.getByText('リンクがとても長いため')).toHaveCount(0);
  await page.getByRole('checkbox', { name: /メモも含める/ }).check();
  await expect(page.getByText('リンクがとても長いため')).toBeVisible();

  await page.getByRole('button', { name: 'ファイルで送る' }).click();
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  const [f] = await sharedFiles(page);
  expect(f.name).toMatch(/^radio-log-list-\d{8}\.json$/);
  const path = uploadPath('list.json');
  writeFileSync(path, f.text ?? '');

  // 受け取る側：データ画面 →「受け取ったリストを開く」→ ファイル
  await page.locator('.share-list-modal').getByRole('button', { name: '閉じる' }).click();
  await open(page, '/data');
  await page.getByRole('link', { name: '📂 受け取ったリストを開く' }).click();
  await expect(page.locator('.empty-title')).toHaveText('リストを開いてください');
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('.shared-item')).toHaveCount(10);
  await expect(page.locator('.shared-item-memo')).toHaveCount(10);

  // 不正なファイルは拒否
  const bad = uploadPath('bad.json');
  writeFileSync(bad, JSON.stringify({ k: KIND, v: 1, items: [item({ l: [['javascript:alert(1)']] })] }));
  await page.locator('input[type=file]').setInputFiles(bad);
  await expect(page.locator('.shared-error')).toContainText('http(s) の URL ではありません');
  await expect(page.locator('.shared-item')).toHaveCount(0);
});
