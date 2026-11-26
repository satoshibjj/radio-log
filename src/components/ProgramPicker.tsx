import { useId, useMemo, useState } from 'react';
import type { Program } from '../db/types';
import type { PodcastResult } from '../lib/external';
import { matchRank, normalizeForSearch } from '../lib/util';
import { usePodcastSuggest } from './usePodcastSuggest';

const REGISTERED_LIMIT = 8;
const PODCAST_LIMIT = 6;

interface Props {
  programs: Program[];
  /** 入力欄の文字（選んだ登録済み番組の名前、または新しい番組名） */
  text: string;
  /** 選択中の登録済み番組（新しい番組なら ''） */
  programId: string;
  error?: string;
  /** 文字を打った（登録済みと同じ名前なら id、違えば ''） */
  onTextChange: (text: string, matchedId: string) => void;
  /** 登録済みの番組を選んだ */
  onPickRegistered: (id: string) => void;
  /** Apple Podcasts の候補を選んだ（登録済みに同名が無いもの） */
  onPickPodcast: (r: PodcastResult) => void;
}

/** 番組・チャンネル名の欄（回の追加）：登録済みの番組から選ぶか、手入力（Apple Podcasts の候補つき）で新しい番組を入れる */
export function ProgramPicker({ programs, text, programId, error, onTextChange, onPickRegistered, onPickPodcast }: Props) {
  const [focused, setFocused] = useState(false);
  /** 打った文字で候補を出す（画面を開いただけ・選んだ直後は Podcast を検索しない） */
  const [typed, setTyped] = useState(false);
  const listId = useId();
  const term = text.trim();
  const isUrl = /^\s*(https?:\/\/|www\.)/i.test(text);

  const findExact = (name: string) => {
    const n = normalizeForSearch(name);
    return n ? programs.find((p) => normalizeForSearch(p.name) === n) : undefined;
  };

  /** 登録済みの候補：空なら全件（名前順）、入力があれば一致するもの */
  const registered = useMemo(() => {
    if (!term) return [...programs].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return programs
      .map((p) => {
        const r1 = matchRank(p.name, term);
        const r2 = matchRank(p.station, term);
        const rank = r1 >= 0 ? r1 : r2 >= 0 ? r2 + 3 : -1;
        return { p, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name, 'ja'))
      .slice(0, REGISTERED_LIMIT)
      .map((x) => x.p);
  }, [programs, term]);

  const podcast = usePodcastSuggest(text, typed && !programId && !isUrl);
  const registeredKeys = useMemo(() => new Set(programs.map((p) => normalizeForSearch(p.name))), [programs]);
  const podcastShown = podcast.results.filter((r) => !registeredKeys.has(normalizeForSearch(r.name))).slice(0, PODCAST_LIMIT);

  const open = focused && (registered.length > 0 || podcast.enabled);
  const selected = programId ? programs.find((p) => p.id === programId) : undefined;
  const isNew = !programId && term !== '';

  const close = (el?: HTMLElement | null) => {
    setFocused(false);
    setTyped(false);
    el?.blur();
  };

  return (
    <div className="picker program-picker">
      <input
        id="lprogram"
        className={`input ${error ? 'has-error' : ''}`}
        value={text}
        placeholder="番組名を入力・選択（候補が出ます）"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={Boolean(error)}
        onFocus={() => setFocused(true)}
        onClick={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setTyped(true);
          setFocused(true);
          onTextChange(e.target.value, findExact(e.target.value)?.id ?? '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            close(e.target as HTMLInputElement);
          }
          if (e.key === 'Escape') close(e.target as HTMLInputElement);
        }}
      />
      {selected && (
        <p className="program-picked">
          <span className="program-picked-tag">登録済み</span>
          {selected.station && <span className="station-badge">{selected.station}</span>}
        </p>
      )}
      {isNew && !focused && !isUrl && (
        <p className="program-picked is-new">
          <span className="program-picked-tag">新しい番組</span>保存するときに番組としても登録されます
        </p>
      )}
      {open && (
        <ul id={listId} className="suggest program-suggest" role="listbox" aria-label="番組の候補">
          {registered.length > 0 && <li className="suggest-head">{term ? '登録済みの番組' : '登録済みの番組（タップで選ぶ）'}</li>}
          {registered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`suggest-item ${p.id === programId ? 'is-current' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickRegistered(p.id);
                  close();
                }}
              >
                <span>{p.name}</span>
                {p.station && <span className="suggest-via">{p.station}</span>}
              </button>
            </li>
          ))}
          {podcast.enabled && (
            <>
              <li className="suggest-head">Apple Podcasts の候補（タップで入力）</li>
              {podcast.loading && <li className="suggest-empty">候補を検索中…</li>}
              {!podcast.loading && podcast.error && <li className="suggest-empty">{podcast.error}</li>}
              {!podcast.loading &&
                podcastShown.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onPickPodcast(r);
                        close();
                      }}
                    >
                      <span>{r.name}</span>
                      {r.artist && <span className="suggest-via">{r.artist}</span>}
                    </button>
                  </li>
                ))}
              {!podcast.loading && !podcast.error && podcastShown.length === 0 && (
                <li className="suggest-empty">Podcast の候補なし（radiko のみ・Spotify 独占などは出ません）</li>
              )}
            </>
          )}
          {isNew && (
            <li>
              <button
                type="button"
                className="suggest-item suggest-create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => close()}
              >
                ＋「{term}」を新しい番組として入れる
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
