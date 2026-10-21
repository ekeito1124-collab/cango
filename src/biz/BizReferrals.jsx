import { useEffect, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { JA } from './labels.js';
import { BizError } from './BizApp.jsx';

// 町の紹介網（8-3）：普段から知っているお店を紹介する。紹介先の同意と運営確認の後に公開
export default function BizReferrals() {
  const [data, setData] = useState(null);
  const [toShopId, setToShopId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const load = () => api('biz/referrals').then(setData).catch(setError);
  useEffect(() => {
    load();
  }, []);

  const add = guard(async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api('biz/referrals', { method: 'POST', body: { toShopId, message } });
      setToShopId('');
      setMessage('');
      load();
    } catch (err) {
      setError(err);
    }
  });
  const patch = guard((id, body) => api('biz/referrals/' + id, { method: 'PATCH', body }).then(load).catch(setError));
  const remove = guard((id) => api('biz/referrals/' + id, { method: 'DELETE' }).then(load).catch(setError));

  if (!data) return <BizError error={error} />;
  const visible = (r) => r.targetConsent === 'APPROVED' && r.reviewStatus === 'APPROVED' && r.isPublic;

  return (
    <div className="referral-layout">
      <section className="card stack">
        <h2>近くのお店を紹介する</h2>
        <p className="fine">普段から知っているお店を、ご自身の言葉で紹介してください。「一番人気」「絶対おすすめ」などの根拠のない表現は避けてください。紹介先のお店が同意し、運営が確認した後に公開されます。</p>
        <form onSubmit={add} className="stack">
          <select value={toShopId} onChange={(e) => setToShopId(e.target.value)} required>
            <option value="">紹介するお店を選ぶ</option>
            {data.candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.area} / {JA.cat[s.category]}）
              </option>
            ))}
          </select>
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} required placeholder="例：うちの家族もよく利用する食堂です。" />
          <button className="btn primary" disabled={busy}>{busy ? '登録中…' : '紹介を登録する'}</button>
        </form>
      </section>

      <section className="card">
        <h2>あなたのお店からの紹介</h2>
        {!data.outgoing.length && <p className="muted">まだありません。</p>}
        <ul className="plain">
          {data.outgoing.map((r) => (
            <li key={r.id} className="stack">
              <strong>{r.toShop.name}</strong>
              <span>「{r.message}」</span>
              <span className="fine">
                紹介先の同意：{JA.consent[r.targetConsent]}／運営確認：{JA.review[r.reviewStatus]}／{visible(r) ? '公開中' : '非公開'}
              </span>
              <div className="row">
                <button className="btn small" onClick={() => patch(r.id, { isPublic: !r.isPublic })}>
                  {r.isPublic ? '非公開にする' : '公開する'}
                </button>
                <button className="btn small danger-outline" onClick={() => remove(r.id)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>あなたのお店への紹介</h2>
        {!data.incoming.length && <p className="muted">まだありません。</p>}
        <ul className="plain">
          {data.incoming.map((r) => (
            <li key={r.id} className="stack">
              <strong>{r.fromShop.name} から</strong>
              <span>「{r.message}」</span>
              <span className="fine">掲載への同意：{JA.consent[r.targetConsent]}</span>
              <div className="row">
                {r.targetConsent !== 'APPROVED' && (
                  <button className="btn small primary" onClick={() => patch(r.id, { targetConsent: 'APPROVED' })}>
                    掲載に同意する
                  </button>
                )}
                {r.targetConsent !== 'DECLINED' && (
                  <button className="btn small" onClick={() => patch(r.id, { targetConsent: 'DECLINED' })}>
                    掲載しない
                  </button>
                )}
                <button className="btn small danger-outline" onClick={() => remove(r.id)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <BizError error={error} />
    </div>
  );
}
