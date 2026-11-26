import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/Layout';
import { PersonListEditor, type PersonItem } from '../components/PersonListEditor';
import { ProgramNameSuggest } from '../components/ProgramNameSuggest';
import { StationChips } from '../components/StationChips';
import { useUi } from '../components/UiProvider';
import { deleteProgram, ProgramInUseError, saveProgram } from '../db/repo';
import { useData } from '../state/DataContext';
import { errorMessage } from '../lib/util';
import { matchStation } from '../lib/stations';
import { isYouTubeVideoUrl, normalizeHttpUrl } from '../lib/links';
import { fetchYouTubeInfo } from '../lib/external';
import { rankFrequentPersons } from '../lib/suggest';
import { resolvePendingPerson } from '../lib/pendingPerson';

/** S4：番組新規登録／編集 */
export function ProgramFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { data, loading, programById, personById, appearancesByLog, reload } = useData();
  const { confirm, alert, toast } = useUi();
  const existing = id ? programById.get(id) : undefined;

  const [name, setName] = useState('');
  const [station, setStation] = useState('');
  const [persons, setPersons] = useState<PersonItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [ytBusy, setYtBusy] = useState(false);
  const [ytMessage, setYtMessage] = useState('');
  /** 番組名をユーザーが入力したか（入力したら候補を自動検索） */
  const [nameTyped, setNameTyped] = useState(false);
  const initialized = useRef(false);
  /** 出演者欄に入力されたまま確定していない名前 */
  const pendingPerson = useRef('');
  const setPendingPerson = useCallback((text: string) => {
    pendingPerson.current = text;
  }, []);

  const frequentIds = useMemo(
    () =>
      rankFrequentPersons({
        logs: data.episodeLogs,
        appearancesByLog,
        programId: id,
        selectedIds: persons.map((x) => x.personId),
        isValidPerson: (pid) => personById.has(pid),
        limit: 6,
      }),
    [data.episodeLogs, appearancesByLog, id, persons, personById],
  );

  // 編集時：読み込み完了後に一度だけ初期値を反映
  useEffect(() => {
    if (initialized.current || loading) return;
    if (existing) {
      setName(existing.name);
      setStation(existing.station);
      setPersons(existing.defaultPersonIds.map((personId) => ({ personId, role: 'regular' })));
    }
    initialized.current = true;
  }, [loading, existing]);

  if (isEdit && !loading && !existing && !saving) {
    return (
      <>
        <PageHeader title="番組が見つかりません" back />
        <EmptyState title="削除された可能性があります" />
      </>
    );
  }

  /** 番組名の欄に URL が貼られているか（その場合は Apple Podcasts の候補検索をしない） */
  const nameIsUrl = /^\s*(https?:\/\/|www\.|youtu\.be\/)/i.test(name);
  const youTubeUrl = nameIsUrl && isYouTubeVideoUrl(name) ? normalizeHttpUrl(name) : undefined;

  const fillFromYouTube = async () => {
    if (!youTubeUrl) return;
    setYtBusy(true);
    setYtMessage('');
    try {
      const info = await fetchYouTubeInfo(youTubeUrl);
      if (!info.channel) throw new Error('チャンネル名を取得できませんでした。手で入力してください。');
      setName(info.channel);
      setNameError('');
      setNameTyped(false);
      const setSt = !station.trim();
      if (setSt) setStation('YouTube');
      toast(`チャンネル名${setSt ? 'と配信元（YouTube）' : ''}を入力しました`);
    } catch (err) {
      setYtMessage(errorMessage(err));
    } finally {
      setYtBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (nameIsUrl) {
      setNameError('番組名に URL が入っています。チャンネル名を取得するか、名前を入力してください');
      return;
    }
    if (!name.trim()) {
      setNameError('番組名を入力してください');
      return;
    }
    setSaving(true);
    try {
      let ids = persons.map((x) => x.personId);
      const pending = await resolvePendingPerson(pendingPerson.current, data.persons);
      if (pending && !ids.includes(pending.personId)) ids = [...ids, pending.personId];
      const p = await saveProgram({ id, name, station, defaultPersonIds: ids });
      await reload();
      toast(isEdit ? '番組を更新しました' : '番組を登録しました');
      navigate(`/programs/${p.id}`, { replace: true });
    } catch (err) {
      setSaving(false);
      await alert('保存できませんでした', errorMessage(err));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: '番組を削除しますか？',
      message: `「${existing.name}」を削除します。この操作は取り消せません。`,
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteProgram(existing.id);
      await reload();
      toast('番組を削除しました');
      navigate('/programs', { replace: true });
    } catch (err) {
      setSaving(false);
      if (err instanceof ProgramInUseError) await alert('削除できません', err.message);
      else await alert('削除できませんでした', errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title={isEdit ? '番組を編集' : '番組を登録'} kicker="PROGRAM" back />
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="pname">
            番組・チャンネル名 <span className="req">必須</span>
          </label>
          <input
            id="pname"
            className={`input ${nameError ? 'has-error' : ''}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError('');
              setNameTyped(true);
            }}
            placeholder="番組名を入力すると候補が出ます"
            autoComplete="off"
            aria-invalid={Boolean(nameError)}
          />
          {nameError && <p className="field-error">{nameError}</p>}
          {youTubeUrl && (
            <button type="button" className="btn btn-small btn-assist" disabled={ytBusy} onClick={() => void fillFromYouTube()}>
              {ytBusy ? '取得中…' : '▶ この YouTube 動画のチャンネル名を入力'}
            </button>
          )}
          {ytMessage && <p className="assist-note">{ytMessage}</p>}
          {!name.trim() && <p className="field-hint">YouTube のチャンネルは、動画の URL を貼るとチャンネル名を取得できます。</p>}
          <ProgramNameSuggest
            value={name}
            active={nameTyped && !nameIsUrl}
            editingId={id}
            onSelect={(r) => {
              setName(r.name);
              setNameError('');
              setNameTyped(false); // 選んだら候補を閉じる
              const matched = station.trim() ? undefined : matchStation(r.artist, data.programs.map((p) => p.station));
              if (matched) setStation(matched);
              toast(matched ? `番組名と放送局（${matched}）を入力しました` : '番組名を入力しました');
            }}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pstation">
            放送局・配信元
          </label>
          <input
            id="pstation"
            className="input"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            placeholder="下から選ぶか、手入力"
            autoComplete="off"
          />
          <StationChips value={station} onChange={setStation} />
        </div>
        <div className="field">
          <span className="field-label">基本パーソナリティ</span>
          <p className="field-hint">回を追加するとき、出演者として最初から入ります（いつもの出演者）。</p>
          <PersonListEditor items={persons} onChange={setPersons} addRole="regular" suggestedIds={frequentIds} onPendingTextChange={setPendingPerson} />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block btn-large" disabled={saving}>
            {isEdit ? '更新する' : '登録する'}
          </button>
          {isEdit && (
            <button type="button" className="btn btn-danger-outline btn-block" onClick={() => void onDelete()} disabled={saving}>
              この番組を削除
            </button>
          )}
        </div>
      </form>
    </>
  );
}
