import { useMemo, useState } from 'react';
import { useData } from '../state/DataContext';
import { PRESET_STATIONS } from '../lib/stations';
import { normalizeForSearch } from '../lib/util';

const COLLAPSED_COUNT = 10;

interface Props {
  value: string;
  onChange: (station: string) => void;
}

/** 放送局のワンタップ選択（登録済みの局 → 主要局の順） */
export function StationChips({ value, onChange }: Props) {
  const { data } = useData();
  const [expanded, setExpanded] = useState(false);

  const stations = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (s: string) => {
      const key = normalizeForSearch(s);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };
    // 登録済みの局（使用回数の多い順）
    const count = new Map<string, number>();
    for (const p of data.programs) if (p.station.trim()) count.set(p.station, (count.get(p.station) ?? 0) + 1);
    [...count.entries()].sort((a, b) => b[1] - a[1]).forEach(([s]) => add(s));
    PRESET_STATIONS.forEach(add);
    return out;
  }, [data.programs]);

  const current = normalizeForSearch(value);
  const selectedIndex = stations.findIndex((s) => normalizeForSearch(s) === current);
  const visible = expanded ? stations : stations.slice(0, Math.max(COLLAPSED_COUNT, selectedIndex + 1));

  return (
    <div className="chips station-chips" aria-label="放送局を選択">
      {visible.map((s) => {
        const selected = normalizeForSearch(s) === current;
        return (
          <button
            key={s}
            type="button"
            className={`chip ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onChange(selected ? '' : s)}
          >
            {s}
          </button>
        );
      })}
      {stations.length > visible.length && (
        <button type="button" className="chip chip-clear" onClick={() => setExpanded(true)}>
          もっと見る（{stations.length - visible.length}）
        </button>
      )}
    </div>
  );
}
