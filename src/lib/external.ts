/**
 * 外部の無料公開APIを使った入力補助（オンライン時・ユーザーがタップした時のみ呼ぶ）
 * - iTunes Search API（Apple・APIキー不要）：Podcast/番組名の検索。CORS非対応のため公式の JSONP（callback）を使用
 * - Wikipedia（ja）Action API：人名候補の検索。origin=* で匿名CORSリクエスト
 * 送信するのは検索語のみ。アプリ内のデータは送信しない。
 */

const TIMEOUT_MS = 8000;

export class ExternalSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalSearchError';
  }
}

function ensureOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ExternalSearchError('オフラインのため検索できません。電波のある場所でお試しください。');
  }
}

// ---------------------------------------------------------------- iTunes Search API

export interface PodcastResult {
  id: string;
  /** 番組名（collectionName） */
  name: string;
  /** 提供者名（artistName）。放送局名や出演者名のことが多い */
  artist: string;
  artworkUrl?: string;
}

interface ItunesResponse {
  results?: {
    collectionId?: number;
    collectionName?: string;
    artistName?: string;
    artworkUrl60?: string;
  }[];
}

let jsonpSeq = 0;

function jsonp<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cbName = `__radioLogJsonp${Date.now()}_${jsonpSeq++}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      delete w[cbName];
      script.remove();
    };
    w[cbName] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new ExternalSearchError('検索サービスに接続できませんでした。'));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new ExternalSearchError('検索がタイムアウトしました。'));
    }, TIMEOUT_MS);
    script.src = `${url}&callback=${cbName}`;
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  });
}

export async function searchPodcasts(term: string): Promise<PodcastResult[]> {
  const q = term.trim();
  if (!q) return [];
  ensureOnline();
  const params = new URLSearchParams({
    term: q,
    media: 'podcast',
    entity: 'podcast',
    country: 'JP',
    lang: 'ja_jp',
    limit: '15',
  });
  const data = await jsonp<ItunesResponse>(`https://itunes.apple.com/search?${params.toString()}`);
  const seen = new Set<string>();
  const out: PodcastResult[] = [];
  for (const r of data.results ?? []) {
    const name = (r.collectionName ?? '').trim();
    if (!name) continue;
    const id = String(r.collectionId ?? name);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, artist: (r.artistName ?? '').trim(), artworkUrl: r.artworkUrl60 });
  }
  return out;
}

// ---------------------------------------------------------------- Wikipedia（日本語版）

export interface WikiPersonCandidate {
  /** 記事タイトル（例：「山田太郎 (タレント)」） */
  title: string;
  /** 括弧の曖昧さ回避を除いた名前（例：「山田太郎」） */
  name: string;
  /** 曖昧さ回避の括弧内（例：「タレント」） */
  qualifier: string;
  /** 短い説明（あれば） */
  description: string;
}

interface WikiResponse {
  query?: {
    pages?: Record<string, { title?: string; index?: number; description?: string }>;
  };
}

/** 「山田太郎 (タレント)」→ { name: 山田太郎, qualifier: タレント } */
export function splitWikiTitle(title: string): { name: string; qualifier: string } {
  const m = /^(.*?)\s*[（(]([^()（）]+)[)）]\s*$/.exec(title);
  if (m && m[1].trim()) return { name: m[1].trim(), qualifier: m[2].trim() };
  return { name: title.trim(), qualifier: '' };
}

export async function searchWikipediaPersons(term: string): Promise<WikiPersonCandidate[]> {
  const q = term.trim();
  if (!q) return [];
  ensureOnline();
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '1',
    origin: '*',
    generator: 'prefixsearch',
    gpssearch: q,
    gpsnamespace: '0',
    gpslimit: '10',
    prop: 'description',
    redirects: '1',
  });
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://ja.wikipedia.org/w/api.php?${params.toString()}`, {
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ExternalSearchError('Wikipediaに接続できませんでした。');
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) throw new ExternalSearchError(`Wikipediaの検索に失敗しました（${res.status}）。`);
  const data = (await res.json()) as WikiResponse;
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages
    .filter((p) => p.title && !/曖昧さ回避/.test(p.description ?? '') && !/曖昧さ回避/.test(p.title ?? ''))
    .map((p) => {
      const title = p.title as string;
      const { name, qualifier } = splitWikiTitle(title);
      return { title, name, qualifier, description: (p.description ?? '').trim() };
    });
}
