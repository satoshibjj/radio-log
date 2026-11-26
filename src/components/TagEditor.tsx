import { useMemo, useState } from 'react';
import { cleanTag, MAX_TAG_LENGTH, MAX_TAGS, sameTag } from '../lib/tags';
import { includesNormalized } from '../lib/util';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** 登録済みのタグ（使われている回数の多い順） */
  known: string[];
  /** 入力欄に打ったまま（追加ボタンを押していない）の文字。保存時にタグとして足す */
  onPendingTextChange?: (text: string) => void;
}

const SUGGEST_LIMIT = 12;

/** タグ（カテゴリ）の入力：自由に打って追加、登録済みのタグはタップで追加 */
export function TagEditor({ tags, onChange, known, onPendingTextChange }: Props) {
  const [text, setText] = useState('');
  const full = tags.length >= MAX_TAGS;

  const setPending = (v: string) => {
    setText(v);
    onPendingTextChange?.(v);
  };

  const add = (raw: string) => {
    // 「、」「,」区切りでまとめて追加できる
    const parts = raw.split(/[,、，]/).map(cleanTag).filter(Boolean);
    const next = [...tags];
    for (const p of parts) {
      if (next.length >= MAX_TAGS) break;
      const t = p.slice(0, MAX_TAG_LENGTH);
      // 登録済みと同じ（表記ゆれ込み）なら登録済みの表記を使う
      const canonical = known.find((k) => sameTag(k, t)) ?? t;
      if (!next.some((x) => sameTag(x, canonical))) next.push(canonical);
    }
    onChange(next);
    setPending('');
  };

  const suggestions = useMemo(
    () => known.filter((k) => !tags.some((t) => sameTag(t, k)) && (!text.trim() || includesNormalized(k, text.trim()))).slice(0, SUGGEST_LIMIT),
    [known, tags, text],
  );

  return (
    <div className="tag-editor">
      {tags.length > 0 && (
        <div className="chips tag-selected" aria-label="付けたタグ">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="chip is-selected tag-chip"
              aria-label={`タグ「${t}」を外す`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
            >
              #{t} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {!full && (
        <div className="tag-input-row">
          <input
            id="ltag"
            className="input"
            value={text}
            maxLength={MAX_TAG_LENGTH * 3}
            placeholder="例：神回、企画回、ゲスト回"
            autoComplete="off"
            enterKeyHint="done"
            aria-label="タグを入力"
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (text.trim()) add(text);
              }
            }}
          />
          <button type="button" className="btn btn-small" disabled={!text.trim()} onClick={() => add(text)}>
            追加
          </button>
        </div>
      )}
      {full && <p className="field-hint">タグは{MAX_TAGS}個までです。</p>}
      {!full && suggestions.length > 0 && (
        <div className="chips tag-suggest" aria-label="登録済みのタグ">
          <span className="chips-label">登録済み</span>
          {suggestions.map((k) => (
            <button key={k} type="button" className="chip tag-chip" onClick={() => add(k)}>
              ＋ #{k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
