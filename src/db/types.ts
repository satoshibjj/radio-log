/** IndexedDB に保存するレコード型（仕様 4章） */

export interface Program {
  id: string;
  name: string;
  station: string;
  defaultPersonIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeLog {
  id: string;
  programId: string;
  /** YYYY-MM-DD */
  broadcastDate: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type AppearanceRole = 'regular' | 'guest';

export interface EpisodeAppearance {
  id: string;
  episodeLogId: string;
  personId: string;
  role: AppearanceRole;
  sortOrder: number;
}

/** 全ストアのスナップショット（画面表示用にメモリへ読み込む） */
export interface DataSnapshot {
  programs: Program[];
  persons: Person[];
  episodeLogs: EpisodeLog[];
  episodeAppearances: EpisodeAppearance[];
}

/** S5 保存時の入力 */
export interface AppearanceInput {
  personId: string;
  role: AppearanceRole;
}

export interface EpisodeLogInput {
  id?: string;
  programId: string;
  broadcastDate: string;
  memo: string;
  appearances: AppearanceInput[];
}

export interface ProgramInput {
  id?: string;
  name: string;
  station: string;
  defaultPersonIds: string[];
}

export interface PersonInput {
  id?: string;
  name: string;
  aliases: string[];
}
