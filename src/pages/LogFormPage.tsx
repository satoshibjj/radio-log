import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { PersonListEditor, type PersonItem } from '../components/PersonListEditor';
import { useUi } from '../components/UiProvider';
import { findSameDayLogs, saveEpisodeLog } from '../db/repo';
import { useData } from '../state/DataContext';
import { compareLogsDesc, errorMessage, formatYmd, isValidYmd, todayLocal } from '../lib/util';
import { rankFrequentPersons } from '../lib/suggest';
import { resolvePendingPerson } from '../lib/pendingPerson';

const RECENT_LIMIT = 8;

/** S5：聴取ログ作成／編集 */
export function LogFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, programById, personById, appearancesByLog, reload } = useData();
  const { confirm, alert, toast } = useUi();

  const original = useMemo(() => (id ? data.episodeLogs.find((l) => l.id === id) : undefined), [data.episodeLogs, id]);

  const [programId, setProgramId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [items, setItems] = useState<PersonItem[]>([]);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ program?: string; date?: string }>({});
  /** ユーザーが出演者を手で編集したか（番組切替時に上書きしてよいかの判定） */
  const personsTouched = useRef(false);
  /** 出演者欄に入力されたまま確定していない名前（保存時に出演者として追加する） */
  const pendingPerson = useRef('');
  const initialized = useRef(false);

  const defaultsOf = (pid: string): PersonItem[] =>
    (programById.get(pid)?.defaultPersonIds ?? []).map((personId) => ({ personId, role: 'regular' as const }));

  // 初期値の反映（読み込み完了後に一度だけ）
  useEffect(() => {
    if (initialized.current || loading) return;
    if (isEdit) {
      if (!original) return;
      setProgramId(original.programId);
      setDate(original.broadcastDate);
      setMemo(original.memo);
      setItems((appearancesByLog.get(original.id) ?? []).map((a) => ({ personId: a.personId, role: a.role })));
      personsTouched.current = true; // 既存ログの出演者は保持する
    } else {
      const qp = params.get('programId');
      if (qp && programById.has(qp)) {
        setProgramId(qp);
        setItems(defaultsOf(qp));
      }
      setDate(todayLocal());
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isEdit, original]);

  /** 直近に記録した番組（更新日時の新しい順） */
  const recentProgramIds = useMemo(() => {
    const out: string[] = [];
    const sorted = [...data.episodeLogs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const l of sorted) {
      if (!out.includes(l.programId) && programById.has(l.programId)) out.push(l.programId);
      if (out.length >= RECENT_LIMIT) break;
    }
    return out;
  }, [data.episodeLogs, programById]);

  /** 同じ番組の直近ログ（編集中のログは除く） */
  const previousLog = useMemo(() => {
    if (!programId) return undefined;
    return data.episodeLogs.filter((l) => l.programId === programId && l.id !== id).sort(compareLogsDesc)[0];
  }, [data.episodeLogs, programId, id]);
  const previousItems = useMemo<PersonItem[]>(
    () =>
      previousLog
        ? (appearancesByLog.get(previousLog.id) ?? [])
            .filter((a) => personById.has(a.personId))
            .map((a) => ({ personId: a.personId, role: a.role }))
        : [],
    [previousLog, appearancesByLog, personById],
  );
  const sameAsPrevious =
    previousItems.length === items.length &&
    previousItems.every((p, i) => p.personId === items[i].personId && p.role === items[i].role);

  /** よく出る人（この番組・選択中の人との共演・全体の出演回数から） */
  const frequentIds = useMemo(
    () =>
      rankFrequentPersons({
        logs: data.episodeLogs.filter((l) => l.id !== id),
        appearancesByLog,
        programId: programId || undefined,
        selectedIds: items.map((x) => x.personId),
        isValidPerson: (pid) => personById.has(pid),
        limit: 6,
      }),
    [data.episodeLogs, appearancesByLog, programId, items, personById, id],
  );

  const sortedPrograms = useMemo(
    () => [...data.programs].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [data.programs],
  );

  const setPendingPerson = useCallback((text: string) => {
    pendingPerson.current = text;
  }, []);

  const changeProgram = (pid: string) => {
    setProgramId(pid);
    setErrors((e) => ({ ...e, program: undefined }));
    if (!pid) return;
    const defaults = defaultsOf(pid);
    if (!personsTouched.current) {
      setItems(defaults);
    } else {
      // 手動編集済みなら既存を残し、未登録の基本パーソナリティのみ追加（重複防止）
      setItems((cur) => {
        const have = new Set(cur.map((c) => c.personId));
        return [...cur, ...defaults.filter((d) => !have.has(d.personId))];
      });
    }
  };

  if (!loading && isEdit && !original && !saving) {
    return (
      <>
        <PageHeader title="リピート回が見つかりません" back />
        <EmptyState title="削除された可能性があります" />
      </>
    );
  }

  if (!loading && data.programs.length === 0) {
    return (
      <>
        <PageHeader title="また聴きたい回を追加" kicker="NEW REPEAT" back />
        <EmptyState title="先に番組を登録してください">
          <Link to="/programs/new" className="btn btn-primary">
            番組を登録
          </Link>
        </EmptyState>
      </>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!programId) errs.program = '番組を選択してください';
    if (!isValidYmd(date)) errs.date = '放送日を正しく入力してください';
    setErrors(errs);
    if (errs.program || errs.date) return;

    setSaving(true);
    try {
      // 同一番組×同一放送日の重複チェック（新規作成時、または番組/放送日を変更した時）
      const keyChanged = !original || original.programId !== programId || original.broadcastDate !== date;
      if (keyChanged) {
        const dups = await findSameDayLogs(programId, date, id);
        if (dups.length > 0) {
          const ok = await confirm({
            title: '同じ放送回が既に記録されています',
            message: (
              <>
                「{programById.get(programId)?.name}」の {formatYmd(date)} 放送分は既に {dups.length} 件記録されています。
                <br />
                このまま登録しますか？
              </>
            ),
            confirmLabel: 'このまま登録',
            cancelLabel: 'キャンセル',
          });
          if (!ok) {
            setSaving(false);
            return;
          }
        }
      }
      // 候補を選ばずに入力欄に残っている名前も出演者に含める
      let finalItems = items;
      const pending = await resolvePendingPerson(pendingPerson.current, data.persons);
      if (pending && !finalItems.some((x) => x.personId === pending.personId)) {
        finalItems = [...finalItems, { personId: pending.personId, role: 'guest' }];
        setItems(finalItems);
      }
      const saved = await saveEpisodeLog({ id, programId, broadcastDate: date, memo, appearances: finalItems });
      await reload();
      toast(
        `${isEdit ? 'リピート回を更新しました' : 'リピート回を記録しました'}${pending && finalItems !== items ? `（出演者に「${pending.name}」を追加）` : ''}`,
      );
      navigate(`/logs/${saved.id}`, { replace: true });
    } catch (err) {
      setSaving(false);
      await alert('保存できませんでした', errorMessage(err));
    }
  };

  const recentOthers = sortedPrograms.filter((p) => !recentProgramIds.includes(p.id));

  return (
    <>
      <PageHeader title={isEdit ? 'リピート回を編集' : 'また聴きたい回を追加'} kicker={isEdit ? 'EDIT REPEAT' : 'NEW REPEAT'} back />
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="lprogram">
            番組 <span className="req">必須</span>
          </label>
          {recentProgramIds.length > 0 && (
            <div className="chips recent-chips" aria-label="最近の番組">
              {recentProgramIds.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  className={`chip ${pid === programId ? 'is-selected' : ''}`}
                  aria-pressed={pid === programId}
                  onClick={() => changeProgram(pid)}
                >
                  {programById.get(pid)?.name}
                </button>
              ))}
            </div>
          )}
          <select
            id="lprogram"
            className={`input select ${errors.program ? 'has-error' : ''}`}
            value={programId}
            onChange={(e) => changeProgram(e.target.value)}
          >
            <option value="">番組を選択…</option>
            {recentProgramIds.length > 0 ? (
              <>
                <optgroup label="最近の番組">
                  {recentProgramIds.map((pid) => (
                    <option key={pid} value={pid}>
                      {programById.get(pid)?.name}
                    </option>
                  ))}
                </optgroup>
                {recentOthers.length > 0 && (
                  <optgroup label="すべての番組">
                    {recentOthers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.station ? `（${p.station}）` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              sortedPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.station ? `（${p.station}）` : ''}
                </option>
              ))
            )}
          </select>
          {errors.program && <p className="field-error">{errors.program}</p>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ldate">
            放送日 <span className="req">必須</span>
          </label>
          <div className="date-row">
            <input
              id="ldate"
              className={`input ${errors.date ? 'has-error' : ''}`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setErrors((x) => ({ ...x, date: undefined }));
              }}
            />
            {date !== todayLocal() && (
              <button type="button" className="btn btn-small" onClick={() => setDate(todayLocal())}>
                今日
              </button>
            )}
          </div>
          {errors.date && <p className="field-error">{errors.date}</p>}
        </div>

        <div className="field">
          <span className="field-label">出演者</span>
          <p className="field-hint">役割ボタンでレギュラー／ゲストを切り替え。▲▼で並び替え。</p>
          {previousLog && previousItems.length > 0 && !sameAsPrevious && (
            <button
              type="button"
              className="btn btn-small btn-assist"
              onClick={() => {
                personsTouched.current = true;
                setItems(previousItems);
              }}
            >
              ↺ 前回（{formatYmd(previousLog.broadcastDate)}）と同じ出演者にする
            </button>
          )}
          <PersonListEditor
            items={items}
            showRole
            addRole="guest"
            suggestedIds={frequentIds}
            onPendingTextChange={setPendingPerson}
            onChange={(next) => {
              personsTouched.current = true;
              setItems(next);
            }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="lmemo">
            リピートしたい理由・聴きどころ・感想
          </label>
          <textarea
            id="lmemo"
            className="input textarea"
            rows={6}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：冒頭のフリートークが最高。後半のコーナーでの掛け合いをまた聴きたい"
          />
        </div>

        <div className="form-actions sticky-bottom">
          <button type="submit" className="btn btn-primary btn-block btn-large" disabled={saving}>
            {saving ? '保存中…' : isEdit ? '更新する' : 'リピート帳に追加'}
          </button>
        </div>
      </form>
    </>
  );
}
