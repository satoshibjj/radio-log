import { useMemo, useState } from 'react';
import { useData } from '../state/DataContext';
import { isPlatform, PRESET_PLATFORMS, PRESET_STATIONS } from '../lib/stations';
import { normalizeForSearch } from '../lib/util';

const COLLAPSED_COUNT = 10;

interface Props {
  value: string;
  onChange: (station: string) => void;
}

/** 放送局・配信元のワンタップ選択（1段目：登録済みの局 → 主要ラジオ局、2段目：YouTube などの配信元） */
export function StationChips({ value, onChange }: Props) {
  const { data } = useData();
  const [expanded, setExpanded] = useState(false);

  const stations = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (s: string) => {
      const key = normalizeForSearch(s);
      if (!key || seen.has(key) || isPlatform(s)) return;
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

  const chip = (s: string) => {
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
  };

  return (
    <div className="station-chip-groups">
      <div className="chips station-chips" aria-label="ラジオ局を選択">
        {visible.map(chip)}
        {stations.length > visible.length && (
          <button type="button" className="chip chip-clear" onClick={() => setExpanded(true)}>
            もっと見る（{stations.length - visible.length}）
          </button>
        )}
      </div>
      <div className="chips station-chips platform-chips" aria-label="配信元を選択（ラジオ以外）">
        <span className="chips-label">配信</span>
        {PRESET_PLATFORMS.map(chip)}
      </div>
    </div>
  );
}
