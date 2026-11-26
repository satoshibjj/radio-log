/**
 * リスト共有（★3・R4）：選んだ回（最大10件）をリンクの # 以降に入れて送る。サーバー不要。
 *
 * リンクの形：  https://…/radio-log/#/shared/<token>
 *   token = "1" (形式バージョン) + "z"（deflate-raw 圧縮）| "j"（無圧縮） + base64url(UTF-8 JSON)
 * # 以降はサーバーに送られないため、GitHub Pages にも中身は渡らない。
 *
 * 受け取ったデータは他人が作ったものとして厳しく検証する（件数・文字数・日付・URL は http/https のみ・制御文字なし）。
 * 1か所でも不正があればリスト全体を読み込まない。
 */
import type { EpisodeLink } from '../db/types';
import { isSafeHttpUrl, MAX_LINK_LABEL, MAX_LINKS, MAX_URL_LENGTH } from './links';
import { cleanName, isValidLogDate } from './util';

export const SHARE_FORMAT_VERSION = 1;
export const SHARE_KIND = 'radio-log-shared-list';
/** 一度に送れる回の数 */
export const SHARE_MAX_ITEMS = 10;
/** メモの上限（送る側はこれに収まるように切る） */
export const SHARE_MEMO_MAX = 200;
export const SHARE_PROGRAM_MAX = 100;
export const SHARE_STATION_MAX = 50;
export const SHARE_PERSON_MAX = 50;
export const SHARE_CAST_MAX = 20;
/** これより長いリンクは LINE 等で送れないことがあるので注意を出す */
export const SHARE_LONG_URL = 4000;
/** 受け取る token の上限（文字数）と、展開後の上限（バイト） */
const MAX_TOKEN_LENGTH = 100_000;
const MAX_JSON_BYTES = 200_000;

export interface SharedCast {
  name: string;
  role: 'regular' | 'guest';
}

/** 共有される1回分（受け取り側で使う形） */
export interface SharedItem {
  programName: string;
  station: string;
  /** YYYY-MM-DD または ''（日付なし） */
  broadcastDate: string;
  cast: SharedCast[];
  links: EpisodeLink[];
  memo: string;
}

export interface SharedList {
  items: SharedItem[];
  /** 送る時にメモを含めたか */
  hasMemo: boolean;
}

/** リンクに入れる JSON（キーを短くして長さを抑える） */
interface WireItem {
  p: string;
  s?: string;
  d: string;
  c?: [string, 'r' | 'g'][];
  l?: [string, string?][];
  m?: string;
}
interface WirePayload {
  k: typeof SHARE_KIND;
  v: number;
  items: WireItem[];
}

export class SharedListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedListError';
  }
}

// ---------------------------------------------------------------- 送る側

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** 制御文字・文字の向きを変える特殊文字を除く（メモの改行・タブは残す） */
const stripUnsafe = (s: string, keepNewline = false) =>
  s.replace(keepNewline ? /[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, '');

/** 送る内容を作る（文字数は上限に収まるように切る）。includeMemo=false ならメモを入れない */
export function buildSharedList(items: SharedItem[], includeMemo: boolean): SharedList {
  if (items.length === 0) throw new SharedListError('シェアする回を選んでください。');
  if (items.length > SHARE_MAX_ITEMS) throw new SharedListError(`シェアできるのは${SHARE_MAX_ITEMS}件までです。`);
  return {
    hasMemo: includeMemo,
    items: items.map((it) => ({
      programName: cut(cleanName(stripUnsafe(it.programName)), SHARE_PROGRAM_MAX),
      station: cut(cleanName(stripUnsafe(it.station)), SHARE_STATION_MAX),
      broadcastDate: it.broadcastDate,
      cast: it.cast
        .map((c) => ({ name: cut(cleanName(stripUnsafe(c.name)), SHARE_PERSON_MAX), role: c.role }))
        .filter((c) => c.name)
        .slice(0, SHARE_CAST_MAX),
      links: it.links.filter((l) => isSafeHttpUrl(l.url) && l.url.length <= MAX_URL_LENGTH).slice(0, MAX_LINKS).map((l) => {
        const label = l.label ? cut(cleanName(stripUnsafe(l.label)), MAX_LINK_LABEL) : '';
        return label ? { url: l.url, label } : { url: l.url };
      }),
      memo: includeMemo ? cut(stripUnsafe(it.memo, true).trim(), SHARE_MEMO_MAX) : '',
    })),
  };
}

function toWire(list: SharedList): WirePayload {
  return {
    k: SHARE_KIND,
    v: SHARE_FORMAT_VERSION,
    items: list.items.map((it) => {
      const w: WireItem = { p: it.programName, d: it.broadcastDate };
      if (it.station) w.s = it.station;
      if (it.cast.length) w.c = it.cast.map((c) => [c.name, c.role === 'guest' ? 'g' : 'r']);
      if (it.links.length) w.l = it.links.map((l) => (l.label ? [l.url, l.label] : [l.url]));
      if (it.memo) w.m = it.memo;
      return w;
    }),
  };
}

/** ファイルで送るときの中身（JSON テキスト） */
export function sharedListToFileText(list: SharedList): string {
  return JSON.stringify(toWire(list));
}

// ---------------------------------------------------------------- base64url / 圧縮

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new SharedListError('リンクの文字が正しくありません（途中で切れているかもしれません）。');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new SharedListError('リンクの文字が正しくありません（途中で切れているかもしれません）。');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function streamToBytes(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new SharedListError('リストが大きすぎるため読み込めません。');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return streamToBytes(stream as ReadableStream<Uint8Array>, Number.MAX_SAFE_INTEGER);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (!canCompress()) throw new SharedListError('このブラウザは圧縮されたリンクに対応していません。ブラウザを最新にしてお試しください。');
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await streamToBytes(stream as ReadableStream<Uint8Array>, MAX_JSON_BYTES);
  } catch (err) {
    if (err instanceof SharedListError) throw err;
    throw new SharedListError('リンクを読み取れませんでした（途中で切れているかもしれません）。');
  }
}

/** リンク用の token を作る（圧縮できれば圧縮） */
export async function encodeSharedList(list: SharedList): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(toWire(list)));
  if (canCompress()) {
    try {
      return `${SHARE_FORMAT_VERSION}z${bytesToBase64Url(await deflate(raw))}`;
    } catch {
      /* 圧縮に失敗したら無圧縮 */
    }
  }
  return `${SHARE_FORMAT_VERSION}j${bytesToBase64Url(raw)}`;
}

/** 共有リンクの URL（今開いているアプリの URL を元に作る） */
export function sharedListUrl(token: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/shared/${token}`;
}

/** token を読み取り、検証済みのリストを返す。不正なら SharedListError */
export async function decodeSharedList(token: string): Promise<SharedList> {
  const t = token.trim();
  if (!t) throw new SharedListError('リストが空です。');
  if (t.length > MAX_TOKEN_LENGTH) throw new SharedListError('リンクが長すぎるため読み込めません。');
  const version = t[0];
  const mode = t[1];
  if (version !== String(SHARE_FORMAT_VERSION)) {
    throw new SharedListError(/^[0-9]$/.test(version) && Number(version) > SHARE_FORMAT_VERSION
      ? 'このアプリより新しい形式のリンクです。アプリを更新してから開いてください。'
      : 'Radio Log のシェアリンクではないようです。');
  }
  if (mode !== 'z' && mode !== 'j') throw new SharedListError('Radio Log のシェアリンクではないようです。');
  let bytes = base64UrlToBytes(t.slice(2));
  if (mode === 'z') bytes = await inflate(bytes);
  if (bytes.length > MAX_JSON_BYTES) throw new SharedListError('リストが大きすぎるため読み込めません。');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SharedListError('リンクを読み取れませんでした（文字化けしています）。');
  }
  return parseSharedListText(text);
}

/** ファイルや展開済み JSON テキストから読み取る */
export function parseSharedListText(text: string): SharedList {
  if (text.length > MAX_JSON_BYTES) throw new SharedListError('リストが大きすぎるため読み込めません。');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SharedListError('リストを読み取れませんでした（形式が正しくありません）。');
  }
  return validateSharedPayload(json);
}

// ---------------------------------------------------------------- 検証（受け取る側）

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const UNSAFE = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/;
const UNSAFE_MEMO = /[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/;
const ALLOWED_ITEM_KEYS = new Set(['p', 's', 'd', 'c', 'l', 'm']);

/** 受け取った JSON を厳しく検証して SharedList にする */
export function validateSharedPayload(json: unknown): SharedList {
  const fail = (msg: string): never => {
    throw new SharedListError(`このリストは読み込めません：${msg}`);
  };
  if (!isObj(json) || json.k !== SHARE_KIND) return fail('Radio Log のシェアリストではありません。');
  if (typeof json.v !== 'number' || !Number.isInteger(json.v)) return fail('形式のバージョンが不正です。');
  if (json.v > SHARE_FORMAT_VERSION) {
    throw new SharedListError('このアプリより新しい形式のリストです。アプリを更新してから開いてください。');
  }
  if (json.v < 1) return fail('形式のバージョンが不正です。');
  const rawItems = json.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return fail('回が入っていません。');
  if (rawItems.length > SHARE_MAX_ITEMS) return fail(`回が${SHARE_MAX_ITEMS}件を超えています。`);

  const text = (v: unknown, max: number, label: string, opts: { required?: boolean; memo?: boolean } = {}): string => {
    if (v === undefined) return opts.required ? fail(`${label}がありません。`) : '';
    if (typeof v !== 'string') return fail(`${label}が文字列ではありません。`);
    if ((opts.memo ? UNSAFE_MEMO : UNSAFE).test(v)) return fail(`${label}に使えない文字が含まれています。`);
    if (v.length > max) return fail(`${label}が長すぎます（${max}文字まで）。`);
    const s = opts.memo ? v.trim() : cleanName(v);
    if (opts.required && !s) return fail(`${label}が空です。`);
    return s;
  };

  let hasMemo = false;
  const items: SharedItem[] = rawItems.map((r, i) => {
    const n = `${i + 1}件目の`;
    if (!isObj(r)) return fail(`${n}データが不正です。`);
    for (const key of Object.keys(r)) if (!ALLOWED_ITEM_KEYS.has(key)) fail(`${n}データに不明な項目があります。`);
    const programName = text(r.p, SHARE_PROGRAM_MAX, `${n}番組名`, { required: true });
    const station = text(r.s, SHARE_STATION_MAX, `${n}放送局`);
    if (!isValidLogDate(r.d)) return fail(`${n}放送日が不正です。`);
    const cast: SharedCast[] = [];
    if (r.c !== undefined) {
      if (!Array.isArray(r.c) || r.c.length > SHARE_CAST_MAX) return fail(`${n}出演者が不正です（${SHARE_CAST_MAX}人まで）。`);
      const seen = new Set<string>();
      for (const c of r.c) {
        if (!Array.isArray(c) || c.length !== 2 || (c[1] !== 'r' && c[1] !== 'g')) return fail(`${n}出演者が不正です。`);
        const name = text(c[0], SHARE_PERSON_MAX, `${n}出演者名`, { required: true });
        if (seen.has(name)) continue;
        seen.add(name);
        cast.push({ name, role: c[1] === 'g' ? 'guest' : 'regular' });
      }
    }
    const links: EpisodeLink[] = [];
    if (r.l !== undefined) {
      if (!Array.isArray(r.l) || r.l.length > MAX_LINKS) return fail(`${n}リンクが不正です（${MAX_LINKS}件まで）。`);
      for (const l of r.l) {
        if (!Array.isArray(l) || l.length < 1 || l.length > 2) return fail(`${n}リンクが不正です。`);
        const url = l[0];
        if (typeof url !== 'string' || url.length > MAX_URL_LENGTH || UNSAFE.test(url) || !isSafeHttpUrl(url)) {
          return fail(`${n}リンクが http(s) の URL ではありません。`);
        }
        const label = text(l[1], MAX_LINK_LABEL, `${n}リンクの表示名`);
        links.push(label ? { url, label } : { url });
      }
    }
    const memo = text(r.m, SHARE_MEMO_MAX, `${n}メモ`, { memo: true });
    if (memo) hasMemo = true;
    return { programName, station, broadcastDate: r.d, cast, links, memo };
  });
  return { items, hasMemo };
}
