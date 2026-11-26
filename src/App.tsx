import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { UiProvider } from './components/UiProvider';
import { DataProvider, useData } from './state/DataContext';
import { LogListPage } from './pages/LogListPage';
import { ProgramListPage } from './pages/ProgramListPage';
import { ProgramDetailPage } from './pages/ProgramDetailPage';
import { ProgramFormPage } from './pages/ProgramFormPage';
import { LogFormPage } from './pages/LogFormPage';
import { LogDetailPage } from './pages/LogDetailPage';
import { PersonsPage } from './pages/PersonsPage';
import { DataPage } from './pages/DataPage';
import { HomePage } from './pages/HomePage';

/** 画面遷移時に先頭へスクロール */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function DbErrorBanner() {
  const { error, reload } = useData();
  if (!error) return null;
  return (
    <div className="db-error" role="alert">
      <p>データベースを開けませんでした：{error}</p>
      <p className="muted">プライベートブラウズでは保存できない場合があります。</p>
      <button type="button" className="btn btn-small" onClick={() => void reload()}>
        再試行
      </button>
    </div>
  );
}

/** パスが変わったら画面を作り直す（例：番組の編集 → 新規登録で入力内容を持ち越さない）。クエリ（?person= 等）の変更では作り直さない */
function AppRoutes() {
  const location = useLocation();
  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<HomePage />} />
      <Route path="/logs" element={<LogListPage />} />
      <Route path="/programs" element={<ProgramListPage />} />
      <Route path="/programs/new" element={<ProgramFormPage />} />
      <Route path="/programs/:id" element={<ProgramDetailPage />} />
      <Route path="/programs/:id/edit" element={<ProgramFormPage />} />
      <Route path="/logs/new" element={<LogFormPage />} />
      <Route path="/logs/:id" element={<LogDetailPage />} />
      <Route path="/logs/:id/edit" element={<LogFormPage />} />
      <Route path="/persons" element={<PersonsPage />} />
      <Route path="/data" element={<DataPage />} />
      <Route path="/guide" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <UiProvider>
        <DataProvider>
          <ScrollToTop />
          <Layout>
            <DbErrorBanner />
            <AppRoutes />
          </Layout>
        </DataProvider>
      </UiProvider>
    </HashRouter>
  );
}
