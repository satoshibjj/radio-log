/**
 * 回のリンク（聴ける・見られる場所）のユーティリティ（スキーマ v2）
 * - 受け付けるのは http: / https: のみ（javascript: などは弾く）
 * - リンクは開くまで外部通信しない
 */
import type { EpisodeLink } from '../db/types';

/** 1回あたりのリンク上限 */
export const MAX_LINKS = 5;
/** 表示名の最大文字数 */
export const MAX_LINK_LABEL = 100;
/** URL の最大文字数 */
export const MAX_URL_LENGTH = 2000;

/** http(s) の URL として正しければ正規化した文字列、そうでなければ undefined */
export function normalizeHttpUrl(input: string): string | undefined {
  let s = input.trim();
  if (!s || s.length > MAX_URL_LENGTH) return undefined;
  // 「www.」や「youtu.be/…」などスキーム無しで貼られた場合は https を補う
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  if (!u.hostname) return undefined;
  return u.toString();
}

export function isSafeHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export interface LinkService {
  key: string;
  /** ボタンやバッジに出す名前 */
  name: string;
  /** 注意書き（あれば） */
  note?: string;
}

const host = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, '');
  } catch {
    return '';
  }
};
const hostIs = (h: string, ...domains: string[]) => domains.some((d) => h === d || h.endsWith(`.${d}`));

/** URL からサービスを推定（分からなければ「リンク」） */
export function detectService(url: string): LinkService {
  const h = host(url);
  if (hostIs(h, 'radiko.jp'))
    return { key: 'radiko', name: 'radiko', note: 'radiko のタイムフリーは放送後おおむね1週間で聴けなくなります。' };
  if (hostIs(h, 'youtube.com', 'youtu.be', 'youtube-nocookie.com')) return { key: 'youtube', name: 'YouTube' };
  if (hostIs(h, 'spotify.com', 'spotify.link')) return { key: 'spotify', name: 'Spotify' };
  if (hostIs(h, 'podcasts.apple.com')) return { key: 'apple', name: 'Apple Podcasts' };
  if (hostIs(h, 'music.amazon.co.jp', 'music.amazon.com')) return { key: 'amazon', name: 'Amazon Music' };
  if (hostIs(h, 'nicovideo.jp', 'nico.ms')) return { key: 'nico', name: 'ニコニコ' };
  if (hostIs(h, 'voicy.jp')) return { key: 'voicy', name: 'Voicy' };
  if (hostIs(h, 'stand.fm')) return { key: 'standfm', name: 'stand.fm' };
  if (hostIs(h, 'nhk.or.jp', 'nhk.jp')) return { key: 'nhk', name: 'NHK' };
  if (hostIs(h, 'twitch.tv')) return { key: 'twitch', name: 'Twitch' };
  if (hostIs(h, 'tver.jp')) return { key: 'tver', name: 'TVer' };
  if (hostIs(h, 'x.com', 'twitter.com')) return { key: 'x', name: 'X' };
  return { key: 'web', name: h || 'リンク' };
}

/** ボタンに出す名前（表示名があればそれ） */
export function linkDisplayName(link: EpisodeLink): string {
  return link.label?.trim() || detectService(link.url).name;
}

/** YouTube の動画・ショート・ライブの URL か（oEmbed で題名を取れる形） */
export function isYouTubeVideoUrl(url: string): boolean {
  const n = normalizeHttpUrl(url);
  if (!n) return false;
  const u = new URL(n);
  const h = u.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, '');
  if (h === 'youtu.be') return /^\/[\w-]{6,}/.test(u.pathname);
  if (h !== 'youtube.com') return false;
  if (u.pathname === '/watch') return Boolean(u.searchParams.get('v'));
  return /^\/(shorts|live)\/[\w-]{6,}/.test(u.pathname);
}

export class LinkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkValidationError';
  }
}

/**
 * 入力されたリンクを保存用に整える：空行は除外、URL を正規化、重複を除外、上限チェック。
 * 不正な URL があれば LinkValidationError。
 */
export function cleanLinks(input: EpisodeLink[]): EpisodeLink[] {
  const out: EpisodeLink[] = [];
  const seen = new Set<string>();
  for (const l of input) {
    const raw = l.url.trim();
    if (!raw) continue;
    const url = normalizeHttpUrl(raw);
    if (!url) throw new LinkValidationError(`リンク「${raw.slice(0, 40)}」は http:// か https:// で始まる URL にしてください。`);
    if (seen.has(url)) continue;
    seen.add(url);
    const label = (l.label ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LINK_LABEL);
    out.push(label ? { url, label } : { url });
  }
  if (out.length > MAX_LINKS) throw new LinkValidationError(`リンクは${MAX_LINKS}件までです。`);
  return out;
}

/** 古いデータ（links なし）でも安全に読むため */
export function linksOf(log: { links?: EpisodeLink[] }): EpisodeLink[] {
  return Array.isArray(log.links) ? log.links.filter((l) => l && isSafeHttpUrl(l.url)) : [];
}
