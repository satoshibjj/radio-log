/**
 * データアクセス層。整合性が必要な操作はすべて1トランザクションで実行する。
 */
import { IDX, STORE_NAMES, withTx } from './idb';
import type {
  DataSnapshot,
  EpisodeAppearance,
  EpisodeLog,
  EpisodeLogInput,
  Person,
  PersonInput,
  Program,
  ProgramInput,
} from './types';
import { cleanAliases, cleanName, isValidLogDate, newId, normalizeForSearch, nowIso } from '../lib/util';
import { cleanLinks, LinkValidationError } from '../lib/links';

/** ユーザーに見せる前提のエラー */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export interface PersonUsage {
  /** 基本パーソナリティとして登録している番組名 */
  defaultOfPrograms: string[];
  /** 出演ログ件数（合計） */
  logCount: number;
  /** 番組別の出演ログ件数 */
  logsByProgram: { programName: string; count: number }[];
}

export class PersonInUseError extends AppError {
  constructor(
    public readonly personName: string,
    public readonly usage: PersonUsage,
  ) {
    super(`「${personName}」は参照されているため削除できません。`);
    this.name = 'PersonInUseError';
  }
}

export class ProgramInUseError extends AppError {
  constructor(
    public readonly programName: string,
    public readonly logCount: number,
  ) {
    super(`「${programName}」にはリピート回が${logCount}件記録されているため削除できません。先にリピート回を削除してください。`);
    this.name = 'ProgramInUseError';
  }
}

// ---------------------------------------------------------------- 読み込み

export function loadSnapshot(): Promise<DataSnapshot> {
  return withTx(STORE_NAMES, 'readonly', async (tx) => {
    const [programs, persons, episodeLogs, episodeAppearances] = await Promise.all([
      tx.store('programs').getAll(),
      tx.store('persons').getAll(),
      tx.store('episodeLogs').getAll(),
      tx.store('episodeAppearances').getAll(),
    ]);
    return { programs, persons, episodeLogs, episodeAppearances };
  });
}

/** 同一番組・同一放送日のログ（excludeId は除外）。日付なしの場合は重複確認しない（常に空） */
export function findSameDayLogs(programId: string, broadcastDate: string, excludeId?: string): Promise<EpisodeLog[]> {
  if (!broadcastDate) return Promise.resolve([]);
  return withTx(['episodeLogs'], 'readonly', async (tx) => {
    const list = await tx.store('episodeLogs').getAllByIndex(IDX.logsByProgramDate, [programId, broadcastDate]);
    return list.filter((l) => l.id !== excludeId);
  });
}

// ---------------------------------------------------------------- 番組

export function saveProgram(input: ProgramInput): Promise<Program> {
  const name = cleanName(input.name);
  if (!name) return Promise.reject(new AppError('番組名を入力してください。'));
  const station = cleanName(input.station);
  const defaultPersonIds = Array.from(new Set(input.defaultPersonIds));

  return withTx(['programs', 'persons'], 'readwrite', async (tx) => {
    for (const pid of defaultPersonIds) {
      if (!(await tx.store('persons').get(pid))) throw new AppError('存在しない人物が含まれています。画面を再読み込みしてください。');
    }
    const now = nowIso();
    const existing = input.id ? await tx.store('programs').get(input.id) : undefined;
    if (input.id && !existing) throw new AppError('番組が見つかりません（削除された可能性があります）。');
    const program: Program = {
      id: existing?.id ?? newId(),
      name,
      station,
      defaultPersonIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.store('programs').put(program);
    return program;
  });
}

export function deleteProgram(id: string): Promise<void> {
  return withTx(['programs', 'episodeLogs'], 'readwrite', async (tx) => {
    const program = await tx.store('programs').get(id);
    if (!program) return;
    const count = await tx.store('episodeLogs').countByIndex(IDX.logsByProgram, id);
    if (count > 0) throw new ProgramInUseError(program.name, count);
    await tx.store('programs').delete(id);
  });
}

// ---------------------------------------------------------------- 人物

export function savePerson(input: PersonInput): Promise<Person> {
  const name = cleanName(input.name);
  if (!name) return Promise.reject(new AppError('名前を入力してください。'));
  const aliases = cleanAliases(input.aliases, name);

  return withTx(['persons'], 'readwrite', async (tx) => {
    const now = nowIso();
    const existing = input.id ? await tx.store('persons').get(input.id) : undefined;
    if (input.id && !existing) throw new AppError('人物が見つかりません（削除された可能性があります）。');
    const person: Person = {
      id: existing?.id ?? newId(),
      name,
      aliases,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.store('persons').put(person);
    return person;
  });
}

/** 参照状況を調べ、参照があれば PersonInUseError。なければ同一トランザクションで削除。 */
export function deletePerson(id: string): Promise<void> {
  return withTx(['persons', 'programs', 'episodeLogs', 'episodeAppearances'], 'readwrite', async (tx) => {
    const person = await tx.store('persons').get(id);
    if (!person) return;

    const programs = await tx.store('programs').getAll();
    const programName = new Map(programs.map((p) => [p.id, p.name]));
    const defaultOfPrograms = programs.filter((p) => p.defaultPersonIds.includes(id)).map((p) => p.name);

    const apps = await tx.store('episodeAppearances').getAllByIndex(IDX.appearancesByPerson, id);
    const logIds = Array.from(new Set(apps.map((a) => a.episodeLogId)));
    const perProgram = new Map<string, number>();
    for (const logId of logIds) {
      const log = await tx.store('episodeLogs').get(logId);
      const pname = log ? (programName.get(log.programId) ?? '（不明な番組）') : '（不明なログ）';
      perProgram.set(pname, (perProgram.get(pname) ?? 0) + 1);
    }

    if (defaultOfPrograms.length > 0 || logIds.length > 0) {
      throw new PersonInUseError(person.name, {
        defaultOfPrograms,
        logCount: logIds.length,
        logsByProgram: Array.from(perProgram, ([name, count]) => ({ programName: name, count })).sort(
          (a, b) => b.count - a.count,
        ),
      });
    }
    await tx.store('persons').delete(id);
  });
}

// ---------------------------------------------------------------- 聴取ログ

/** episodeLogs と episodeAppearances を1トランザクションで保存 */
export function saveEpisodeLog(input: EpisodeLogInput): Promise<EpisodeLog & { createdProgram?: Program }> {
  const newProgramName = input.newProgram ? cleanName(input.newProgram.name) : '';
  if (!input.programId && !newProgramName) return Promise.reject(new AppError('番組を選ぶか、番組名を入力してください。'));
  if (!isValidLogDate(input.broadcastDate)) return Promise.reject(new AppError('放送・配信日を正しく入力してください。'));
  let links: EpisodeLog['links'];
  try {
    links = cleanLinks(input.links);
  } catch (err) {
    return Promise.reject(new AppError(err instanceof LinkValidationError ? err.message : 'リンクが正しくありません。'));
  }

  // 同一人物の重複は先勝ちで除外
  const seen = new Set<string>();
  const appearances = input.appearances.filter((a) => {
    if (seen.has(a.personId)) return false;
    seen.add(a.personId);
    return true;
  });

  return withTx(['episodeLogs', 'episodeAppearances', 'programs', 'persons'], 'readwrite', async (tx) => {
    let programId = input.programId;
    let createdProgram: Program | undefined;
    if (!programId) {
      // 手入力の番組：同じ名前（表記ゆれ込み）が既にあればそれを使い、なければ新しく登録
      const key = normalizeForSearch(newProgramName);
      const same = (await tx.store('programs').getAll()).find((p) => normalizeForSearch(p.name) === key);
      if (same) programId = same.id;
      else {
        const t = nowIso();
        createdProgram = {
          id: newId(),
          name: newProgramName,
          station: cleanName(input.newProgram?.station ?? ''),
          defaultPersonIds: [],
          createdAt: t,
          updatedAt: t,
        };
        await tx.store('programs').add(createdProgram);
        programId = createdProgram.id;
      }
    } else if (!(await tx.store('programs').get(programId))) throw new AppError('選択した番組が見つかりません。');
    for (const a of appearances) {
      if (!(await tx.store('persons').get(a.personId))) throw new AppError('存在しない人物が含まれています。');
    }

    const now = nowIso();
    const existing = input.id ? await tx.store('episodeLogs').get(input.id) : undefined;
    if (input.id && !existing) throw new AppError('リピート回が見つかりません（削除された可能性があります）。');

    const log: EpisodeLog = {
      id: existing?.id ?? newId(),
      programId,
      broadcastDate: input.broadcastDate,
      memo: input.memo.replace(/\s+$/, ''),
      links,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.store('episodeLogs').put(log);

    const appStore = tx.store('episodeAppearances');
    const old = await appStore.getAllByIndex(IDX.appearancesByLog, log.id);
    for (const o of old) await appStore.delete(o.id);
    let order = 0;
    for (const a of appearances) {
      const rec: EpisodeAppearance = {
        id: newId(),
        episodeLogId: log.id,
        personId: a.personId,
        role: a.role,
        sortOrder: order++,
      };
      await appStore.add(rec);
    }
    return createdProgram ? { ...log, createdProgram } : log;
  });
}

/** ログ削除：episodeLogs と紐づく episodeAppearances を同一トランザクションで削除 */
export function deleteEpisodeLog(id: string): Promise<void> {
  return withTx(['episodeLogs', 'episodeAppearances'], 'readwrite', async (tx) => {
    const appStore = tx.store('episodeAppearances');
    const apps = await appStore.getAllByIndex(IDX.appearancesByLog, id);
    for (const a of apps) await appStore.delete(a.id);
    await tx.store('episodeLogs').delete(id);
  });
}

// ---------------------------------------------------------------- 一括置き換え（インポート）

/** 全ストアを消去して data で置き換える。1トランザクションのため途中失敗時は元データが残る。 */
export function replaceAllData(data: DataSnapshot): Promise<void> {
  return withTx(STORE_NAMES, 'readwrite', async (tx) => {
    for (const name of STORE_NAMES) await tx.store(name).clear();
    for (const r of data.programs) await tx.store('programs').add(r);
    for (const r of data.persons) await tx.store('persons').add(r);
    for (const r of data.episodeLogs) await tx.store('episodeLogs').add(r);
    for (const r of data.episodeAppearances) await tx.store('episodeAppearances').add(r);
  });
}

// ---------------------------------------------------------------- シェアされたリストの取り込み（★3）

/** 取り込む1回分（受け取ったリストを検証済みのもの） */
export interface SharedEpisodeInput {
  programName: string;
  station: string;
  broadcastDate: string;
  cast: { name: string; role: 'regular' | 'guest' }[];
  links: EpisodeLog['links'];
  memo: string;
}

export interface SharedImportResult {
  logIds: string[];
  /** 新しく作った番組・人物の名前 */
  newPrograms: string[];
  newPersons: string[];
}

const sameName = (a: string, b: string) => {
  const x = normalizeForSearch(a);
  return x !== '' && x === normalizeForSearch(b);
};

/**
 * シェアされた回を自分のリピート帳に入れる（全件を1トランザクションで。途中で失敗したら何も入らない）。
 * 番組は名前で、出演者は名前・別名で照合し、あれば再利用、なければ新しく作る。
 * 同じ番組・同じ放送日の確認は呼び出し側（画面）で行う。
 */
export async function importSharedEpisodes(inputs: SharedEpisodeInput[]): Promise<SharedImportResult> {
  // 先に検証（トランザクションの外で）
  const prepared = inputs.map((it) => {
    const programName = cleanName(it.programName);
    if (!programName) throw new AppError('番組名が空の回があります。');
    if (!isValidLogDate(it.broadcastDate)) throw new AppError('放送日が正しくない回があります。');
    let links: EpisodeLog['links'];
    try {
      links = cleanLinks(it.links);
    } catch (err) {
      throw new AppError(err instanceof LinkValidationError ? err.message : 'リンクが正しくありません。');
    }
    return { ...it, programName, station: cleanName(it.station), links };
  });

  return withTx(['programs', 'persons', 'episodeLogs', 'episodeAppearances'], 'readwrite', async (tx) => {
    const programs = await tx.store('programs').getAll();
    const persons = await tx.store('persons').getAll();
    const result: SharedImportResult = { logIds: [], newPrograms: [], newPersons: [] };
    const now = nowIso();

    for (const it of prepared) {
      let program = programs.find((p) => sameName(p.name, it.programName));
      if (!program) {
        program = { id: newId(), name: it.programName, station: it.station, defaultPersonIds: [], createdAt: now, updatedAt: now };
        await tx.store('programs').add(program);
        programs.push(program);
        result.newPrograms.push(program.name);
      }

      const personIds: { personId: string; role: 'regular' | 'guest' }[] = [];
      for (const c of it.cast) {
        const name = cleanName(c.name);
        if (!name) continue;
        let person =
          persons.find((p) => sameName(p.name, name)) ?? persons.find((p) => p.aliases.some((a) => sameName(a, name)));
        if (!person) {
          person = { id: newId(), name, aliases: [], createdAt: now, updatedAt: now };
          await tx.store('persons').add(person);
          persons.push(person);
          result.newPersons.push(person.name);
        }
        if (!personIds.some((x) => x.personId === person.id)) personIds.push({ personId: person.id, role: c.role });
      }

      const log: EpisodeLog = {
        id: newId(),
        programId: program.id,
        broadcastDate: it.broadcastDate,
        memo: it.memo.replace(/\s+$/, ''),
        links: it.links,
        createdAt: now,
        updatedAt: now,
      };
      await tx.store('episodeLogs').add(log);
      let order = 0;
      for (const a of personIds) {
        await tx.store('episodeAppearances').add({ id: newId(), episodeLogId: log.id, personId: a.personId, role: a.role, sortOrder: order++ });
      }
      result.logIds.push(log.id);
    }
    return result;
  });
}
