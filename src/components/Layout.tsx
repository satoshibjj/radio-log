import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { UpdateBanner } from './UpdateBanner';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  logs: 'M4 6h16M4 12h16M4 18h10',
  programs: 'M3 9h18v11H3zM7 9l9-5M8 15h.01M12 13v4M16 13v4',
  persons: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a4 4 0 0 0-3-3.9M15 4.1a3 3 0 0 1 0 5.8',
  data: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};

/** 全画面共通：本文＋下部ナビ（親指で届く位置に「記録」ボタン） */
export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app">
      <UpdateBanner />
      <main className="main">{children}</main>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        <NavLink to="/" end className="nav-item">
          <Icon d={ICONS.home} />
          <span>ホーム</span>
        </NavLink>
        <NavLink to="/logs" className="nav-item">
          <Icon d={ICONS.logs} />
          <span>リピート帳</span>
        </NavLink>
        <button type="button" className="nav-fab" aria-label="また聴きたい回を追加する" onClick={() => navigate('/logs/new')}>
          <span className="nav-fab-dial" aria-hidden="true">
            ＋
          </span>
          <span className="nav-fab-label">回を追加</span>
        </button>
        <NavLink to="/programs" className="nav-item">
          <Icon d={ICONS.programs} />
          <span>番組</span>
        </NavLink>
        <NavLink to="/persons" className="nav-item">
          <Icon d={ICONS.persons} />
          <span>出演者</span>
        </NavLink>
      </nav>
    </div>
  );
}

interface HeaderProps {
  title: string;
  /** 小見出し（AM/FM 表示風） */
  kicker?: string;
  back?: boolean;
  actions?: ReactNode;
  /** タイトル下の一行説明（この画面が何か） */
  description?: string;
}

/** 画面上部のヘッダー（ラジオのダイヤル目盛り風装飾つき） */
export function PageHeader({ title, kicker, back, actions, description }: HeaderProps) {
  const navigate = useNavigate();
  return (
    <>
    <header className="page-header">
      <div className="page-header-row">
        {back && (
          <button
            type="button"
            className="icon-btn"
            aria-label="戻る"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            <Icon d="M15 18l-6-6 6-6" />
          </button>
        )}
        <div className="page-title-wrap">
          {kicker && <div className="page-kicker">{kicker}</div>}
          <h1 className="page-title">{title}</h1>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <div className="dial-scale" aria-hidden="true" />
    </header>
    {description && <p className="page-desc">{description}</p>}
    </>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-dial" aria-hidden="true" />
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
