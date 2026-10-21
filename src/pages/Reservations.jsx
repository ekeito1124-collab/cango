import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate, fmtDateTime, useGuard } from '../lib.js';
import { ErrorText, Skeleton, TextArea, Translated } from '../components/ui.jsx';
import { Character } from '../components/Character.jsx';
import { PolicyView } from './Reserve.jsx';
import { MessageList } from './ShopDetail.jsx';
import ShopMap from '../components/ShopMap.jsx';
import { RESERVATION_ACTIVE, addDays } from '../../shared/constants.js';

function StatusBadge({ status }) {
  const { t } = useApp();
  return <span className={'status ' + status}>{t('status.' + status)}</span>;
}

export function Reservations() {
  const { t, lang, user, today } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (user) api('reservations').then((d) => setList(d.reservations)).catch(setError);
  }, [user]);
  if (user === undefined) return <p>{t('common.loading')}</p>;
  if (!user) return <Navigate to={`/${lang}/login?next=/${lang}/reservations`} replace />;
  if (!list) return error ? <ErrorText error={error} /> : <Skeleton count={3} />;

  const upcoming = list.filter((r) => RESERVATION_ACTIVE.includes(r.status) && r.date >= today);
  const past = list.filter((r) => !upcoming.includes(r)).reverse();
  // リマインド（16-2）：2 日以内の確定予約があれば案内する
  const soon = upcoming.find((r) => r.status === 'CONFIRMED' && r.date <= addDays(today, 2));

  const Item = ({ r }) => (
    <li className="card res-item">
      <Link to={`/${lang}/reservations/${r.id}`}>
        <StatusBadge status={r.status} />
        <strong lang="ja">{r.shop.name}</strong>
        {r.shop.nameRomaji && <span className="romaji">{r.shop.nameRomaji}</span>}
        <div>
          {fmtDate(r.date, lang)} {r.time} · {r.partySize === 1 ? t('common.person') : t('common.people', { n: r.partySize })}
        </div>
        {r.status === 'PENDING' && <div className="fine">{t('res.respondBy', { time: fmtDateTime(r.respondBy, lang) })}</div>}
      </Link>
    </li>
  );

  return (
    <div>
      <h1>{t('res.title')}</h1>
      {!list.length && <p className="muted">{t('res.empty')}</p>}
      {upcoming.length > 0 && (
        <>
          <h2>{t('res.upcoming')}</h2>
          <ul className="res-list">
            {upcoming.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2>{t('res.past')}</h2>
          <ul className="res-list">
            {past.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </>
      )}
      <Character message={soon ? (soon.date === today ? t('char.today') : t('char.remind')) : null} />
    </div>
  );
}

export function ReservationDetail() {
  const { id } = useParams();
  const { t, lang, user, today, meta } = useApp();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [feeRate, setFeeRate] = useState(null);
  const [busy, guard] = useGuard();

  useEffect(() => {
    if (user) api('reservations/' + id).then((d) => setR(d.reservation)).catch(setError);
  }, [id, user]);

  if (user === undefined) return <p>{t('common.loading')}</p>;
  if (!user) return <Navigate to={`/${lang}/login?next=/${lang}/reservations/${id}`} replace />;
  if (!r) return error ? <ErrorText error={error} /> : <Skeleton kind="detail" />;

  const send = guard(async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const d = await api(`reservations/${id}/messages`, { method: 'POST', body: { message: text } });
      setR(d.reservation);
      setText('');
    } catch (err) {
      setError(err);
    }
  });
  const cancel = guard(async () => {
    try {
      const d = await api(`reservations/${id}/cancel`, { method: 'POST' });
      setFeeRate(d.feeRate);
      setR({ ...r, ...d.reservation, messages: r.messages });
      setConfirmCancel(false);
    } catch (err) {
      setError(err);
    }
  });

  const confirmed = r.status === 'CONFIRMED';
  const charMsg = confirmed ? (r.date === today ? t('char.today') : t('char.reserved')) : r.status === 'PENDING' ? t('char.pending') : null;

  return (
    <div className="res-detail">
      {confirmed ? (
        <div className="confirmed-banner">
          <h1>{t('res.confirmedTitle')}</h1>
        </div>
      ) : (
        <h1>
          <StatusBadge status={r.status} />
        </h1>
      )}
      {r.status === 'PENDING' && (
        <p className="card soft">
          {t('reserve.notYet')} {t('res.respondBy', { time: fmtDateTime(r.respondBy, lang) })}
        </p>
      )}

      <section className="card">
        <h2>{t('res.details')}</h2>
        <dl className="kv">
          <dt>{t('shop.about')}</dt>
          <dd>
            <Link to={`/${lang}/shops/${r.shop.slug}`} lang="ja">
              {r.shop.name}
            </Link>{' '}
            {r.shop.nameRomaji && <span className="romaji">{r.shop.nameRomaji}</span>}
          </dd>
          <dt>{t('reserve.date')}</dt>
          <dd>
            {fmtDate(r.date, lang, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} {r.time}
          </dd>
          <dt>{t('reserve.party')}</dt>
          <dd>{r.partySize === 1 ? t('common.person') : t('common.people', { n: r.partySize })}</dd>
          <dt>{t('reserve.dietary')}</dt>
          <dd>{r.dietary.length ? r.dietary.map((d) => t((['vegetarian', 'vegan', 'gluten_free'].includes(d) ? 'diet.' : 'rel.') + d)).join(', ') : t('common.none')}</dd>
          <dt>{t('reserve.allergies')}</dt>
          <dd>{r.allergies.length ? r.allergies.map((a) => t('allergen.' + a)).join(', ') : t('common.none')}</dd>
          <dt>{t('shop.address')}</dt>
          <dd lang="ja">{r.shop.address}</dd>
        </dl>
        {(r.conditionsAgreed.length > 0 || r.conditionNoteAgreed) && (
          <>
            <h3>{t('res.conditionsAgreed')}</h3>
            <p>{r.conditionsAgreed.filter((c) => c !== 'OTHER').map((c) => t('cond.' + c)).join(' · ')}</p>
            <Translated value={r.conditionNoteAgreed} context="agreed condition" />
          </>
        )}
        <ShopMap shops={[{ ...r.shop, category: 'shop', availability: null, reservationMethod: 'NONE' }]} height={180} single />
        <a className="btn" href={r.shop.mapsUrl} target="_blank" rel="noreferrer">
          {t('shop.openMaps')}
        </a>
      </section>

      <section className="card">
        <h2>{t('res.policyAgreed', { time: fmtDateTime(r.policyAgreedAt, lang) })}</h2>
        <PolicyView policy={r.policy} price={r.shop.priceMin} party={r.partySize} />
      </section>

      <section className="card">
        <h2>{t('res.messages')}</h2>
        <MessageList messages={r.messages} />
        {RESERVATION_ACTIVE.includes(r.status) && (
          <form onSubmit={send} className="stack">
            <TextArea value={text} onChange={setText} placeholder={meta?.translationEnabled ? t('res.messagePlaceholder') : t('res.messagePlaceholderPlain')} />
            <button className="btn primary" disabled={busy || !text.trim()}>
              {busy ? t('reserve.sending') : t('common.send')}
            </button>
          </form>
        )}
      </section>

      <ErrorText error={error} />
      {feeRate !== null && <p className="card soft">{t('res.cancelled')} {feeRate > 0 && t('res.cancelFee', { p: feeRate })}</p>}
      {RESERVATION_ACTIVE.includes(r.status) &&
        (confirmCancel ? (
          <div className="card warn">
            <p>{t('res.cancelConfirm')}</p>
            <div className="row">
              <button className="btn danger" onClick={cancel} disabled={busy}>
                {t('res.cancel')}
              </button>
              <button className="btn" onClick={() => setConfirmCancel(false)}>
                {t('common.back')}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn danger-outline" onClick={() => setConfirmCancel(true)}>
            {t('res.cancel')}
          </button>
        ))}

      <Character message={charMsg} />
    </div>
  );
}
