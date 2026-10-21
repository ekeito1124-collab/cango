import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../lib.js';
import Converter from './Converter.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { useEffect } from 'react';
import { LANGS, LANG_LABELS } from '../../shared/constants.js';

// 下部タブ用のシンプルなアイコン
const ICONS = {
  explore: 'M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  plan: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2v6l5 3 1-1.7-4-2.3V7z',
  bookings: 'M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v10H5zm2 2v2h2v-2zm4 0v2h2v-2z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10.6 2l-.5 2.4a8 8 0 0 0-1.9 1.1L5.9 4.7 4.5 7.1l1.8 1.7a8 8 0 0 0 0 2.4l-1.8 1.7 1.4 2.4 2.3-.8a8 8 0 0 0 1.9 1.1l.5 2.4h2.8l.5-2.4a8 8 0 0 0 1.9-1.1l2.3.8 1.4-2.4-1.8-1.7a8 8 0 0 0 0-2.4l1.8-1.7-1.4-2.4-2.3.8a8 8 0 0 0-1.9-1.1L13.4 2z',
};
const Icon = ({ name }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d={ICONS[name]} fill="currentColor" fillRule="evenodd" />
  </svg>
);

export default function Layout() {
  const { t, lang, user, setUser, converter, openConverter, closeConverter } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // 画面を移動したら、開いたままの為替計算は閉じる
  useEffect(() => {
    closeConverter();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchLang = (l) => {
    if (user) api('auth/profile', { method: 'PATCH', body: { lang: l } }).then((d) => setUser(d.user)).catch(() => {});
    navigate(location.pathname.replace(/^\/[a-z]{2}/, '/' + l) + location.search);
  };
  const logout = async () => {
    await api('auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate(`/${lang}`);
  };

  return (
    <div className="app">
      <header className="topbar">
        <Link to={`/${lang}`} className="brand">
          {t('app.name')}
        </Link>
        <div className="topbar-actions">
          <button className="fx-button" onClick={() => openConverter()} aria-label={t('fx.title')} title={t('fx.title')}>
            <span aria-hidden="true">¥⇄</span>
            <span className="fx-button-label">{t('fx.button')}</span>
          </button>
          <select className="lang-select" value={lang} onChange={(e) => switchLang(e.target.value)} aria-label="Language">
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </header>
      <p className="demo-banner">{t('app.demo')}</p>
      <main className="content">
        <ErrorBoundary
          key={location.pathname}
          labels={{ title: t('error.title'), body: t('error.body'), retry: t('error.retry'), back: t('error.back') }}
        >
          <Outlet />
        </ErrorBoundary>
      </main>
      <nav className="tabbar">
        <NavLink to={`/${lang}`} end>
          <Icon name="explore" />
          <span>{t('nav.explore')}</span>
        </NavLink>
        <NavLink to={`/${lang}/plan`}>
          <Icon name="plan" />
          <span>{t('nav.plan')}</span>
        </NavLink>
        <NavLink to={`/${lang}/reservations`}>
          <Icon name="bookings" />
          <span>{t('nav.reservations')}</span>
        </NavLink>
        <NavLink to={`/${lang}/settings`}>
          <Icon name="settings" />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </nav>
      <footer className="footer">
        {user ? (
          <>
            <span>{user.email}</span>
            <button className="link" onClick={logout}>
              {t('nav.logout')}
            </button>
          </>
        ) : (
          <Link to={`/${lang}/login`}>{t('nav.login')}</Link>
        )}
        <a href="/biz">{t('nav.forBusiness')}</a>
      </footer>
      {converter && <Converter key={converter.id} />}
    </div>
  );
}
