/**
 * 出演者欄に入力されたまま（候補を選ばずに）保存ボタンが押された名前を、出演者として確定する。
 * 名前・別名が一致する人物がいればその人、いなければ新しい人物として登録する。
 */
import { savePerson } from '../db/repo';
import type { Person } from '../db/types';
import { cleanName, normalizeForSearch } from './util';

export function findPersonByName(persons: Person[], name: string): Person | undefined {
  const n = normalizeForSearch(name);
  if (!n) return undefined;
  return (
    persons.find((p) => normalizeForSearch(p.name) === n) ??
    persons.find((p) => p.aliases.some((a) => normalizeForSearch(a) === n))
  );
}

/** 入力途中の名前を人物 ID にする。空なら null。created は新規作成したかどうか */
export async function resolvePendingPerson(
  text: string,
  persons: Person[],
): Promise<{ personId: string; name: string; created: boolean } | null> {
  const name = cleanName(text);
  if (!name) return null;
  const existing = findPersonByName(persons, name);
  if (existing) return { personId: existing.id, name: existing.name, created: false };
  const p = await savePerson({ name, aliases: [] });
  return { personId: p.id, name: p.name, created: true };
}
