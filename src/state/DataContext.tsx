import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSnapshot } from '../db/repo';
import type { DataSnapshot, EpisodeAppearance, Person, Program } from '../db/types';
import { errorMessage } from '../lib/util';

interface DataContextValue {
  data: DataSnapshot;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  programById: Map<string, Program>;
  personById: Map<string, Person>;
  /** episodeLogId → 出演（sortOrder 昇順） */
  appearancesByLog: Map<string, EpisodeAppearance[]>;
  /** programId → ログ件数 */
  logCountByProgram: Map<string, number>;
}

const EMPTY: DataSnapshot = { programs: [], persons: [], episodeLogs: [], episodeAppearances: [] };
const Ctx = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const snap = await loadSnapshot();
      setData(snap);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<DataContextValue>(() => {
    const programById = new Map(data.programs.map((p) => [p.id, p]));
    const personById = new Map(data.persons.map((p) => [p.id, p]));
    const appearancesByLog = new Map<string, EpisodeAppearance[]>();
    for (const a of data.episodeAppearances) {
      const list = appearancesByLog.get(a.episodeLogId);
      if (list) list.push(a);
      else appearancesByLog.set(a.episodeLogId, [a]);
    }
    for (const list of appearancesByLog.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    const logCountByProgram = new Map<string, number>();
    for (const l of data.episodeLogs) logCountByProgram.set(l.programId, (logCountByProgram.get(l.programId) ?? 0) + 1);
    return { data, loading, error, reload, programById, personById, appearancesByLog, logCountByProgram };
  }, [data, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used within DataProvider');
  return v;
}
