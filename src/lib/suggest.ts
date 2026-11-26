/**
 * 「よく出る人」候補のランキング（記録済みデータから自動学習）
 * - 同じ番組での出演回数
 * - いま選択中の人と一緒に出演した回数（コンビ・レギュラー陣）
 * - 全体での出演回数
 */
import type { EpisodeAppearance, EpisodeLog } from '../db/types';

interface RankInput {
  logs: EpisodeLog[];
  appearancesByLog: Map<string, EpisodeAppearance[]>;
  /** この番組での出演を重視 */
  programId?: string;
  /** 既に選んでいる人（候補から除外し、共演回数の計算に使う） */
  selectedIds: string[];
  /** 存在する人物のみに絞る */
  isValidPerson: (id: string) => boolean;
  limit?: number;
}

export function rankFrequentPersons({
  logs,
  appearancesByLog,
  programId,
  selectedIds,
  isValidPerson,
  limit = 8,
}: RankInput): string[] {
  const selected = new Set(selectedIds);
  const score = new Map<string, number>();
  const add = (id: string, v: number) => score.set(id, (score.get(id) ?? 0) + v);

  for (const log of logs) {
    const ids = (appearancesByLog.get(log.id) ?? []).map((a) => a.personId);
    const coCount = ids.filter((id) => selected.has(id)).length;
    const sameProgram = programId !== undefined && log.programId === programId;
    for (const id of ids) {
      if (selected.has(id)) continue;
      add(id, 1); // 全体の出演
      if (sameProgram) add(id, 3); // 同じ番組
      if (coCount > 0) add(id, 2 * coCount); // 選択中の人と共演
    }
  }

  return [...score.entries()]
    .filter(([id]) => isValidPerson(id))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([id]) => id);
}

/** personId → 出演回数 */
export function appearanceCounts(appearances: EpisodeAppearance[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of appearances) m.set(a.personId, (m.get(a.personId) ?? 0) + 1);
  return m;
}
