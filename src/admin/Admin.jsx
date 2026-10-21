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
      <main className="content">
        <TranslationPanel />
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

const TR_ERRORS = {
  disabled: 'GEMINI_API_KEY が設定されていません',
  paused: 'エラーが続いたため一時停止中です（しばらくすると自動で再開します）',
  invalid_key: 'API キーが正しくありません（コピーの誤り・削除されたキーなど）',
  no_permission: 'このキーには利用権限がありません',
  quota: '無料枠の上限に達しました（1分あたりの回数など）。少し待つと再開します',
  model_not_found: 'モデルが見つかりません（GEMINI_MODEL の指定を確認してください）',
  server_error: 'Gemini 側で一時的なエラーが起きました',
  rate_limited: '短時間に呼び出しすぎました。少し待ってからお試しください',
  timeout: '応答に時間がかかりすぎました',
  network: 'Gemini に接続できませんでした',
  refusal: '内容によって翻訳が断られました',
  incomplete: '翻訳が途中で終わりました',
  bad_output: '翻訳結果を読み取れませんでした',
};
const trError = (code) => (code ? TR_ERRORS[code] || `エラー（${code}）` : null);

// 自動翻訳（Gemini）の状態確認・接続テスト・未翻訳分の一括翻訳
function TranslationPanel() {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, guard] = useGuard();
  const load = () => api('admin/translation/status').then(setSt).catch(() => setSt(null));
  useEffect(() => {
    load();
  }, []);
  const test = guard(async () => {
    const r = await api('admin/translation/test', { method: 'POST' });
    setMsg(r.ok ? `接続できました：「${r.sample}」→「${r.text}」` : `接続できませんでした：${trError(r.lastError) || '不明なエラー'}`);
    load();
  });
  const backfill = guard(async () => {
    let total = 0;
    // 1 回の呼び出しは 35 秒までなので、残りがなくなるまで繰り返す
    for (let i = 0; i < 20; i++) {
      const r = await api('admin/translation/backfill', { method: 'POST' });
      total += r.translated;
      setMsg(`翻訳中… ${total} 件完了・残り ${r.remaining} 件`);
      if (!r.remaining || !r.translated) {
        setMsg(r.remaining ? `${total} 件翻訳しました。残り ${r.remaining} 件は翻訳できませんでした：${trError(r.lastError) || '不明なエラー'}` : `完了しました（${total} 件翻訳）`);
        break;
      }
    }
    load();
  });
  if (!st) return null;
  const missingTotal = Object.values(st.missing || {}).reduce((a, b) => a + b, 0);
  return (
    <section className="card">
      <h2>自動翻訳（Gemini）</h2>
      <dl className="kv">
        <dt>状態</dt>
        <dd>{st.enabled ? (st.pausedUntil ? '一時停止中' : '有効') : '無効（キー未設定）'}</dd>
        {st.enabled && (
          <>
            <dt>モデル</dt>
            <dd>{st.model}</dd>
            <dt>キーの形式</dt>
            <dd>{st.keyLooksValid ? 'OK（AIza で始まる）' : '要確認：AIza で始まっていません'}</dd>
            <dt>最後に成功</dt>
            <dd>{st.lastSuccessAt ? jaDateTime(st.lastSuccessAt) : '—'}</dd>
            <dt>直近のエラー</dt>
            <dd>{trError(st.lastError) || 'なし'}</dd>
          </>
        )}
        <dt>未翻訳の掲載文</dt>
        <dd>{missingTotal ? Object.entries(st.missing).map(([l, n]) => `${LANG_LABELS[l]} ${n}`).join('・') : 'なし'}</dd>
      </dl>
      {!st.enabled && (
        <p className="fine">
          Vercel の Environment Variables に GEMINI_API_KEY を登録して再デプロイすると有効になります（手元では npx vercel env pull .env.local のあと開発サーバーを再起動）。
        </p>
      )}
      <div className="row wrap">
        <button className="btn" onClick={test} disabled={busy || !st.enabled}>
          接続テスト
        </button>
        <button className="btn primary" onClick={backfill} disabled={busy || !st.enabled || !missingTotal}>
          未翻訳の掲載文をまとめて翻訳
        </button>
      </div>
      {msg && <p className="fine">{msg}</p>}
    </section>
  );
}
