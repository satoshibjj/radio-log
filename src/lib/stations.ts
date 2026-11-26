import { normalizeForSearch } from './util';

/** 放送局のワンタップ選択用プリセット（主要局） */
export const PRESET_STATIONS: string[] = [
  'TBSラジオ',
  '文化放送',
  'ニッポン放送',
  'TOKYO FM',
  'J-WAVE',
  'interfm',
  'bayfm',
  'NACK5',
  'FMヨコハマ',
  'ラジオ日本',
  'NHKラジオ第1',
  'NHK-FM',
  'MBSラジオ',
  'ABCラジオ',
  'ラジオ大阪',
  'FM802',
  'FM COCOLO',
  'CBCラジオ',
  '東海ラジオ',
  'ZIP-FM',
  'HBCラジオ',
  'STVラジオ',
  'RKBラジオ',
  'KBCラジオ',
  'Podcast',
];


/** テキスト（Podcastの提供者名など）に含まれる放送局名を探す。登録済みの局を優先。 */
export function matchStation(text: string, usedStations: string[]): string | undefined {
  const t = normalizeForSearch(text);
  if (!t) return undefined;
  const candidates = [...usedStations, ...PRESET_STATIONS.filter((s) => s !== 'Podcast')]
    .filter((s) => normalizeForSearch(s).length >= 2)
    // 長い名前から（「NHK-FM」より「NHKラジオ第1」等を優先的に正しく判定するため）
    .sort((a, b) => normalizeForSearch(b).length - normalizeForSearch(a).length);
  return candidates.find((s) => t.includes(normalizeForSearch(s)));
}
