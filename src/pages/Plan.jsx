import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate, store } from '../lib.js';
import { AvailBadge, ErrorText, Money, Skeleton } from '../components/ui.jsx';
import { Character } from '../components/Character.jsx';
import ShopMap from '../components/ShopMap.jsx';
import { AREAS, addDays } from '../../shared/constants.js';

// 「その街の日常を過ごす半日」の提案（15章）
export default function Plan() {
  const { t, lang, user, today, aiActive } = useApp();
  const [date, setDate] = useState(today);
  const [area, setArea] = useState('uji');
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState({});
  const [mine, setMine] = useState([]);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setData(null);
    api('plan', { query: { lang, date, area } })
      .then((d) => {
        setData(d);
        const savedPlan = store.get('plan', null);
        const fromSaved = savedPlan && savedPlan.date === date && savedPlan.area === area ? savedPlan.picks : null;
        setPicks(fromSaved || Object.fromEntries(d.plan.map((p) => [p.time, p.selected])));
      })
      .catch(setError);
  }, [lang, date, area]);

  useEffect(() => {
    if (user) api('reservations').then((d) => setMine(d.reservations)).catch(() => {});
  }, [user]);

  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const chosen = data ? data.plan.map((p) => picks[p.time]).filter(Boolean).map((slug) => data.shops[slug]) : [];
  // 店舗ごとの予約状況（一部だけ承認された場合も分かるように表示：15-4）
  const statusOf = (slug) => mine.find((r) => r.shop.slug === slug && r.date === date && !['CANCELLED_BY_TRAVELER'].includes(r.status));
  const statuses = chosen.map((s) => statusOf(s.slug)?.status).filter(Boolean);
  const partial = statuses.includes('CONFIRMED') && statuses.some((s) => s !== 'CONFIRMED');

  return (
    <div className="plan">
      <h1>{t('plan.title')}</h1>
      <p className="fine">{t('plan.intro')}</p>
      <div className="search-bar">
        <label>
          <span>{t('explore.date')}</span>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmtDate(d, lang)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('explore.area')}</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name[lang] || a.name.en}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText error={error} />
      {!data && !error && <Skeleton count={3} />}
      {partial && <p className="card warn">{t('plan.partial')}</p>}
      {data && (
        <>
          <ol className="timeline">
            {data.plan.map((p) => {
              const shop = data.shops[picks[p.time]];
              const res = shop && statusOf(shop.slug);
              return (
                <li key={p.time}>
                  <span className="time">{p.time}</span>
                  <div className="card">
                    {shop ? (
                      <>
                        <Link to={`/${lang}/shops/${shop.slug}`}>
                          <strong lang="ja">{shop.name}</strong> {shop.nameRomaji && <span className="romaji">{shop.nameRomaji}</span>}
                        </Link>
                        <div className="meta">
                          {t('cat.' + shop.category)} · <Money amount={shop.priceMin} max={shop.priceMax} /> · {t('method.' + shop.reservationMethod)}
                        </div>
                        {shop.reservationMethod !== 'NONE' && <AvailBadge a={shop.availability} inLink />}
                        {res && <p className="fine">{t('plan.yourStatus', { status: t('status.' + res.status) })}</p>}
                      </>
                    ) : (
                      <p className="muted">{t('plan.noOption')}</p>
                    )}
                    {p.options.length > 1 && (
                      <label className="inline-field">
                        {t('plan.change')}{' '}
                        <select value={picks[p.time] || ''} onChange={(e) => setPicks({ ...picks, [p.time]: e.target.value })}>
                          {p.options.map((slug) => (
                            <option key={slug} value={slug}>
                              {data.shops[slug].nameRomaji || data.shops[slug].name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="fine">{t('plan.bookEach')}</p>
          {chosen.length > 0 && <ShopMap shops={chosen} height={240} />}
          <button
            className="btn"
            onClick={() => {
              store.set('plan', { date, area, picks });
              setSaved(true);
            }}
          >
            {saved ? t('plan.saved') : t('plan.save')}
          </button>
        </>
      )}
      <Character message={aiActive ? t('plan.aiHint') : null} />
    </div>
  );
}
