import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate, fmtDateTime, store, useGuard } from '../lib.js';
import { AvailBadge, Chips, ErrorText, FxNote, Money, Skeleton, TextArea } from '../components/ui.jsx';
import { ALLERGENS, DIETARY, RELIGIOUS, addDays, weekdayOf } from '../../shared/constants.js';

// キャンセルポリシーの表示（12-3）
export function PolicyView({ policy, price, party }) {
  const { t } = useApp();
  if (!policy) return null;
  const rules = [...policy.rules].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return (
    <div className="policy">
      <p className="fine">{t('policy.version', { code: t('policy.' + policy.code), v: policy.version })}</p>
      {policy.isProvisional && <p className="badge warn">{t('policy.provisional')}</p>}
      <ul>
        {rules.map((r) => (
          <li key={r.hoursBefore}>
            {t('policy.rule', { h: r.hoursBefore, p: r.ratePercent })}
            {price ? (
              <div className="fine">
                {t('policy.estimate', { n: party, pct: r.ratePercent })}{' '}
                <Money amount={Math.round((price * party * r.ratePercent) / 100)} />
              </div>
            ) : null}
          </li>
        ))}
        <li>{t('policy.free')}</li>
      </ul>
      <p>
        <strong>{t('policy.late', { m: policy.lateMinutes })}:</strong> {t('policy.' + policy.lateRule)}
      </p>
      <p className="fine">{t('policy.noCharge')}</p>
      <FxNote />
    </div>
  );
}

export default function Reserve() {
  const { slug } = useParams();
  const { t, lang, user, prefs, today, meta } = useApp();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('form');
  const [busy, setBusy] = useState(false);
  const [, guard] = useGuard();
  const draftKey = 'draft:' + slug;
  const [form, setForm] = useState(
    () =>
      store.get(draftKey, null) || {
        date: '',
        time: '',
        partySize: 2,
        dietary: [...prefs.today.dietary, ...(prefs.religiousConsent?.given ? prefs.today.religious : [])],
        allergies: prefs.today.allergies,
        message: '',
        agreeConditions: false,
      },
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api('shops/' + encodeURIComponent(slug), { query: { lang } })
      .then((d) => setShop(d.shop))
      .catch(setError);
  }, [slug, lang]);

  // 選べる日付：〇△で承認期限前の日。電話対応店舗は空き情報が未登録の日も（店主が確認する）
  const dateOptions = useMemo(() => {
    if (!shop) return [];
    const byDate = new Map(shop.availability.map((a) => [a.date, a]));
    const out = [];
    for (let i = 0; i < 21; i++) {
      const d = addDays(today, i);
      const a = byDate.get(d);
      if (a) {
        if (a.status !== 'FULL' && !a.deadlinePassed) out.push({ date: d, a });
      } else if (shop.reservationMethod === 'EMAIL' && !shop.closedDays.includes(weekdayOf(d)) && i > 0) {
        out.push({ date: d, a: null });
      }
    }
    return out;
  }, [shop, today]);

  if (!shop && error) return <ErrorText error={error} />;
  if (!shop || user === undefined) return <Skeleton kind="detail" />;
  if (shop.reservationMethod === 'NONE') return <p>{t('shop.noneNote')}</p>;

  if (!user) {
    return (
      <section className="card">
        <h1>{t('reserve.title')}</h1>
        <p>{t('reserve.loginNeeded')}</p>
        <div className="row wrap">
          <Link className="btn primary" to={`/${lang}/register?next=/${lang}/shops/${slug}/reserve`}>
            {t('auth.register')}
          </Link>
          <Link className="btn" to={`/${lang}/login?next=/${lang}/shops/${slug}/reserve`}>
            {t('auth.login')}
          </Link>
        </div>
      </section>
    );
  }

  const selected = dateOptions.find((o) => o.date === form.date);
  const limited = selected?.a?.status === 'LIMITED';
  const maxParty = Math.min(shop.maxPartySize, limited && selected.a.conditions.includes('MAX_2') ? 2 : 99, limited && selected.a.conditions.includes('SOLO_ONLY') ? 1 : 99);
  const formValid = form.date && form.time && form.partySize >= 1 && form.partySize <= maxParty && (!limited || form.agreeConditions);

  const toPolicy = (e) => {
    e.preventDefault();
    if (!formValid) return;
    store.set(draftKey, form);
    // カード登録を後回しにした人は、ここでダミーのカード画面を通る（11-1）
    if (!user.cardDemoCompleted) {
      navigate(`/${lang}/card?next=/${lang}/shops/${slug}/reserve`);
      return;
    }
    setStep('policy');
    window.scrollTo(0, 0);
  };

  const submit = guard(async () => {
    setBusy(true);
    setError(null);
    try {
      const { reservation } = await api('reservations', {
        method: 'POST',
        body: {
          shopSlug: slug,
          date: form.date,
          time: form.time,
          partySize: form.partySize,
          dietary: form.dietary,
          allergies: form.allergies,
          message: form.message || undefined,
          agreeConditions: limited ? form.agreeConditions : undefined,
          agreePolicy: true,
          policyCode: shop.policy.code,
          policyVersion: shop.policy.version,
        },
      });
      store.remove(draftKey);
      navigate(`/${lang}/reservations/${reservation.id}`, { replace: true });
    } catch (err) {
      setError(err);
      if (err.code === 'card_demo_required') navigate(`/${lang}/card?next=/${lang}/shops/${slug}/reserve`);
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="reserve">
      <h1>{t('reserve.title')}</h1>
      <p className="muted">
        <span lang="ja">{shop.name}</span> {shop.nameRomaji && <>({shop.nameRomaji})</>}
      </p>
      {shop.reservationMethod === 'EMAIL' && <p className="fine">{t('shop.emailNote')}</p>}

      {step === 'form' && (
        <form onSubmit={toPolicy} className="stack">
          <fieldset>
            <legend>{t('reserve.date')}</legend>
            {!dateOptions.length && <p className="muted">{t('reserve.noSlots')}</p>}
            <div className="date-grid">
              {dateOptions.map(({ date, a }) => (
                <button type="button" key={date} className={'date-cell' + (form.date === date ? ' on' : '')} aria-pressed={form.date === date} onClick={() => set({ date, agreeConditions: false })}>
                  <span>{fmtDate(date, lang)}</span>
                  <span className="sym">{a ? (a.status === 'OK' ? '○' : '△') : '?'}</span>
                </button>
              ))}
            </div>
            {selected && (selected.a ? <AvailBadge a={selected.a} /> : <p className="fine">{t('reserve.unknownAvailability')}</p>)}
            {selected?.a && <p className="fine">{t('shop.deadline', { time: fmtDateTime(selected.a.approvalDeadline, lang) })}</p>}
          </fieldset>

          {limited && (
            <fieldset className="conditions">
              <legend>{t('reserve.conditions')}</legend>
              <AvailBadge a={selected.a} compact />
              <label className="check">
                <input type="checkbox" checked={form.agreeConditions} onChange={(e) => set({ agreeConditions: e.target.checked })} required /> {t('reserve.agreeConditions')}
              </label>
            </fieldset>
          )}

          <fieldset>
            <legend>{t('reserve.time')}</legend>
            <Chips multi={false} options={shop.timeSlots} value={form.time} onChange={(v) => set({ time: v || '' })} label={(x) => x} />
          </fieldset>

          <label className="inline-field">
            {t('reserve.party')}{' '}
            <select value={form.partySize} onChange={(e) => set({ partySize: Number(e.target.value) })}>
              {Array.from({ length: Math.min(maxParty, 20) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? t('common.person') : t('common.people', { n })}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>{t('reserve.dietary')}</legend>
            <Chips
              options={[...DIETARY, ...(prefs.religiousConsent?.given ? RELIGIOUS : [])]}
              value={form.dietary}
              onChange={(v) => set({ dietary: v })}
              label={(c) => t((DIETARY.includes(c) ? 'diet.' : 'rel.') + c)}
            />
          </fieldset>
          <fieldset>
            <legend>{t('reserve.allergies')}</legend>
            <Chips options={ALLERGENS} value={form.allergies} onChange={(v) => set({ allergies: v })} label={(c) => t('allergen.' + c)} />
          </fieldset>
          <label className="stack">
            <span>{t('reserve.message')}</span>
            <TextArea value={form.message} onChange={(v) => set({ message: v })} label={t('reserve.message')} />
            <span className="fine">{meta?.translationEnabled ? t('reserve.messageNote') : t('reserve.messageNoteOff')}</span>
          </label>

          <p className="fine">{t('reserve.notYet')}</p>
          <button className="btn primary big" disabled={!formValid}>
            {t('reserve.continue')}
          </button>
        </form>
      )}

      {step === 'policy' && (
        <section className="stack">
          <h2>{t('reserve.policyTitle')}</h2>
          <PolicyView policy={shop.policy} price={shop.priceMin} party={form.partySize} />
          <p className="fine">{t('reserve.notYet')}</p>
          <ErrorText error={error} />
          <div className="row wrap">
            <button className="btn" onClick={() => setStep('form')}>
              {t('common.back')}
            </button>
            <button className="btn primary big" onClick={submit} disabled={busy}>
              {busy ? t('reserve.sending') : t('reserve.agreePolicy')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
