import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 破壊的操作（赤いボタン） */
  danger?: boolean;
  /** OKボタンのみ（お知らせ用） */
  alertOnly?: boolean;
}

interface UiContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (title: string, message?: ReactNode) => Promise<void>;
  toast: (message: string) => void;
}

const Ctx = createContext<UiContextValue | null>(null);

interface DialogState extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );
  const alert = useCallback(
    async (title: string, message?: ReactNode) => {
      await confirm({ title, message, alertOnly: true, confirmLabel: 'OK' });
    },
    [confirm],
  );
  const toast = useCallback((message: string) => {
    setToastMsg(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dialog.resolve(false);
        setDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  return (
    <Ctx.Provider value={{ confirm, alert, toast }}>
      {children}
      {dialog && (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-title" className="modal-title">
              {dialog.title}
            </h2>
            {dialog.message && <div className="modal-body">{dialog.message}</div>}
            <div className="modal-actions">
              {!dialog.alertOnly && (
                <button type="button" className="btn" onClick={() => close(false)}>
                  {dialog.cancelLabel ?? 'キャンセル'}
                </button>
              )}
              <button
                ref={okRef}
                type="button"
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {dialog.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toast-area" aria-live="polite">
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </div>
    </Ctx.Provider>
  );
}

export function useUi(): UiContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUi must be used within UiProvider');
  return v;
}
