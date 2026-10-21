import { useEffect, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { JA, jaDateTime } from '../biz/labels.js';
import { LANG_LABELS, TRANSLATION_LANGS as LANGS } from '../../shared/constants.js';

// 運営画面：掲載内容の確認、翻訳・食品表示の報告対応、用語集（固定訳）の管理
export default function Admin() {
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [, guard] = useGuard();

  const load = () => api('admin/overview').then(setData).catch(setError);
  useEffect(() => {
    document.documentElement.lang = 'ja';
    api('auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (user?.role === 'ADMIN') load();
  }, [user]);

  if (user === undefined) return <p className="content">読み込み中…</p>;
  if (user?.role !== 'ADMIN') {
    const login = async (e) => {
      e.preventDefault();
      try {
        const d = await api('auth/login', { method: 'POST', body: { email, password } });
        setUser(d.user);
      } catch {
        setError({ code: 'login' });
      }
    };
    return (
      <form className="content auth stack" onSubmit={login}>
        <h1>運営ログイン</h1>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" required />
        {error && <p className="error">ログインできませんでした（運営アカウントが必要です）。</p>}
        <button className="btn primary">ログイン</button>
      </form>
    );
  }
  if (!data) return <p className="content">読み込み中…</p>;

  const post = guard((path, body) => api(path, { method: 'POST', body }).then(load));

  return (
    <div className="app admin">
      <header className="topbar">
        <span className="brand">Cango 運営</span>
      </header>
      <main className="content stack">
        <section className="card">
          <h2>掲載内容の確認（{data.shops.length}件）</h2>
          {!data.shops.length && <p className="muted">確認待ちはありません。</p>}
          {data.shops.map((s) => (
            <div key={s.id} className="review-item stack">
              <strong>
                {s.name}（{JA.cat[s.category]}／{s.owner?.email}）
              </strong>
              {!s.published && (
                <div className="row">
                  <span>未公開の店舗</span>
                  <button className="btn small primary" onClick={() => post(`admin/shops/${s.id}/review`, { published: true })}>
                    公開する
                  </button>
                </div>
              )}
              <p className="fine">{s.description}</p>
              {s.ownerWords && s.ownerWordsStatus === 'PENDING' && (
                <div>
                  <p>店主のことば：「{s.ownerWords}」</p>
                  <ReviewButtons onDecide={(v) => post(`admin/shops/${s.id}/review`, { ownerWordsStatus: v })} />
                </div>
              )}
              {s.dailyProfile && s.dailyProfileStatus === 'PENDING' && (
                <div>
                  <dl className="kv">
                    {Object.entries(s.dailyProfile).map(([k, v]) => (
                      <div key={k}>
                        <dt>{JA.profile[k]}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <ReviewButtons onDecide={(v) => post(`admin/shops/${s.id}/review`, { dailyProfileStatus: v })} />
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="card">
          <h2>店舗間の紹介の確認（{data.referrals.length}件）</h2>
          {data.referrals.map((r) => (
            <div key={r.id} className="review-item">
              <p>
                {r.fromShop.name} → {r.toShop.name}：「{r.message}」（紹介先の同意：{JA.consent[r.targetConsent]}）
              </p>
              <ReviewButtons onDecide={(v) => post(`admin/referrals/${r.id}/review`, { status: v })} />
            </div>
          ))}
        </section>

        <section className="card">
          <h2>報告（{data.reports.length}件）</h2>
          {data.reports.map((r) => (
            <ReportItem key={r.id} r={r} onDone={load} />
          ))}
        </section>

        <Glossary terms={data.glossary} onChange={load} />
      </main>
    </div>
  );
}

function ReviewButtons({ onDecide }) {
  return (
    <div className="row">
      <button className="btn small primary" onClick={() => onDecide('APPROVED')}>
        掲載を承認
      </button>
      <button className="btn small" onClick={() => onDecide('REJECTED')}>
        見送り
      </button>
    </div>
  );
}

const KIND = { TRANSLATION: '翻訳', FOOD_INFO: '食品表示', CONTENT: '掲載内容' };

function ReportItem({ r, onDone }) {
  const [fix, setFix] = useState(r.translatedText || '');
  const saveFix = async () => {
    await api('admin/translations', { method: 'PUT', body: { sourceText: r.sourceText, lang: r.lang, text: fix } });
    await api(`admin/reports/${r.id}/resolve`, { method: 'POST' });
    onDone();
  };
  return (
    <div className="review-item stack">
      <strong>
        {KIND[r.kind]}／{r.lang && LANG_LABELS[r.lang]}／{jaDateTime(r.createdAt)}
      </strong>
      {r.sourceText && <p>原文：{r.sourceText}</p>}
      {r.translatedText && <p>訳文：{r.translatedText}</p>}
      {r.context && <p className="fine">場所：{r.context}</p>}
      {r.comment && <p>コメント：{r.comment}</p>}
      {r.kind === 'TRANSLATION' && r.sourceText && r.lang && (
        <div className="row">
          <input value={fix} onChange={(e) => setFix(e.target.value)} />
          <button className="btn small primary" onClick={saveFix}>
            訳を修正して完了
          </button>
        </div>
      )}
      <button className="btn small" onClick={() => api(`admin/reports/${r.id}/resolve`, { method: 'POST' }).then(onDone)}>
        対応済みにする
      </button>
    </div>
  );
}

function Glossary({ terms, onChange }) {
  const empty = { ja: '', en: '', zh: '', ko: '', fr: '', es: '', note: '' };
  const [form, setForm] = useState(empty);
  const save = async (e) => {
    e.preventDefault();
    await api('admin/glossary', { method: 'PUT', body: form });
    setForm(empty);
    onChange();
  };
  return (
    <section className="card">
      <h2>用語集（固定訳）</h2>
      <p className="fine">ここに登録した用語は、自動翻訳の際に必ずこの訳を使います。</p>
      <div className="table-wrap">
        <table className="glossary">
          <thead>
            <tr>
              <th>日本語</th>
              {LANGS.map((l) => (
                <th key={l}>{l}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {terms.map((g) => (
              <tr key={g.id}>
                <td>{g.ja}</td>
                {LANGS.map((l) => (
                  <td key={l}>{g[l]}</td>
                ))}
                <td>
                  <button className="link" onClick={() => setForm(g)}>
                    編集
                  </button>{' '}
                  <button className="link" onClick={() => api('admin/glossary/' + g.id, { method: 'DELETE' }).then(onChange)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={save} className="stack">
        <input value={form.ja} onChange={(e) => setForm({ ...form, ja: e.target.value })} placeholder="日本語" required />
        {LANGS.map((l) => (
          <input key={l} value={form[l]} onChange={(e) => setForm({ ...form, [l]: e.target.value })} placeholder={LANG_LABELS[l]} required />
        ))}
        <button className="btn primary">用語を保存</button>
      </form>
    </section>
  );
}
