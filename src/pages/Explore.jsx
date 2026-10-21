import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate, store } from '../lib.js';
import { AvailBadge, Chips, ErrorText, FxNote, GuideInfo, Money, ShopPhoto, Skeleton } from '../components/ui.jsx';
import { Character } from '../components/Character.jsx';
import Onboarding, { ReligiousQuestion } from '../components/Onboarding.jsx';
import ShopMap from '../components/ShopMap.jsx';
import {
  ALLERGENS,
  AREAS,
  BUDGETS,
  CATEGORIES,
  CLIENTELE,
  DIETARY,
  OWNER_DISTANCE,
  REGULARS,
  SCENES,
  SHOP_LANGS,
  addDays,
} from '../../shared/constants.js';

function initialFilters(prefs, today) {
  const saved = store.get('filters', null);
  const base = {
    date: today,
    area: 'uji',
    lat: null,
    lng: null,
    scene: null,
    category: [],
    available: false,
    party: null,
    halalCertified: false,
    adjust: [],
    langs: [],
    solo: false,
    clientele: [],
    regulars: [],
    notInGuides: false,
    minYears: null,
    ownerDistance: [],
    sort: 'recommended',
  };
  const merged = saved && saved.date >= today ? { ...base, ...saved } : base;
  // 今日の希望（予算・食事制限・アレルギー・宗教上の制限）を絞り込みに反映（5-4）
  return {
    ...merged,
    budget: prefs.today.budget,
    dietary: prefs.today.dietary,
    allergens: prefs.today.allergies,
    religious: prefs.religiousConsent?.given ? prefs.today.religious : [],
  };
}

export default function Explore() {
  const { t, lang, prefs, setPrefs, today, needsTodayCheck, aiActive } = useApp();
  const [filters, setFilters] = useState(() => initialFilters(prefs, today));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [onboarding, setOnboarding] = useState(!prefs.onboarded ? 'full' : needsTodayCheck ? 'today' : null);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  // 今日の希望が更新されたら絞り込みに反映する
  useEffect(() => {
    set({
      budget: prefs.today.budget,
      dietary: prefs.today.dietary,
      allergens: prefs.today.allergies,
      religious: prefs.religiousConsent?.given ? prefs.today.religious : [],
    });
  }, [prefs.today, prefs.religiousConsent]);

  useEffect(() => {
    store.set('filters', { ...filters, budget: undefined, dietary: undefined, allergens: undefined, religious: undefined });
    let alive = true;
    setError(null);
    api('shops', {
      query: {
        lang,
        date: filters.date,
        area: filters.lat ? undefined : filters.area,
        lat: filters.lat,
        lng: filters.lng,
        scene: filters.scene,
        category: filters.category,
        available: filters.available,
        budget: filters.budget,
        party: filters.party,
        dietary: filters.dietary,
        religious: filters.religious,
        halalCertified: filters.halalCertified,
        allergens: filters.allergens,
        adjust: filters.adjust,
        langs: filters.langs,
        solo: filters.solo,
        clientele: filters.clientele,
        regulars: filters.regulars,
        notInGuides: filters.notInGuides,
        minYears: filters.minYears,
        ownerDistance: filters.ownerDistance,
        sort: filters.sort,
      },
    })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [filters, lang]);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => set({ lat: pos.coords.latitude, lng: pos.coords.longitude, sort: 'distance' }),
      () => setError({ code: 'location_failed' }),
      { timeout: 8000 },
    );
  };

  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const shops = data?.shops || [];
  const halalMode = filters.religious.includes('halal') && !filters.halalCertified;
  const certified = halalMode ? shops.filter((s) => s.halalStatus === 'certified') : shops;
  const reference = halalMode ? shops.filter((s) => s.halalStatus === 'reference') : [];
  const center = filters.lat ? { lat: filters.lat, lng: filters.lng } : AREAS.find((a) => a.code === filters.area);

  return (
    <div className="explore">
      {onboarding && <Onboarding onlyToday={onboarding === 'today'} onDone={() => setOnboarding(null)} />}

      <section className="scenes" aria-label={t('explore.scenes')}>
        <h2 className="section-title">{t('explore.scenes')}</h2>
        <div className="scene-row">
          {SCENES.map((s) => (
            <button key={s} className={'scene' + (filters.scene === s ? ' on' : '')} aria-pressed={filters.scene === s} onClick={() => set({ scene: filters.scene === s ? null : s })}>
              {t('scene.' + s)}
            </button>
          ))}
        </div>
      </section>

      {aiActive && <WishBox onApply={(f) => set(f)} />}

      <section className="search-bar">
        <label>
          <span>{t('explore.date')}</span>
          <select value={filters.date} onChange={(e) => set({ date: e.target.value })}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmtDate(d, lang)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('explore.area')}</span>
          <select value={filters.lat ? 'here' : filters.area} onChange={(e) => (e.target.value === 'here' ? locate() : set({ area: e.target.value, lat: null, lng: null }))}>
            {AREAS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name[lang] || a.name.en}
              </option>
            ))}
            <option value="here">{t('explore.useLocation')}</option>
          </select>
        </label>
        <label>
          <span>{t('explore.sort')}</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            {['recommended', 'years', 'distance', 'price'].map((s) => (
              <option key={s} value={s}>
                {t('sort.' + s)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          {showFilters ? t('explore.hideFilters') : t('explore.filters')}
        </button>
      </section>

      {showFilters && <FilterPanel filters={filters} set={set} prefs={prefs} setPrefs={setPrefs} />}

      <div className="view-toggle">
        <span>{data ? t('explore.results', { n: shops.length }) : t('common.loading')}</span>
        <button className="link" onClick={() => setShowMap((m) => !m)}>
          {showMap ? t('explore.list') : t('explore.map')}
        </button>
      </div>

      <ErrorText error={error} />
      {showMap && data && <ShopMap shops={shops} center={center} height={260} />}

      {!data && !error && <Skeleton count={4} />}
      {data && !shops.length && <p className="empty">{t('explore.noResults')}</p>}
      {halalMode && certified.length > 0 && <h3 className="section-title">{t('explore.certifiedSection')}</h3>}
      <ul className="shop-list">
        {certified.map((s) => (
          <ShopCard key={s.slug} shop={s} />
        ))}
      </ul>
      {reference.length > 0 && (
        <section className="reference">
          <h3 className="section-title">{t('explore.reference')}</h3>
          <p className="fine">{t('explore.referenceNote')}</p>
          <ul className="shop-list">
            {reference.map((s) => (
              <ShopCard key={s.slug} shop={s} />
            ))}
          </ul>
        </section>
      )}
      <FxNote />

      <Character message={t('char.explore')} />
    </div>
  );
}

function ShopCard({ shop }) {
  const { t, lang } = useApp();
  return (
    <li className="shop-card">
      <Link to={`/${lang}/shops/${shop.slug}`} className="shop-card-link">
        <ShopPhoto shop={shop} />
        <div className="shop-card-body">
          <div className="shop-name">
            <strong lang="ja">{shop.name}</strong>
            {shop.nameRomaji && <span className="romaji">{shop.nameRomaji}</span>}
          </div>
          <div className="meta">
            {t('cat.' + shop.category)} · <Money amount={shop.priceMin} max={shop.priceMax} />
            {shop.distanceKm !== null && shop.distanceKm !== undefined && <> · {t('explore.distance', { km: shop.distanceKm.toFixed(1) })}</>}
          </div>
          {shop.halalCertified && <span className="badge halal">{t('shop.halalCertified')}</span>}
          {shop.halalStatus === 'reference' && <span className="badge ref">{t('explore.reference')}</span>}
          {shop.allergenNote === 'some_dishes' && <span className="badge warn">{t('explore.allergenSome')}</span>}
          {shop.allergenNote === 'shopwide' && <span className="badge">{t('explore.allergenShopwide')}</span>}
          <GuideInfo guide={shop.guide} max={3} />
          {shop.reservationMethod === 'NONE' ? <span className="avail none">{t('explore.notBookable')}</span> : <AvailBadge a={shop.availability} inLink />}
          {shop.rating && <div className="fine">{t('shop.rating', shop.rating)}</div>}
        </div>
      </Link>
    </li>
  );
}

function FilterPanel({ filters, set, prefs, setPrefs }) {
  const { t } = useApp();
  const updateToday = (patch) => setPrefs({ today: { ...prefs.today, ...patch } });
  return (
    <section className="filters">
      <h3>{t('explore.guideInfo')}</h3>
      <p className="fine">{t('explore.guideInfoNote')}</p>
      <fieldset>
        <Chips options={CLIENTELE} value={filters.clientele} onChange={(v) => set({ clientele: v })} label={(c) => t('clientele.' + c)} />
        <Chips options={REGULARS} value={filters.regulars} onChange={(v) => set({ regulars: v })} label={(c) => t('regulars.' + c)} />
        <Chips options={OWNER_DISTANCE} value={filters.ownerDistance} onChange={(v) => set({ ownerDistance: v })} label={(c) => t('ownerDist.' + c)} />
        <label className="check">
          <input type="checkbox" checked={filters.notInGuides} onChange={(e) => set({ notInGuides: e.target.checked })} /> {t('explore.notInGuides')}
        </label>
        <label className="inline-field">
          {t('explore.minYears')}{' '}
          <select value={filters.minYears ?? ''} onChange={(e) => set({ minYears: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t('common.any')}</option>
            {[10, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                {t('explore.years', { n })}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <h3>{t('explore.otherConditions')}</h3>
      <fieldset>
        <legend>{t('explore.category')}</legend>
        <Chips options={CATEGORIES} value={filters.category} onChange={(v) => set({ category: v })} label={(c) => t('cat.' + c)} />
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={filters.available} onChange={(e) => set({ available: e.target.checked })} /> {t('explore.availableOnly')}
      </label>
      <label className="inline-field">
        {t('explore.party')}{' '}
        <select value={filters.party ?? ''} onChange={(e) => set({ party: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('common.any')}</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? t('common.person') : t('common.people', { n })}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{t('onb.budget')}</legend>
        <Chips multi={false} options={BUDGETS.map((b) => b.code)} value={filters.budget} onChange={(v) => updateToday({ budget: v })} label={(c) => t('budget.' + c)} />
      </fieldset>
      <fieldset>
        <legend>{t('onb.dietary')}</legend>
        <Chips options={DIETARY} value={filters.dietary} onChange={(v) => updateToday({ dietary: v })} label={(c) => t('diet.' + c)} />
      </fieldset>
      <fieldset>
        <legend>{t('onb.religious')}</legend>
        <ReligiousQuestion value={filters.religious} onChange={(v) => updateToday({ religious: v })} />
        <label className="check">
          <input type="checkbox" checked={filters.halalCertified} onChange={(e) => set({ halalCertified: e.target.checked })} /> {t('explore.halalCertifiedOnly')}
        </label>
      </fieldset>
      <fieldset>
        <legend>{t('onb.allergies')}</legend>
        <Chips options={ALLERGENS} value={filters.allergens} onChange={(v) => updateToday({ allergies: v })} label={(c) => t('allergen.' + c)} />
      </fieldset>
      <fieldset>
        <legend>{t('explore.adjust')}</legend>
        <Chips options={['less', 'remove']} value={filters.adjust} onChange={(v) => set({ adjust: v })} label={(c) => t('adjust.' + c)} />
      </fieldset>
      <fieldset>
        <legend>{t('explore.shopLangs')}</legend>
        <Chips options={SHOP_LANGS} value={filters.langs} onChange={(v) => set({ langs: v })} label={(c) => t('shopLang.' + c)} />
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={filters.solo} onChange={(e) => set({ solo: e.target.checked })} /> {t('explore.solo')}
      </label>
    </section>
  );
}

// AI による条件変換（10-2）。キャラクター表示中のみ
function WishBox({ onApply }) {
  const { t, setPrefs, prefs } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { filters: f } = await api('ai/parse', { method: 'POST', body: { text } });
      setResult(f);
      onApply({
        category: f.category,
        scene: f.scene,
        clientele: f.clientele,
        ownerDistance: f.ownerDistance,
        langs: f.langs,
        solo: f.solo,
        notInGuides: f.notInGuides,
        available: f.available,
        party: f.party,
      });
      setPrefs({
        today: {
          ...prefs.today,
          dietary: f.dietary,
          allergies: f.allergens,
          religious: prefs.religiousConsent?.given ? f.religious : prefs.today.religious,
        },
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const used = result
    ? [
        ...result.category.map((c) => t('cat.' + c)),
        ...(result.scene ? [t('scene.' + result.scene)] : []),
        ...result.clientele.map((c) => t('clientele.' + c)),
        ...result.ownerDistance.map((c) => t('ownerDist.' + c)),
        ...result.dietary.map((c) => t('diet.' + c)),
        ...(prefs.religiousConsent?.given ? result.religious.map((c) => t('rel.' + c)) : []),
        ...result.allergens.map((c) => t('allergen.' + c)),
        ...result.langs.map((c) => t('shopLang.' + c)),
        ...(result.solo ? [t('explore.solo')] : []),
        ...(result.notInGuides ? [t('explore.notInGuides')] : []),
        ...(result.available ? [t('explore.availableOnly')] : []),
        ...(result.party ? [t('common.people', { n: result.party })] : []),
      ]
    : [];
  return (
    <form className="wish" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('char.wishPlaceholder')} maxLength={300} />
      <button className="btn primary" disabled={busy}>
        {busy ? t('common.loading') : t('char.wishApply')}
      </button>
      <ErrorText error={error} />
      {result && (
        <div className="wish-result">
          <p className="fine">{t('char.wishUsed')}</p>
          <ul className="guide-tags">
            {used.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {result.unsupported.length > 0 && (
            <p className="fine">
              {t('char.wishUnsupported')} {result.unsupported.join(', ')}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
