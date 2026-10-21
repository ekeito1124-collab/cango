import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './styles.css';
import { AppProvider } from './context.jsx';
import { store } from './lib.js';
import { LANGS } from '../shared/constants.js';
import Layout from './components/Layout.jsx';
import Explore from './pages/Explore.jsx';
import ShopDetail from './pages/ShopDetail.jsx';
import Reserve from './pages/Reserve.jsx';
import { Login, Register, Forgot, Reset, CardDemo } from './pages/Auth.jsx';
import { Reservations, ReservationDetail } from './pages/Reservations.jsx';
import Settings from './pages/Settings.jsx';
import Plan from './pages/Plan.jsx';
import BizApp from './biz/BizApp.jsx';
import Admin from './admin/Admin.jsx';
import ErrorBoundary, { JA_ERROR_LABELS } from './components/ErrorBoundary.jsx';

function pickLang() {
  const saved = store.get('lang', null);
  if (LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'en').toLowerCase();
  return LANGS.find((l) => nav.startsWith(l)) || 'en';
}

// 言語別 URL（/en/..., /zh/...：5-1）
function TravelerApp() {
  const { lang } = useParams();
  if (!LANGS.includes(lang)) return <Navigate to={`/${pickLang()}`} replace />;
  store.set('lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  return (
    <AppProvider lang={lang}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Explore />} />
          <Route path="shops/:slug" element={<ShopDetail />} />
          <Route path="shops/:slug/reserve" element={<Reserve />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot" element={<Forgot />} />
          <Route path="reset" element={<Reset />} />
          <Route path="card" element={<CardDemo />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="reservations/:id" element={<ReservationDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="plan" element={<Plan />} />
          <Route path="*" element={<Navigate to={`/${lang}`} replace />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/${pickLang()}`} replace />} />
        <Route path="/biz/*" element={<BizApp />} />
        <Route path="/admin" element={<ErrorBoundary labels={JA_ERROR_LABELS}><Admin /></ErrorBoundary>} />
        <Route path="/:lang/*" element={<TravelerApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
