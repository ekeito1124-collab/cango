import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDateTime, useGuard } from '../lib.js';
import { AvailabilityGrid, ErrorText, Skeleton, TextArea, FxNote, GuideInfo, Money, ReportDialog, ShopPhoto, Translated } from '../components/ui.jsx';
import { Character, shopReason } from '../components/Character.jsx';
import ShopMap from '../components/ShopMap.jsx';
import { DAILY_PROFILE_FIELDS } from '../../shared/constants.js';

export default function ShopDetail() {
  const { slug } = useParams();
  const { t, lang, today, openConverter } = useApp();
  const [shop, setShop] = useState(null);
  const [error, setError] = useState(null);
  const [reportFood, setReportFood] = useState(false);
  const [showInquiry, setShowInquiry] = useState(false);

  useEffect(() => {
    setShop(null);
    api('shops/' + encodeURIComponent(slug), { query: { lang } })
      .then((d) => setShop(d.shop))
      .catch(setError);
  }, [slug, lang]);

  if (error) return <p className="error">{error.status === 404 ? t('shop.notFound') : t('common.error')}</p>;
  if (!shop) return <Skeleton kind="detail" />;

  const year = Number(today.slice(0, 4));
  const bookable = shop.reservationMethod !== 'NONE';
  const reason = shopReason(shop, t, year);

  return (
    <article className="shop-detail">
      <ShopPhoto shop={shop} className="hero" />
      <header className="shop-head">
        <h1 lang="ja">{shop.name}</h1>
        {shop.nameRomaji && <p className="romaji">{shop.nameRomaji}</p>}
        <p className="meta">
          {t('cat.' + shop.category)} · {shop.area}
        </p>
        {shop.rating ? <p className="fine">{t('shop.rating', shop.rating)}</p> : <p className="fine">{t('shop.noRating')}</p>}
      </header>

      <Translated value={shop.description} context="shop description" />

      <section className="card facts">
        <dl className="kv">
          <dt>{t('shop.price')}</dt>
          <dd>
            <Money amount={shop.priceMin} max={shop.priceMax} />{' '}
            <button className="link small" onClick={() => openConverter(shop.priceMin)}>
              {t('fx.calc')}
            </button>
            {shop.priceNote && <Translated value={shop.priceNote} context="price note" />}
          </dd>
          <dt>{t('shop.hours')}</dt>
          <dd>
            <Translated value={shop.hoursText} context="opening hours" />
          </dd>
          <dt>{t('shop.method')}</dt>
          <dd>{t('method.' + shop.reservationMethod)}</dd>
          <dt>{t('shop.address')}</dt>
          <dd lang="ja">{shop.address}</dd>
        </dl>
        <FxNote />
        <ShopMap shops={[shop]} height={180} single />
        <a className="btn block" href={shop.mapsUrl} target="_blank" rel="noreferrer">
          {t('shop.openMaps')}
        </a>
      </section>

      {bookable && (
        <section className="card">
          <h2>{t('shop.availability')}</h2>
          <p className="fine">{t('shop.availabilityNote')}</p>
          <AvailabilityGrid list={shop.availability} />
          {shop.availability[0] && <p className="fine">{t('explore.lastUpdated', { time: fmtDateTime(maxUpdated(shop.availability), lang) })}</p>}
        </section>
      )}

      {shop.normalBusiness && (
        <section className="card soft">
          <h2>{t('shop.everyday')}</h2>
          <p>{t('shop.everydayBody')}</p>
          {shop.specialOffer && (
            <>
              <h3>{t('shop.special')}</h3>
              <Translated value={shop.specialOffer} context="special offer" />
            </>
          )}
        </section>
      )}

      {shop.ownerWords && (
        <section className="owner-words">
          <h2>{t('shop.ownerWords')}</h2>
          <blockquote>
            <Translated value={shop.ownerWords} context="owner's words" />
          </blockquote>
        </section>
      )}

      {shop.dailyProfile && Object.keys(shop.dailyProfile).length > 0 && (
        <section>
          <h2>{t('shop.dailyProfile')}</h2>
          <dl className="profile">
            {DAILY_PROFILE_FIELDS.filter((f) => shop.dailyProfile[f]).map((f) => (
              <div key={f}>
                <dt>{t('profile.' + f)}</dt>
                <dd>
                  <Translated value={shop.dailyProfile[f]} context={'daily profile: ' + f} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h2>{t('shop.guide')}</h2>
        <p className="fine">{t('common.selfReported')}</p>
        <GuideInfo guide={shop.guide} />
        <dl className="kv">
          <dt>{t('shop.guidebook')}</dt>
          <dd>{shop.guide.guidebookListed == null ? '—' : shop.guide.guidebookListed ? t('shop.listed') : t('shop.notListed')}</dd>
          <dt>{t('shop.tours')}</dt>
          <dd>{shop.guide.tourListed == null ? '—' : shop.guide.tourListed ? t('shop.listed') : t('shop.notListed')}</dd>
        </dl>
      </section>

      {bookable ? (
        <>
          <section>
            <h2>{t('shop.food')}</h2>
            <p className="fine">{t('shop.foodSelfReported')}</p>
            {shop.halalCertified && (
              <p>
                <span className="badge halal">{t('shop.halalCertified')}</span> {shop.halalCertifier && t('shop.certifiedBy', { name: shop.halalCertifier })}
              </p>
            )}
            {shop.dietaryOptions.length > 0 && (
              <ul className="guide-tags">
                {shop.dietaryOptions.map((d) => (
                  <li key={d}>{t((['vegetarian', 'vegan', 'gluten_free'].includes(d) ? 'diet.' : 'rel.') + d)}</li>
                ))}
              </ul>
            )}
            {shop.appealPoints?.length > 0 && (
              <>
                <h3>{t('shop.appeal')}</h3>
                {shop.appealPoints.map((p, i) => (
                  <Translated key={i} value={p} context="shop appeal point" />
                ))}
              </>
            )}
            {shop.allergenFreeShopwide.length > 0 && (
              <p>
                {t('shop.shopwideFree')}: {shop.allergenFreeShopwide.map((a) => t('allergen.' + a)).join(', ')}
              </p>
            )}
            {shop.dishes?.length > 0 && (
              <>
                <h3>{t('shop.dishes')}</h3>
                <ul className="dishes">
                  {shop.dishes.map((d) => (
                    <li key={d.id}>
                      <div className="dish-head">
                        <Translated value={d.name} as="strong" context="dish name" />
                        {d.price != null && <Money amount={d.price} />}
                      </div>
                      <div className="fine">{d.allergens.length ? t('shop.containsAllergens', { list: d.allergens.map((a) => t('allergen.' + a)).join(', ') }) : t('shop.noAllergensListed')}</div>
                      {d.adjustable.length > 0 && <div className="fine">{t('shop.adjustable', { list: d.adjustable.map((a) => t('adjust.' + a)).join(', ') })}</div>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="fine warn-text">{t('shop.crossContact')}</p>
            <button className="link" onClick={() => setReportFood(true)}>
              {t('shop.reportFood')}
            </button>
            {reportFood && (
              <ReportDialog title={t('report.food')} placeholder={t('report.foodPlaceholder')} onClose={() => setReportFood(false)} payload={{ kind: 'FOOD_INFO', lang, shopId: shop.id, context: shop.slug }} />
            )}
          </section>

          <section>
            <h2>{t('shop.languages')}</h2>
            <p>{shop.languages.map((l) => t('shopLang.' + l)).join(', ') || '—'}</p>
          </section>
        </>
      ) : (
        <section className="card soft">
          <p>{t('shop.noneNote')}</p>
        </section>
      )}

      {shop.referrals.length > 0 && (
        <section>
          <h2>{t('shop.referrals')}</h2>
          <ul className="referrals">
            {shop.referrals.map((r) => (
              <li key={r.id} className="card">
                <Link to={`/${lang}/shops/${r.to.slug}`}>
                  <strong lang="ja">{r.to.name}</strong> {r.to.nameRomaji && <span className="romaji">{r.to.nameRomaji}</span>}
                </Link>
                <div className="fine">
                  {t('cat.' + r.to.category)} · {t('method.' + r.to.reservationMethod)}
                </div>
                <Translated value={r.message} context="owner referral" />
                <div className="fine">{t('shop.referralFrom', { name: r.from.name })}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bookable && (
        <div className="cta-bar">
          <Link className="btn primary big" to={`/${lang}/shops/${shop.slug}/reserve`}>
            {shop.reservationMethod === 'EMAIL' ? t('shop.requestEmail') : t('shop.request')}
          </Link>
          {shop.reservationMethod === 'EMAIL' && <p className="fine">{t('shop.emailNote')}</p>}
          <button className="link" onClick={() => setShowInquiry((s) => !s)}>
            {t('shop.askQuestion')}
          </button>
        </div>
      )}
      {showInquiry && <Inquiry slug={shop.slug} />}

      <Character message={reason}>
        <AskBox shop={shop} onAskShop={() => setShowInquiry(true)} />
      </Character>
    </article>
  );
}

const maxUpdated = (list) => list.reduce((m, a) => (a.updatedAt > m ? a.updatedAt : m), list[0].updatedAt);

// 店舗についての質問（10-3, 10-4）。キャラクター表示中かつ AI が有効なときのみ
function AskBox({ shop, onAskShop }) {
  const { t, lang, aiActive } = useApp();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!aiActive) return null;
  const ask = async (question) => {
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api('ai/ask', { method: 'POST', body: { shopSlug: shop.slug, question, lang } }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="askbox">
      <div className="chips">
        {['tip', 'card', 'lang'].map((k) => (
          <button key={k} type="button" className="chip" onClick={() => ask(t('char.quick.' + k))} disabled={busy}>
            {t('char.quick.' + k)}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('char.askPlaceholder')} maxLength={300} />
        <button className="btn" disabled={busy}>
          {busy ? '…' : t('char.ask')}
        </button>
      </form>
      <ErrorText error={error} />
      {answer && (
        <div className="answer">
          <p>{answer.answer}</p>
          {answer.kind === 'general_travel' && <p className="fine">{t('char.askGeneral')}</p>}
          {answer.kind === 'unknown' && shop.reservationMethod !== 'NONE' && (
            <button className="btn small" onClick={onAskShop}>
              {t('char.askShop')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 予約前の問い合わせ（翻訳付きメッセージ）
export function Inquiry({ slug }) {
  const { t, lang, user, meta } = useApp();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  useEffect(() => {
    if (user) api(`shops/${slug}/inquiries`).then((d) => setMessages(d.messages)).catch(setError);
  }, [slug, user]);
  if (user === undefined) return null;
  if (!user) {
    return (
      <section className="card">
        <h2>{t('inq.title')}</h2>
        <p>{t('reserve.loginNeeded')}</p>
        <Link className="btn primary" to={`/${lang}/login?next=/${lang}/shops/${slug}`}>
          {t('nav.login')}
        </Link>
      </section>
    );
  }
  const send = guard(async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const d = await api(`shops/${slug}/inquiries`, { method: 'POST', body: { message: text } });
      setMessages(d.messages);
      setText('');
    } catch (err) {
      setError(err);
    }
  });
  return (
    <section className="card" id="inquiry">
      <h2>{t('inq.title')}</h2>
      <MessageList messages={messages} />
      <form onSubmit={send} className="stack">
        <TextArea value={text} onChange={setText} placeholder={meta?.translationEnabled ? t('inq.placeholder') : t('inq.placeholderPlain')} />
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? t('reserve.sending') : t('common.send')}
        </button>
      </form>
      <ErrorText error={error} />
    </section>
  );
}

export function MessageList({ messages }) {
  const { t, lang } = useApp();
  if (!messages) return null;
  if (!messages.length) return <p className="muted">{t('inq.empty')}</p>;
  return (
    <ul className="messages">
      {messages.map((m) => (
        <li key={m.id} className={m.sender === 'TRAVELER' ? 'mine' : 'theirs'}>
          <Translated value={m.text} context="message" />
          <span className="fine">{fmtDateTime(m.createdAt, lang)}</span>
        </li>
      ))}
    </ul>
  );
}
