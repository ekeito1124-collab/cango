import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, store, useGuard } from '../lib.js';
import { todayJst } from '../../shared/constants.js';
import { jaDateTime } from './labels.js';
import BizRequests from './BizRequests.jsx';
import BizCalendar from './BizCalendar.jsx';
import BizShop, { ShopForm } from './BizShop.jsx';
import BizReferrals from './BizReferrals.jsx';
import BizInquiries from './BizInquiries.jsx';
import ErrorBoundary, { JA_ERROR_LABELS } from '../components/ErrorBoundary.jsx';

const BizCtx = createContext(null);
export const useBiz = () => useContext(BizCtx);

const ERR = {
  invalid_credentials: 'メールアドレスまたはパスワードが違います。',
  email_taken: 'このメールアドレスはすでに登録されています。',
  weak_password: 'パスワードは8文字以上にしてください。',
  invalid_email: 'メールアドレスの形式が正しくありません。',
  invalid_token: 'リンクが無効か、期限が切れています。',
  invalid_status: 'この予約はすでに状態が変わっています。画面を更新してください。',
  invalid_dates: '日付を選んでください（過去の日付は設定できません）。',
  conditions_required: '△の場合は受け入れ条件を選んでください。',
  condition_note_required: '「その他の条件」の内容を入力してください。',
  already_referred: 'このお店はすでに紹介済みです。',
  invalid_location: '地図でお店の位置を選んでください。',
};
export const errText = (e) => (e ? ERR[e.code] || (e.code?.startsWith('missing_') ? '必須項目が入力されていません。' : e.code?.startsWith('invalid_') ? '入力内容を確認してください。' : 'エラーが発生しました。もう一度お試しください。') : null);
export const BizError = ({ error }) => (error ? <p className="error">{errText(error)}</p> : null);

export default function BizApp() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    document.documentElement.lang = 'ja';
    api('auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);
  const location = useLocation();
  if (user === undefined) return <p className="content">読み込み中…</p>;
  const isOwner = user?.role === 'OWNER' && user.shop;
  return (
    <BizCtx.Provider value={{ user, setUser }}>
      <div className="app biz">
        <header className="topbar">
          <Link to="/biz" className="brand">
            Cango 事業者
          </Link>
          {isOwner && <span className="shop-label">{user.shop.name}</span>}
        </header>
        <main className="content">
          <ErrorBoundary key={location.pathname} labels={JA_ERROR_LABELS}>
          <Routes>
            <Route path="signup" element={<Signup />} />
            <Route path="forgot" element={<Forgot />} />
            <Route path="reset" element={<Reset />} />
            <Route path="*" element={isOwner ? <Dashboard /> : <Login />} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </BizCtx.Provider>
  );
}

function Dashboard() {
  const { setUser } = useBiz();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [staleDismissed, setStaleDismissed] = useState(() => store.get('biz.staleDismissed', null) === todayJst());
  const reload = () => api('biz/overview').then(setOverview).catch(() => {});
  useEffect(() => {
    reload();
  }, []);
  const logout = async () => {
    await api('auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/biz');
  };
  const stale = overview && (!overview.availabilityUpdatedAt || Date.now() - new Date(overview.availabilityUpdatedAt).getTime() > 7 * 86400e3);
  const c = overview?.counts;
  return (
    <div className="biz-shell">
      {/* PC・タブレット横向きでは左のサイドメニュー、狭い画面では上のタブになる */}
      <aside className="biz-side">
        <nav className="biz-tabs" aria-label="事業者メニュー">
          <NavLink to="/biz" end>
            <span>予約リクエスト</span>
            {c?.pending ? <b className="count">{c.pending}</b> : null}
          </NavLink>
          <NavLink to="/biz/calendar">
            <span>空き状況</span>
          </NavLink>
          <NavLink to="/biz/inquiries">
            <span>お問い合わせ</span>
            {c?.unanswered ? <b className="count soft">{c.unanswered}</b> : null}
          </NavLink>
          <NavLink to="/biz/shop">
            <span>店舗情報</span>
          </NavLink>
          <NavLink to="/biz/referrals">
            <span>紹介</span>
          </NavLink>
        </nav>
        <div className="biz-side-foot">
          <button className="link" onClick={logout}>
            ログアウト
          </button>
          <a href="/">旅行者向け画面</a>
        </div>
      </aside>

      <section className="biz-main">
        {overview && !overview.shop.published && <p className="card warn">お店の情報は運営の確認待ちです。確認が終わると旅行者に公開されます。</p>}
        {stale && !staleDismissed && overview.shop.reservationMethod !== 'NONE' && (
          <div className="card warn notice">
            <p>空き状況が1週間以上更新されていません。旅行者には最終更新日時が表示されます。「空き状況」から更新してください。</p>
            <button
              className="icon-btn"
              aria-label="閉じる（今日は表示しない）"
              title="閉じる（今日は表示しない）"
              onClick={() => {
                store.set('biz.staleDismissed', todayJst());
                setStaleDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        )}
        {c && (
          <div className="biz-summary">
            <Link to="/biz" className={'stat' + (c.pending ? ' alert' : '')}>
              <span className="stat-label">承認待ち</span>
              <strong>{c.pending}</strong>
              <span className="stat-unit">件</span>
            </Link>
            <Link to="/biz" className="stat">
              <span className="stat-label">これからの確定予約</span>
              <strong>{c.upcoming}</strong>
              <span className="stat-unit">件</span>
            </Link>
            <Link to="/biz/inquiries" className="stat">
              <span className="stat-label">お問い合わせ</span>
              <strong>{c.unanswered}</strong>
              <span className="stat-unit">通</span>
            </Link>
            <Link to="/biz/calendar" className="stat">
              <span className="stat-label">空き状況の最終更新</span>
              <strong className="small">{overview.availabilityUpdatedAt ? jaDateTime(overview.availabilityUpdatedAt) : '未登録'}</strong>
            </Link>
          </div>
        )}
        <Routes>
          <Route index element={<BizRequests onChange={reload} />} />
          <Route path="calendar" element={<BizCalendar shop={overview?.shop} onChange={reload} />} />
          <Route path="inquiries" element={<BizInquiries />} />
          <Route path="shop" element={overview ? <BizShop shop={overview.shop} onSaved={reload} /> : <p>読み込み中…</p>} />
          <Route path="referrals" element={<BizReferrals />} />
          <Route path="*" element={<Navigate to="/biz" replace />} />
        </Routes>
      </section>
    </div>
  );
}

function Login() {
  const { user, setUser } = useBiz();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const d = await api('auth/login', { method: 'POST', body: { email, password } });
      if (d.user.role !== 'OWNER') {
        await api('auth/logout', { method: 'POST' });
        setError({ code: 'not_owner' });
        return;
      }
      setUser(d.user);
    } catch (err) {
      setError(err);
    }
  });
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>事業者ログイン</h1>
      {user && user.role !== 'OWNER' && <p className="card warn">現在、旅行者アカウントでログインしています。事業者アカウントでログインしてください。</p>}
      <label>
        メールアドレス
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label>
        パスワード
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      {error?.code === 'not_owner' ? <p className="error">事業者アカウントではありません。</p> : <BizError error={error} />}
      <button className="btn primary big" disabled={busy}>ログイン</button>
      <Link to="/biz/forgot">パスワードを忘れた方</Link>
      <p>
        はじめての方は <Link to="/biz/signup">お店を登録する</Link>
      </p>
    </form>
  );
}

function Signup() {
  const { setUser } = useBiz();
  const [translationOn, setTranslationOn] = useState(false);
  useEffect(() => {
    api('meta')
      .then((m) => setTranslationOn(Boolean(m.translationEnabled)))
      .catch(() => {});
  }, []);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (shop) => {
    setError(null);
    try {
      const d = await api('biz/signup', { method: 'POST', body: { email, password, shop } });
      setUser(d.user);
      navigate('/biz/shop');
    } catch (err) {
      setError(err);
    }
  });
  return (
    <div className="stack">
      <h1>お店の登録</h1>
      <p className="muted">外国人旅行者向けの特別な商品を用意する必要はありません。普段の営業のまま、受け入れられる範囲で登録してください。登録後、運営が内容を確認してから公開します。</p>
      <p className="fine">
        {translationOn
          ? '自動翻訳がオンのため、入力した紹介文や旅行者とのメッセージは、翻訳のため Google（Gemini API、米国）に送信されます。'
          : '自動翻訳は現在オフです。入力した内容は翻訳サービスには送信されません。'}
      </p>
      <section className="card stack">
        <label>
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          パスワード（8文字以上）
          <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
      </section>
      <ShopForm initial={null} onSubmit={submit} submitLabel="登録する" signup busy={busy} />
      <BizError error={error} />
    </div>
  );
}

function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setSent(await api('auth/forgot', { method: 'POST', body: { email } }).catch(() => ({ ok: true })));
  };
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>パスワードの再設定</h1>
      {sent ? (
        <>
          <p>登録済みのメールアドレスであれば、再設定用のリンクを送信しました。</p>
          {sent.devResetUrl && (
            <p className="fine">
              開発環境（メール未設定）のため、ここにリンクを表示しています：<a href={sent.devResetUrl}>{sent.devResetUrl}</a>
            </p>
          )}
        </>
      ) : (
        <>
          <label>
            メールアドレス
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="btn primary">リンクを送る</button>
        </>
      )}
    </form>
  );
}

function Reset() {
  const { setUser } = useBiz();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    try {
      const d = await api('auth/reset', { method: 'POST', body: { token: params.get('token'), password } });
      setUser(d.user);
      navigate('/biz');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>新しいパスワード</h1>
      <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      <BizError error={error} />
      <button className="btn primary">保存する</button>
    </form>
  );
}
