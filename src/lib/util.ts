/** 汎用ユーティリティ */

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 非セキュアコンテキスト等のフォールバック（RFC4122 v4 形式）
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** ローカルタイムゾーンでの今日 YYYY-MM-DD */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 実在する日付の YYYY-MM-DD か */
export function isValidYmd(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 2026-11-26 → 2026.11.26 (木) */
export function formatYmd(s: string): string {
  if (!isValidYmd(s)) return s;
  const [y, m, d] = s.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`;
}

/** 前後空白トリム＋連続空白を1つに */
export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 別名リストの正規化：トリム・空文字除外・重複除外（表示名と同じものも除外） */
export function cleanAliases(aliases: string[], name = ''): string[] {
  const out: string[] = [];
  const seen = new Set<string>([normalizeForSearch(name)]);
  for (const a of aliases) {
    const c = cleanName(a);
    if (!c) continue;
    const key = normalizeForSearch(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** 「、」「,」改行などで区切られた文字列を配列に */
export function splitAliasText(text: string): string[] {
  return text.split(/[,、，\n]/);
}

/**
 * 検索用の正規化：NFKC（全角英数→半角等）、小文字化、カタカナ→ひらがな、空白除去。
 * 例：「ＴＡＲＯ」「タロウ」「たろう」の表記ゆれを吸収
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function includesNormalized(haystack: string, needle: string): boolean {
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return normalizeForSearch(haystack).includes(n);
}

/** 検索の一致度（小さいほど良い。一致しなければ -1） */
export function matchRank(text: string, query: string): number {
  const t = normalizeForSearch(text);
  const q = normalizeForSearch(query);
  if (!q) return -1;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  return -1;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '不明なエラーが発生しました。';
}

/** 決定的な降順比較（放送日 → 作成日時 → id） */
export function compareLogsDesc(
  a: { broadcastDate: string; createdAt: string; id: string },
  b: { broadcastDate: string; createdAt: string; id: string },
): number {
  if (a.broadcastDate !== b.broadcastDate) return a.broadcastDate < b.broadcastDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
