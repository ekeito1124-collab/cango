import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, useGuard } from '../lib.js';
import { ErrorText } from '../components/ui.jsx';

function useNext(fallback) {
  const [params] = useSearchParams();
  const next = params.get('next');
  // 同一サイト内のパスだけ許可する
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function Login() {
  const { t, lang, setUser } = useApp();
  const navigate = useNavigate();
  const next = useNext(`/${lang}`);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { user } = await api('auth/login', { method: 'POST', body: { email, password } });
      setUser(user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>{t('auth.login')}</h1>
      <label>
        {t('auth.email')}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        {t('auth.password')}
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <ErrorText error={error} />
      <button className="btn primary" disabled={busy}>{t('auth.login')}</button>
      <Link to={`/${lang}/forgot`}>{t('auth.forgot')}</Link>
      <p>
        {t('auth.noAccount')} <Link to={`/${lang}/register?next=${encodeURIComponent(next)}`}>{t('auth.register')}</Link>
      </p>
    </form>
  );
}

export function Register() {
  const { t, lang, setUser, prefs } = useApp();
  const navigate = useNavigate();
  const next = useNext(`/${lang}`);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { user } = await api('auth/register', { method: 'POST', body: { email, password, lang, currency: prefs.currency } });
      setUser(user);
      // 登録の流れでダミーのカード入力画面を案内する（後回しも可）
      navigate(`/${lang}/card?next=${encodeURIComponent(next)}`, { replace: true });
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>{t('auth.register')}</h1>
      <label>
        {t('auth.email')}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        {t('auth.password')}
        <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <span className="fine">{t('auth.passwordHint')}</span>
      </label>
      <ErrorText error={error} />
      <button className="btn primary" disabled={busy}>{t('auth.register')}</button>
      <p>
        {t('auth.haveAccount')} <Link to={`/${lang}/login?next=${encodeURIComponent(next)}`}>{t('auth.login')}</Link>
      </p>
    </form>
  );
}

export function Forgot() {
  const { t, lang } = useApp();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setSent(await api('auth/forgot', { method: 'POST', body: { email, lang } }));
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>{t('auth.forgotTitle')}</h1>
      {sent ? (
        <>
          <p>{t('auth.forgotSent')}</p>
          {sent.devResetUrl && (
            <p className="fine">
              {t('auth.devLink')}: <a href={sent.devResetUrl}>{sent.devResetUrl}</a>
            </p>
          )}
        </>
      ) : (
        <>
          <label>
            {t('auth.email')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <ErrorText error={error} />
          <button className="btn primary" disabled={busy}>{t('auth.forgotSend')}</button>
        </>
      )}
    </form>
  );
}

export function Reset() {
  const { t, lang, setUser } = useApp();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { user } = await api('auth/reset', { method: 'POST', body: { token: params.get('token'), password } });
      setUser(user);
      setDone(true);
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>{t('auth.resetTitle')}</h1>
      {done ? (
        <>
          <p>{t('auth.resetDone')}</p>
          <Link className="btn primary" to={`/${lang}`}>
            {t('nav.explore')}
          </Link>
        </>
      ) : (
        <>
          <label>
            {t('auth.password')}
            <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <span className="fine">{t('auth.passwordHint')}</span>
          </label>
          <ErrorText error={error} />
          <button className="btn primary" disabled={busy}>{t('common.save')}</button>
        </>
      )}
    </form>
  );
}

// ダミーのカード入力画面（11-1）。入力値はどこにも送信・保存しない
export function CardDemo() {
  const { t, lang, user, setUser } = useApp();
  const navigate = useNavigate();
  const next = useNext(`/${lang}`);
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  if (user === undefined) return <p>{t('common.loading')}</p>;
  if (!user) return <Navigate to={`/${lang}/login?next=${encodeURIComponent(`/${lang}/card?next=${next}`)}`} replace />;
  const submit = guard(async (e) => {
    e.preventDefault();
    // フォームの値は読み取らず、通過したことだけを記録する
    e.currentTarget.reset();
    try {
      const { user: u } = await api('auth/profile', { method: 'PATCH', body: { cardDemoCompleted: true } });
      setUser(u);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit} autoComplete="off">
      <h1>{t('card.title')}</h1>
      <p className="badge warn">{t('card.notice')}</p>
      <label>
        {t('card.number')}
        <input inputMode="numeric" placeholder="4242 4242 4242 4242" maxLength={23} autoComplete="off" />
      </label>
      <div className="row">
        <label>
          {t('card.expiry')}
          <input placeholder="12/30" maxLength={5} autoComplete="off" />
        </label>
        <label>
          {t('card.cvc')}
          <input inputMode="numeric" placeholder="123" maxLength={4} autoComplete="off" />
        </label>
      </div>
      <label>
        {t('card.name')}
        <input autoComplete="off" />
      </label>
      <ErrorText error={error} />
      <button className="btn primary" disabled={busy}>{t('card.submit')}</button>
      <button type="button" className="link" onClick={() => navigate(next.includes('/reserve') ? `/${lang}` : next)}>
        {t('card.later')}
      </button>
      <p className="fine">{t('card.laterNote')}</p>
    </form>
  );
}
