/**
 * タグ（カテゴリ）：回ごとに自由に付ける（スキーマ v3）。例：神回・企画回・ゲスト回
 */
import { normalizeForSearch } from './util';

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 20;
export const NO_TAG_LABEL = 'タグなし';

/** 1つのタグを整える（前後の空白・先頭の # を除き、連続空白を1つに） */
export function cleanTag(s: string): string {
  return s
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/^[#＃\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class TagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TagValidationError';
  }
}

/** 保存用：空を除き、表記ゆれ込みで重複を除き、上限を確認 */
export function cleanTags(input: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = cleanTag(raw);
    if (!t) continue;
    if (t.length > MAX_TAG_LENGTH) throw new TagValidationError(`タグ「${t.slice(0, 20)}…」が長すぎます（${MAX_TAG_LENGTH}文字まで）。`);
    const key = normalizeForSearch(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (out.length > MAX_TAGS) throw new TagValidationError(`タグは${MAX_TAGS}個までです。`);
  return out;
}

/** 古いデータ（tags なし）でも安全に読む */
export function tagsOf(log: { tags?: string[] }): string[] {
  return Array.isArray(log.tags) ? log.tags.filter((t) => typeof t === 'string' && t) : [];
}

/** 登録済みのタグ一覧（使われている回数の多い順。表記ゆれは最初に出てきた表記にまとめる） */
export function collectTags(logs: { tags?: string[] }[]): { tag: string; count: number }[] {
  const map = new Map<string, { tag: string; count: number }>();
  for (const l of logs) {
    for (const t of tagsOf(l)) {
      const key = normalizeForSearch(t);
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { tag: t, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ja'));
}

export const sameTag = (a: string, b: string) => normalizeForSearch(a) === normalizeForSearch(b);
