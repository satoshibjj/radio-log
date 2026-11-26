import { useId, useState } from 'react';

export interface SuggestItem {
  key: string;
  label: string;
  /** 補足（放送局・別名など） */
  sub?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  items: SuggestItem[];
  onPick: (key: string) => void;
  placeholder?: string;
  ariaLabel: string;
  /** 候補リストの見出し */
  heading?: string;
}

/** 入力中に候補を表示する検索欄（一覧の絞り込みと併用） */
export function SuggestInput({ value, onChange, items, onPick, placeholder, ariaLabel, heading = '候補' }: Props) {
  const [focused, setFocused] = useState(false);
  const listId = useId();
  const open = focused && value.trim() !== '' && items.length > 0;

  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            onPick(items[0].key);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      {open && (
        <ul id={listId} className="suggest" role="listbox" aria-label={heading}>
          <li className="suggest-head">{heading}</li>
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                className="suggest-item"
                // blur より先に選択を確定させる
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(it.key);
                  setFocused(false);
                }}
              >
                <span>{it.label}</span>
                {it.sub && <span className="suggest-via">{it.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
