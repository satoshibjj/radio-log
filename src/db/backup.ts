/**
 * JSON エクスポート / インポート（置き換え方式）
 */
import type { AppearanceRole, DataSnapshot, EpisodeAppearance, EpisodeLink, EpisodeLog, Person, Program } from './types';
import { DB_VERSION } from './idb';
import { isValidLogDate } from '../lib/util';
import { isSafeHttpUrl, MAX_LINK_LABEL, MAX_LINKS, MAX_URL_LENGTH } from '../lib/links';

export const APP_NAME = 'radio-log';
export const SCHEMA_VERSION = DB_VERSION;
/** 読み込める最も古い形式。v1（リンクなし・放送日必須）のファイルもそのまま取り込める */
export const MIN_SCHEMA_VERSION = 1;

export interface BackupFile extends DataSnapshot {
  appName: string;
  schemaVersion: number;
  exportedAt: string;
}

export function buildBackup(data: DataSnapshot): BackupFile {
  return {
    appName: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    programs: data.programs,
    persons: data.persons,
    episodeLogs: data.episodeLogs,
    episodeAppearances: data.episodeAppearances,
  };
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `radio-log-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

export function downloadJson(obj: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- バリデーション

export class BackupValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`インポートできないファイルです：\n${problems.slice(0, 8).join('\n')}${problems.length > 8 ? `\n…ほか${problems.length - 8}件` : ''}`);
    this.name = 'BackupValidationError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isIsoLike = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));

/** 受け取った JSON を検証し、正規化したスナップショットを返す。問題があれば BackupValidationError。 */
export function validateBackup(json: unknown): { data: DataSnapshot; meta: { exportedAt: string; schemaVersion: number } } {
  const problems: string[] = [];
  if (!isObj(json)) throw new BackupValidationError(['JSONのトップレベルがオブジェクトではありません。']);

  if (json.appName !== APP_NAME) problems.push(`appName が "${APP_NAME}" ではありません。`);
  const sv = json.schemaVersion;
  if (typeof sv !== 'number' || !Number.isInteger(sv) || sv < MIN_SCHEMA_VERSION) problems.push('schemaVersion が不正です。');
  else if (sv > SCHEMA_VERSION) problems.push(`このアプリより新しい形式（schemaVersion ${sv}）です。アプリを更新してから再度お試しください。`);

  for (const key of ['programs', 'persons', 'episodeLogs', 'episodeAppearances'] as const) {
    if (!Array.isArray(json[key])) problems.push(`${key} が配列ではありません。`);
  }
  if (problems.length) throw new BackupValidationError(problems);

  const programs: Program[] = [];
  const persons: Person[] = [];
  const episodeLogs: EpisodeLog[] = [];
  const episodeAppearances: EpisodeAppearance[] = [];
  const ids = { programs: new Set<string>(), persons: new Set<string>(), episodeLogs: new Set<string>(), episodeAppearances: new Set<string>() };

  const checkId = (store: keyof typeof ids, i: number, v: unknown): v is string => {
    if (!isNonEmptyStr(v)) {
      problems.push(`${store}[${i}].id が不正です。`);
      return false;
    }
    if (ids[store].has(v)) {
      problems.push(`${store}[${i}].id が重複しています。`);
      return false;
    }
    ids[store].add(v);
    return true;
  };

  (json.persons as unknown[]).forEach((r, i) => {
    if (!isObj(r)) return void problems.push(`persons[${i}] がオブジェクトではありません。`);
    if (!checkId('persons', i, r.id)) return;
    if (!isNonEmptyStr(r.name)) problems.push(`persons[${i}].name が空です。`);
    if (!isStrArray(r.aliases)) problems.push(`persons[${i}].aliases が文字列配列ではありません。`);
    if (!isIsoLike(r.createdAt) || !isIsoLike(r.updatedAt)) problems.push(`persons[${i}] の日時が不正です。`);
    persons.push({
      id: r.id as string,
      name: String(r.name ?? '').trim(),
      aliases: isStrArray(r.aliases) ? r.aliases : [],
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
    });
  });

  (json.programs as unknown[]).forEach((r, i) => {
    if (!isObj(r)) return void problems.push(`programs[${i}] がオブジェクトではありません。`);
    if (!checkId('programs', i, r.id)) return;
    if (!isNonEmptyStr(r.name)) problems.push(`programs[${i}].name が空です。`);
    if (!isStr(r.station)) problems.push(`programs[${i}].station が文字列ではありません。`);
    if (!isStrArray(r.defaultPersonIds)) problems.push(`programs[${i}].defaultPersonIds が文字列配列ではありません。`);
    else r.defaultPersonIds.forEach((pid) => {
      if (!ids.persons.has(pid)) problems.push(`programs[${i}].defaultPersonIds に存在しない人物ID（${pid}）があります。`);
    });
    if (!isIsoLike(r.createdAt) || !isIsoLike(r.updatedAt)) problems.push(`programs[${i}] の日時が不正です。`);
    programs.push({
      id: r.id as string,
      name: String(r.name ?? '').trim(),
      station: isStr(r.station) ? r.station : '',
      defaultPersonIds: isStrArray(r.defaultPersonIds) ? Array.from(new Set(r.defaultPersonIds)) : [],
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
    });
  });

  (json.episodeLogs as unknown[]).forEach((r, i) => {
    if (!isObj(r)) return void problems.push(`episodeLogs[${i}] がオブジェクトではありません。`);
    if (!checkId('episodeLogs', i, r.id)) return;
    if (!isStr(r.programId) || !ids.programs.has(r.programId)) problems.push(`episodeLogs[${i}].programId が存在しない番組を参照しています。`);
    // v1 は日付必須・v2 から空文字（日付なし）も可
    if (!isValidLogDate(r.broadcastDate) || (sv === 1 && r.broadcastDate === ''))
      problems.push(`episodeLogs[${i}].broadcastDate が YYYY-MM-DD 形式ではありません。`);
    if (!isStr(r.memo)) problems.push(`episodeLogs[${i}].memo が文字列ではありません。`);
    if (!isIsoLike(r.createdAt) || !isIsoLike(r.updatedAt)) problems.push(`episodeLogs[${i}] の日時が不正です。`);
    // links：v1 には無い（[] とみなす）。v2 は配列。
    const links: EpisodeLink[] = [];
    if (r.links !== undefined) {
      if (!Array.isArray(r.links)) problems.push(`episodeLogs[${i}].links が配列ではありません。`);
      else if (r.links.length > MAX_LINKS) problems.push(`episodeLogs[${i}].links が${MAX_LINKS}件を超えています。`);
      else
        r.links.forEach((l, j) => {
          if (!isObj(l) || !isSafeHttpUrl(l.url) || (l.url as string).length > MAX_URL_LENGTH)
            return void problems.push(`episodeLogs[${i}].links[${j}].url が http(s) の URL ではありません。`);
          if (l.label !== undefined && (!isStr(l.label) || l.label.length > MAX_LINK_LABEL))
            return void problems.push(`episodeLogs[${i}].links[${j}].label が不正です。`);
          links.push(isStr(l.label) && l.label.trim() ? { url: l.url as string, label: l.label.trim() } : { url: l.url as string });
        });
    }
    episodeLogs.push({
      id: r.id as string,
      programId: String(r.programId),
      broadcastDate: String(r.broadcastDate),
      memo: isStr(r.memo) ? r.memo : '',
      links,
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
    });
  });

  (json.episodeAppearances as unknown[]).forEach((r, i) => {
    if (!isObj(r)) return void problems.push(`episodeAppearances[${i}] がオブジェクトではありません。`);
    if (!checkId('episodeAppearances', i, r.id)) return;
    if (!isStr(r.episodeLogId) || !ids.episodeLogs.has(r.episodeLogId)) problems.push(`episodeAppearances[${i}].episodeLogId が存在しないログを参照しています。`);
    if (!isStr(r.personId) || !ids.persons.has(r.personId)) problems.push(`episodeAppearances[${i}].personId が存在しない人物を参照しています。`);
    if (r.role !== 'regular' && r.role !== 'guest') problems.push(`episodeAppearances[${i}].role が不正です。`);
    if (typeof r.sortOrder !== 'number' || !Number.isFinite(r.sortOrder)) problems.push(`episodeAppearances[${i}].sortOrder が数値ではありません。`);
    episodeAppearances.push({
      id: r.id as string,
      episodeLogId: String(r.episodeLogId),
      personId: String(r.personId),
      role: r.role as AppearanceRole,
      sortOrder: Number(r.sortOrder),
    });
  });

  if (problems.length) throw new BackupValidationError(problems);
  return {
    data: { programs, persons, episodeLogs, episodeAppearances },
    meta: { exportedAt: isStr(json.exportedAt) ? json.exportedAt : '', schemaVersion: sv as number },
  };
}
