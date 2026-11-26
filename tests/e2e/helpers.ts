import type { BrowserContext, Page } from '@playwright/test';

/** テスト用の架空データ（実在の個人・聴取ログは使わない） */
export interface Seed {
  persons?: { id: string; name: string; aliases?: string[] }[];
  programs?: { id: string; name: string; station?: string; defaultPersonIds?: string[] }[];
  /** date は '' で「日付なし」 */
  logs?: {
    id: string;
    programId: string;
    date: string;
    memo?: string;
    createdAt?: string;
    cast?: [string, 'regular' | 'guest'][];
    links?: { url: string; label?: string }[];
  }[];
}

/** ハッシュルートを開く（baseURL からの相対） */
export async function open(page: Page, route: string): Promise<void> {
  await page.goto(`./#${route}`);
}

/** IndexedDB に直接データを入れてから、指定ルートを開き直す */
export async function seed(page: Page, data: Seed, route = '/logs'): Promise<void> {
  await open(page, '/');
  await page.locator('.main').waitFor();
  await page.evaluate(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('radio_log_db');
        req.onsuccess = () => {
          const tx = req.result.transaction(['programs', 'persons', 'episodeLogs', 'episodeAppearances'], 'readwrite');
          const t = '2026-01-01T00:00:00.000Z';
          for (const p of d.persons ?? []) tx.objectStore('persons').put({ aliases: [], createdAt: t, updatedAt: t, ...p });
          for (const p of d.programs ?? [])
            tx.objectStore('programs').put({ station: '', defaultPersonIds: [], createdAt: t, updatedAt: t, ...p });
          for (const l of d.logs ?? []) {
            const c = l.createdAt ?? t;
            tx.objectStore('episodeLogs').put({
              id: l.id,
              programId: l.programId,
              broadcastDate: l.date,
              memo: l.memo ?? '',
              links: l.links ?? [],
              createdAt: c,
              updatedAt: c,
            });
            (l.cast ?? []).forEach(([personId, role], i) =>
              tx.objectStore('episodeAppearances').put({ id: `${l.id}_a${i}`, episodeLogId: l.id, personId, role, sortOrder: i }),
            );
          }
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    data,
  );
  await open(page, route);
  await page.reload();
  await page.locator('.main').waitFor();
}

export function idbCount(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (s) =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('radio_log_db');
        req.onsuccess = () => {
          const c = req.result.transaction(s).objectStore(s).count();
          c.onsuccess = () => {
            req.result.close();
            resolve(c.result);
          };
        };
      }),
    store,
  );
}

/** 外部 API（iTunes / Wikipedia / YouTube oEmbed）を架空の応答でモックし、呼ばれた検索語・URL を記録する */
export async function mockExternal(
  context: BrowserContext,
): Promise<{ itunes: string[]; wiki: { term: string; ua: string }[]; youtube: string[] }> {
  const seen = { itunes: [] as string[], wiki: [] as { term: string; ua: string }[], youtube: [] as string[] };
  await context.route('https://www.youtube.com/oembed**', (route) => {
    const u = new URL(route.request().url());
    const target = u.searchParams.get('url') ?? '';
    seen.youtube.push(target);
    if (target.includes('PRIVATE')) return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: 'Unauthorized' });
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ title: '架空動画 第12回 アーカイブ', author_name: '架空チャンネル', type: 'video', provider_name: 'YouTube' }),
    });
  });
  await context.route('https://itunes.apple.com/**', (route) => {
    const u = new URL(route.request().url());
    seen.itunes.push(u.searchParams.get('term') ?? '');
    const body = {
      results: [
        { collectionId: 1, collectionName: 'サンプル深夜便', artistName: 'TBSラジオ' },
        { collectionId: 2, collectionName: 'サンプル深夜便 アフタートーク', artistName: '架空太郎' },
      ],
    };
    return route.fulfill({ contentType: 'text/javascript', body: `${u.searchParams.get('callback')}(${JSON.stringify(body)});` });
  });
  await context.route('https://ja.wikipedia.org/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'Api-User-Agent',
          'access-control-allow-methods': 'GET',
        },
      });
    }
    const u = new URL(req.url());
    seen.wiki.push({ term: u.searchParams.get('gpssearch') ?? '', ua: req.headers()['api-user-agent'] ?? '' });
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        query: {
          pages: {
            '1': { title: '架空花子 (タレント)', index: 1, description: '日本のタレント' },
            '2': { title: '架空花子', index: 2, description: '曖昧さ回避のページ' },
            '3': { title: '架空花子 (歌手)', index: 3, description: '' },
          },
        },
      }),
    });
  });
  return seen;
}

/** Web Share API を有効化したことにしてモック（共有されたファイルを window.__shared に記録）。txtOnly は Android Chrome（.json 不可）の再現 */
export async function mockShare(page: Page, opts: { txtOnly?: boolean } = {}): Promise<void> {
  await page.addInitScript((allowTxtOnly: boolean) => {
    const w = window as unknown as { __shared?: { name: string; type: string; text?: string }[]; __sharedUrls?: string[]; __sharedTexts?: string[] };
    w.__shared = [];
    w.__sharedUrls = [];
    w.__sharedTexts = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d: { files?: File[] }) => !allowTxtOnly || (d.files ?? []).every((f) => f.name.endsWith('.txt')),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files?: File[]; url?: string; text?: string }) => {
        if (d.url) w.__sharedUrls!.push(d.url);
        if (d.text) w.__sharedTexts!.push(d.text);
        for (const f of d.files ?? []) {
          const isText = f.type.startsWith('text/') || f.type.includes('json');
          w.__shared!.push({ name: f.name, type: f.type, text: isText ? await f.text() : undefined });
        }
      },
    });
  }, Boolean(opts.txtOnly));
}

/** Web Share 非対応環境にする */
export async function disableShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  });
}

export function sharedFiles(page: Page): Promise<{ name: string; type: string; text?: string }[]> {
  return page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; text?: string }[] }).__shared);
}

/** ページ内エラーを集める */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * 旧バージョン（スキーマ v1：links なし）のデータベースを作る。
 * アプリの JS を読み込まない同一オリジンのファイル（favicon）を開いてから作成する。
 */
export async function createV1Database(page: Page, data: Required<Pick<Seed, 'programs' | 'logs'>> & Pick<Seed, 'persons'>): Promise<void> {
  await page.goto('./favicon.svg');
  await page.evaluate(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('radio_log_db', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('programs', { keyPath: 'id' });
          db.createObjectStore('persons', { keyPath: 'id' });
          const logs = db.createObjectStore('episodeLogs', { keyPath: 'id' });
          logs.createIndex('by_program', 'programId');
          logs.createIndex('by_program_date', ['programId', 'broadcastDate']);
          logs.createIndex('by_date', 'broadcastDate');
          const apps = db.createObjectStore('episodeAppearances', { keyPath: 'id' });
          apps.createIndex('by_log', 'episodeLogId');
          apps.createIndex('by_person', 'personId');
        };
        req.onsuccess = () => {
          const tx = req.result.transaction(['programs', 'persons', 'episodeLogs'], 'readwrite');
          const t = '2026-01-01T00:00:00.000Z';
          for (const p of d.persons ?? []) tx.objectStore('persons').put({ aliases: [], createdAt: t, updatedAt: t, ...p });
          for (const p of d.programs) tx.objectStore('programs').put({ station: '', defaultPersonIds: [], createdAt: t, updatedAt: t, ...p });
          // v1 の形（links なし）
          for (const l of d.logs)
            tx.objectStore('episodeLogs').put({ id: l.id, programId: l.programId, broadcastDate: l.date, memo: l.memo ?? '', createdAt: t, updatedAt: t });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    data,
  );
}

/** IndexedDB のレコードを1件読む */
export function idbGet<T = Record<string, unknown>>(page: Page, store: string, key: string): Promise<T | undefined> {
  return page.evaluate(
    ([s, k]) =>
      new Promise<T | undefined>((resolve) => {
        const req = indexedDB.open('radio_log_db');
        req.onsuccess = () => {
          const g = req.result.transaction(s).objectStore(s).get(k);
          g.onsuccess = () => {
            req.result.close();
            resolve(g.result as T | undefined);
          };
        };
      }),
    [store, key] as const,
  );
}

/** IndexedDB のバージョン */
export function idbVersion(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('radio_log_db');
        req.onsuccess = () => {
          const v = req.result.version;
          req.result.close();
          resolve(v);
        };
      }),
  );
}

/** 共有シートで送られた URL（リスト共有のリンク） */
export function sharedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sharedUrls: string[] }).__sharedUrls);
}

/** 共有シートで一緒に送られた本文 */
export function sharedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sharedTexts: string[] }).__sharedTexts);
}
