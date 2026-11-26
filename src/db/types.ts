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

/** 聴ける・見られる場所のリンク（スキーマ v2） */
export interface EpisodeLink {
  /** http: / https: のみ */
  url: string;
  /** 表示名（任意。空ならサービス名を表示） */
  label?: string;
}

export interface EpisodeLog {
  id: string;
  programId: string;
  /** YYYY-MM-DD。空文字は「日付なし」（スキーマ v2 から） */
  broadcastDate: string;
  memo: string;
  /** 聴ける・見られる場所（スキーマ v2 から。v1 のデータは移行で []） */
  links: EpisodeLink[];
  /** タグ（カテゴリ。スキーマ v3 から。v1/v2 のデータは移行で []） */
  tags: string[];
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
  /** 登録済みの番組。newProgram を使う場合は '' */
  programId: string;
  /** 登録されていない番組を手入力した場合：回の保存と同じトランザクションで番組も登録する（同名があればそれを使う） */
  newProgram?: { name: string; station: string };
  /** 空文字なら日付なし */
  broadcastDate: string;
  memo: string;
  links: EpisodeLink[];
  tags: string[];
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
