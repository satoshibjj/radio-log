import type { AppearanceRole } from '../db/types';
import { useData } from '../state/DataContext';
import { PersonPicker } from './PersonPicker';

export interface PersonItem {
  personId: string;
  role: AppearanceRole;
}

interface Props {
  items: PersonItem[];
  onChange: (items: PersonItem[]) => void;
  /** 役割（レギュラー/ゲスト）切り替えを表示 */
  showRole?: boolean;
  /** 新規追加時の役割 */
  addRole?: AppearanceRole;
  pickerLabel?: string;
}

/** 人物リストの編集（追加・削除・並び替え・役割切り替え） */
export function PersonListEditor({ items, onChange, showRole = false, addRole = 'guest', pickerLabel }: Props) {
  const { personById } = useData();

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="person-editor">
      {items.length > 0 && (
        <ol className="person-rows">
          {items.map((it, i) => (
            <li key={it.personId} className="person-row">
              <span className="person-row-order" aria-hidden="true">
                {i + 1}
              </span>
              <span className="person-row-name">{personById.get(it.personId)?.name ?? '（不明）'}</span>
              {showRole && (
                <button
                  type="button"
                  className={`role-toggle ${it.role === 'guest' ? 'is-guest' : ''}`}
                  aria-label={`役割：${it.role === 'regular' ? 'レギュラー' : 'ゲスト'}（タップで切り替え）`}
                  onClick={() =>
                    onChange(items.map((x, k) => (k === i ? { ...x, role: x.role === 'regular' ? 'guest' : 'regular' } : x)))
                  }
                >
                  {it.role === 'regular' ? 'レギュラー' : 'ゲスト'}
                </button>
              )}
              <div className="person-row-tools">
                <button type="button" className="icon-btn small" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                  ▲
                </button>
                <button
                  type="button"
                  className="icon-btn small"
                  aria-label="下へ"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="icon-btn small danger"
                  aria-label="削除"
                  onClick={() => onChange(items.filter((_, k) => k !== i))}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <PersonPicker
        label={pickerLabel}
        allowCreate
        excludeIds={items.map((x) => x.personId)}
        placeholder="名前・別名で検索／新規追加"
        onPick={(personId) => onChange([...items, { personId, role: addRole }])}
      />
    </div>
  );
}
