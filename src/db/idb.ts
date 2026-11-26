/**
 * 型安全な最小 IndexedDB ラッパー。
 * 外部ライブラリ（idb）を使わず、ストア名とレコード型の対応を型で固定する。
 */
import type { EpisodeAppearance, EpisodeLog, Person, Program } from './types';

export const DB_NAME = 'radio_log_db';
/** スキーマを変更したら上げる（upgrade に移行処理を追加すること） */
export const DB_VERSION = 3;

export interface StoreMap {
  programs: Program;
  persons: Person;
  episodeLogs: EpisodeLog;
  episodeAppearances: EpisodeAppearance;
}
export type StoreName = keyof StoreMap;
export const STORE_NAMES: StoreName[] = ['programs', 'persons', 'episodeLogs', 'episodeAppearances'];

/** インデックス名 */
export const IDX = {
  logsByProgram: 'by_program',
  logsByProgramDate: 'by_program_date',
  logsByDate: 'by_date',
  appearancesByLog: 'by_log',
  appearancesByPerson: 'by_person',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase, oldVersion: number, tx: IDBTransaction | null): void {
  // v0 -> v1：初期スキーマ
  if (oldVersion < 1) {
    db.createObjectStore('programs', { keyPath: 'id' });
    db.createObjectStore('persons', { keyPath: 'id' });

    const logs = db.createObjectStore('episodeLogs', { keyPath: 'id' });
    logs.createIndex(IDX.logsByProgram, 'programId');
    logs.createIndex(IDX.logsByProgramDate, ['programId', 'broadcastDate']);
    logs.createIndex(IDX.logsByDate, 'broadcastDate');

    const apps = db.createObjectStore('episodeAppearances', { keyPath: 'id' });
    apps.createIndex(IDX.appearancesByLog, 'episodeLogId');
    apps.createIndex(IDX.appearancesByPerson, 'personId');
  }
  // v1 -> v2：回にリンク（links）を追加（放送日の空文字＝日付なしも許可）
  // v2 -> v3：回にタグ（tags）を追加
  // 既存の回に足りない項目を [] で入れる。v1 から一度に上げる場合も1回の走査で両方を入れる（同じ回を2回書き換えない）
  if (oldVersion >= 1 && oldVersion < 3 && tx) {
    const cursorReq = tx.objectStore('episodeLogs').openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const rec = cursor.value as Partial<EpisodeLog>;
      if (!Array.isArray(rec.links) || !Array.isArray(rec.tags)) {
        cursor.update({ ...rec, links: Array.isArray(rec.links) ? rec.links : [], tags: Array.isArray(rec.tags) ? rec.tags : [] });
      }
      cursor.continue();
    };
  }
  // 将来: if (oldVersion < 4) { ... }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('このブラウザは IndexedDB に対応していません。'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => upgrade(req.result, ev.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      // 別タブで新バージョンが開かれたら閉じて再接続に備える
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('データベースを開けませんでした。'));
    req.onblocked = () => reject(new Error('他のタブでアプリが開かれているため更新できません。他のタブを閉じてください。'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 型付きトランザクションハンドル */
export interface Tx {
  raw: IDBTransaction;
  store<N extends StoreName>(name: N): TypedStore<StoreMap[N]>;
}

export interface TypedStore<T> {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  getAllByIndex(index: string, query: IDBValidKey | IDBKeyRange): Promise<T[]>;
  countByIndex(index: string, query: IDBValidKey | IDBKeyRange): Promise<number>;
  put(value: T): Promise<void>;
  add(value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

function typedStore<T>(os: IDBObjectStore): TypedStore<T> {
  return {
    get: (key) => reqToPromise(os.get(key) as IDBRequest<T | undefined>),
    getAll: () => reqToPromise(os.getAll() as IDBRequest<T[]>),
    getAllByIndex: (index, query) => reqToPromise(os.index(index).getAll(query) as IDBRequest<T[]>),
    countByIndex: (index, query) => reqToPromise(os.index(index).count(query)),
    put: async (value) => {
      await reqToPromise(os.put(value));
    },
    add: async (value) => {
      await reqToPromise(os.add(value));
    },
    delete: async (key) => {
      await reqToPromise(os.delete(key));
    },
    clear: async () => {
      await reqToPromise(os.clear());
    },
  };
}

/**
 * 1つの IndexedDB トランザクション内で fn を実行する。
 * fn が例外を投げた場合はトランザクションを abort し、全変更を破棄する。
 * 注意: fn 内で IndexedDB 以外の非同期処理（fetch, setTimeout 等）を await しないこと
 * （トランザクションが自動コミットされてしまうため）。
 */
export async function withTx<R>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: Tx) => Promise<R>,
): Promise<R> {
  const db = await openDb();
  const raw = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    raw.oncomplete = () => resolve();
    raw.onabort = () => reject(raw.error ?? new Error('トランザクションが中断されました。'));
    raw.onerror = () => reject(raw.error ?? new Error('トランザクションでエラーが発生しました。'));
  });
  // abort 時の reject が未処理にならないように
  done.catch(() => undefined);

  const tx: Tx = {
    raw,
    store: <N extends StoreName>(name: N) => typedStore<StoreMap[N]>(raw.objectStore(name)),
  };

  let result: R;
  try {
    result = await fn(tx);
  } catch (err) {
    try {
      raw.abort();
    } catch {
      /* 既に終了している場合は無視 */
    }
    throw err;
  }
  await done;
  return result;
}
