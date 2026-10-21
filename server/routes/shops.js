import { prisma } from '../db.js';
import { bad, codes, int, isDate, notFound, str } from '../http.js';
import { translateMany, translationEnabled } from '../translate.js';
import { getRates } from '../rates.js';
import { availabilityView, latestPolicies, shopTexts, shopView, visibleReferralWhere } from '../shopView.js';
import {
  ALLERGENS,
  AREAS,
  BUDGETS,
  CATEGORIES,
  CLIENTELE,
  DIETARY,
  LANGS,
  OWNER_DISTANCE,
  REGULARS,
  RELIGIOUS,
  SCENES,
  SHOP_LANGS,
  addDays,
  distanceKm,
  isOpenAt,
  matchesScene,
  todayJst,
} from '../../shared/constants.js';

const langOf = (q) => (LANGS.includes(q.lang) ? q.lang : 'en');

function budgetFits(shop, budgetCode) {
  const b = BUDGETS.find((x) => x.code === budgetCode);
  if (!b) return false;
  return shop.priceMin <= (b.max ?? Infinity) && shop.priceMax >= (b.min ?? 0);
}

// 宗教上の制限・食事制限の判定（5-5）
function religiousMatch(shop, code) {
  if (code === 'halal') {
    if (shop.halalCertified) return 'certified';
    // 非認証の参考情報：豚肉不使用などを店舗が自己申告している店
    if (shop.dietaryOptions.includes('no_pork')) return 'reference';
    return null;
  }
  if (shop.dietaryOptions.includes(code)) return 'declared';
  if (shop.halalCertified && (code === 'no_pork' || code === 'no_alcohol')) return 'certified';
  return null;
}

function allergenMatch(shop, allergens) {
  if (!allergens.length) return null;
  if (allergens.every((a) => shop.allergenFreeShopwide.includes(a))) return 'shopwide';
  if (shop.dishes.some((d) => allergens.every((a) => !d.allergens.includes(a)))) return 'some_dishes';
  return null;
}

function parseFilters(q) {
  const date = isDate(q.date) ? q.date : todayJst();
  const f = {
    date,
    categories: codes(q.category, CATEGORIES, 'category'),
    scene: q.scene && SCENES.includes(q.scene) ? q.scene : null,
    availableOnly: q.available === '1',
    budget: BUDGETS.some((b) => b.code === q.budget) ? q.budget : null,
    party: int(q.party, { min: 1, max: 20, name: 'party' }),
    dietary: codes(q.dietary, DIETARY, 'dietary'),
    religious: codes(q.religious, RELIGIOUS, 'religious'),
    halalCertifiedOnly: q.halalCertified === '1',
    allergens: codes(q.allergens, ALLERGENS, 'allergens'),
    adjust: codes(q.adjust, ['less', 'remove'], 'adjust'),
    langs: codes(q.langs, SHOP_LANGS, 'langs'),
    solo: q.solo === '1',
    clientele: codes(q.clientele, CLIENTELE, 'clientele'),
    regulars: codes(q.regulars, REGULARS, 'regulars'),
    notInGuides: q.notInGuides === '1',
    minYears: int(q.minYears, { min: 0, max: 500, name: 'minYears' }),
    ownerDistance: codes(q.ownerDistance, OWNER_DISTANCE, 'ownerDistance'),
    sort: ['recommended', 'years', 'distance', 'price'].includes(q.sort) ? q.sort : 'recommended',
    radiusKm: int(q.radius, { min: 1, max: 100, name: 'radius' }) ?? 30,
  };
  const area = AREAS.find((a) => a.code === q.area);
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  f.center = Number.isFinite(lat) && Number.isFinite(lng) && q.lat !== undefined ? { lat, lng } : area ? { lat: area.lat, lng: area.lng } : null;
  return f;
}

async function searchShops(q) {
  const lang = langOf(q);
  const f = parseFilters(q);
  const now = new Date();
  const today = todayJst(now);
  const shops = await prisma.shop.findMany({
    where: { published: true, ...(f.categories.length ? { category: { in: f.categories } } : {}) },
    include: { dishes: true, availability: { where: { date: { in: [...new Set([f.date, today])] } } } },
  });

  const needsFoodInfo = f.dietary.length || f.religious.length || f.halalCertifiedOnly || f.allergens.length || f.adjust.length || f.langs.length;
  const thisYear = Number(today.slice(0, 4));
  const results = [];
  for (const s of shops) {
    const avail = s.availability.find((a) => a.date === f.date);
    const availToday = s.availability.find((a) => a.date === today);
    const dist = f.center ? distanceKm(f.center, s) : null;
    if (dist !== null && dist > f.radiusKm) continue;
    if (f.scene && !matchesScene(s, f.scene, availToday && { ...availToday, deadlinePassed: availToday.approvalDeadline <= now })) continue;
    if (needsFoodInfo && s.reservationMethod === 'NONE') continue;
    if (f.availableOnly) {
      // 予約不可店舗、満席、承認期限切れ、空き情報なしを除外（5-5）
      if (s.reservationMethod === 'NONE' || !avail || avail.status === 'FULL' || avail.approvalDeadline <= now) continue;
    }
    if (f.party && (s.reservationMethod === 'NONE' || s.maxPartySize < f.party)) continue;
    if (f.dietary.some((d) => !s.dietaryOptions.includes(d) && !s.dishes.some((x) => x.dietary.includes(d)))) continue;

    let halalStatus = null;
    let religiousOk = true;
    for (const r of f.religious) {
      const m = religiousMatch(s, r);
      if (!m) religiousOk = false;
      if (r === 'halal') halalStatus = m;
    }
    if (!religiousOk) continue;
    if (f.halalCertifiedOnly) {
      if (!s.halalCertified) continue;
      halalStatus = 'certified';
    }
    const allergenNote = allergenMatch(s, f.allergens);
    if (f.allergens.length && !allergenNote) continue;
    if (f.adjust.some((a) => !s.ingredientAdjust.includes(a))) continue;
    if (f.langs.length && !f.langs.some((l) => s.languages.includes(l))) continue;
    if (f.solo && !s.soloWelcome) continue;
    if (f.clientele.length && !f.clientele.includes(s.clientele)) continue;
    if (f.regulars.length && !f.regulars.includes(s.regulars)) continue;
    if (f.notInGuides && (s.guidebookListed !== false || s.tourListed !== false)) continue;
    if (f.minYears !== null && (!s.foundedYear || thisYear - s.foundedYear < f.minYears)) continue;
    if (f.ownerDistance.length && !f.ownerDistance.includes(s.ownerDistance)) continue;

    results.push({ s, avail, dist, halalStatus, allergenNote });
  }

  // おすすめ順：評価（取得元があるもののみ）を優先し、予算で調整。ハラル希望時は認証店を優先（5-5）
  const score = (r) => (r.s.ratingSource && r.s.rating ? r.s.rating : 0) + (f.budget && budgetFits(r.s, f.budget) ? 0.75 : 0);
  const halalRank = (r) => (r.halalStatus === 'certified' ? 0 : r.halalStatus === 'reference' ? 1 : 2);
  results.sort((a, b) => {
    if (f.religious.includes('halal') && halalRank(a) !== halalRank(b)) return halalRank(a) - halalRank(b);
    if (f.sort === 'years') return (a.s.foundedYear ?? 9999) - (b.s.foundedYear ?? 9999);
    if (f.sort === 'distance' && a.dist !== null) return a.dist - b.dist;
    if (f.sort === 'price') return a.s.priceMin - b.s.priceMin;
    return score(b) - score(a) || (a.dist ?? 0) - (b.dist ?? 0);
  });

  const texts = results.flatMap((r) => [...shopTexts(r.s), r.avail?.conditionNote]);
  const tr = await translateMany(texts, lang);
  return {
    date: f.date,
    lang,
    shops: results.map((r) =>
      shopView(r.s, tr, {
        extra: {
          availability: r.s.reservationMethod === 'NONE' ? null : availabilityView(r.avail, tr, now),
          distanceKm: r.dist,
          halalStatus: r.halalStatus,
          allergenNote: r.allergenNote,
          budgetFit: f.budget ? budgetFits(r.s, f.budget) : null,
          openNow: isOpenAt(r.s, today, new Date(now.getTime() + 9 * 3600e3).toISOString().slice(11, 16)),
        },
      }),
    ),
  };
}

async function shopDetail(slug, q) {
  const lang = langOf(q);
  const now = new Date();
  const today = todayJst(now);
  const shop = await prisma.shop.findFirst({
    where: { slug, published: true },
    include: {
      dishes: { orderBy: { sortOrder: 'asc' } },
      availability: { where: { date: { gte: today, lte: addDays(today, 30) } }, orderBy: { date: 'asc' } },
      referralsFrom: { where: visibleReferralWhere, include: { toShop: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!shop) throw notFound('shop_not_found');
  const texts = [...shopTexts(shop, { detail: true }), ...shop.availability.map((a) => a.conditionNote)];
  const tr = await translateMany(texts, lang);
  const policies = await latestPolicies(prisma);
  const bookable = shop.reservationMethod !== 'NONE';
  return {
    lang,
    shop: shopView(shop, tr, {
      detail: true,
      extra: {
        availability: bookable ? shop.availability.map((a) => availabilityView(a, tr, now)) : [],
        policy: bookable ? policies[shop.cancelPolicyCode] || null : null,
      },
    }),
  };
}

// 「その街の日常を過ごす半日」の提案（15章）。掲載店舗だけを使い、予約は各店舗で個別に行う
async function halfDayPlan(q) {
  const lang = langOf(q);
  const date = isDate(q.date) ? q.date : todayJst();
  const area = AREAS.find((a) => a.code === q.area) || AREAS[0];
  const center = Number.isFinite(Number(q.lat)) && q.lat !== undefined ? { lat: Number(q.lat), lng: Number(q.lng) } : area;
  const shops = await prisma.shop.findMany({ where: { published: true }, include: { availability: { where: { date } } } });
  const now = new Date();
  const near = shops.map((s) => ({ s, dist: distanceKm(center, s) })).filter((x) => x.dist <= 5);

  const slots = [
    { time: '14:00', scenes: ['tea_time'], categories: ['tea_farm', 'cafe'] },
    { time: '16:00', scenes: ['shotengai_afternoon'], categories: ['wagashi', 'shop', 'workshop'] },
    { time: '18:00', scenes: ['after_work', 'local_diner'], categories: ['izakaya', 'shokudo', 'restaurant'] },
  ];
  const used = new Set();
  const plan = slots.map((slot) => {
    const options = near
      .filter(({ s }) => (slot.scenes.some((x) => s.dailyScenes.includes(x)) || slot.categories.includes(s.category)) && isOpenAt(s, date, slot.time))
      .map(({ s, dist }) => {
        const a = s.availability[0];
        return { s, dist, a, unavailable: s.reservationMethod !== 'NONE' && a && (a.status === 'FULL' || a.approvalDeadline <= now) };
      })
      .filter((o) => !o.unavailable)
      .sort((x, y) => x.dist - y.dist);
    const pick = options.find((o) => !used.has(o.s.id)) || options[0];
    if (pick) used.add(pick.s.id);
    return { time: slot.time, selected: pick?.s.slug || null, options: options.map((o) => o.s.slug) };
  });
  const slugs = new Set(plan.flatMap((p) => p.options));
  const involved = near.filter(({ s }) => slugs.has(s.slug));
  const tr = await translateMany(
    involved.flatMap(({ s }) => [s.description, s.availability[0]?.conditionNote]),
    lang,
  );
  return {
    date,
    plan,
    shops: Object.fromEntries(
      involved.map(({ s, dist }) => [
        s.slug,
        shopView(s, tr, { extra: { distanceKm: dist, availability: s.reservationMethod === 'NONE' ? null : availabilityView(s.availability[0], tr, now) } }),
      ]),
    ),
  };
}

export default [
  [
    'GET',
    'meta',
    async () => ({
      translationEnabled: translationEnabled(),
      aiEnabled: translationEnabled(),
      policies: await latestPolicies(prisma),
      today: todayJst(),
    }),
  ],
  ['GET', 'rates', async () => ({ rates: await getRates() })],
  ['GET', 'shops', async ({ query }) => searchShops(query)],
  ['GET', 'shops/:slug', async ({ params, query }) => shopDetail(params.slug, query)],
  ['GET', 'plan', async ({ query }) => halfDayPlan(query)],

  // 翻訳品質・食品表示・掲載内容の報告（4-2, 9-2）
  [
    'POST',
    'reports',
    async ({ body, user }) => {
      const kind = ['TRANSLATION', 'FOOD_INFO', 'CONTENT'].includes(body.kind) ? body.kind : null;
      if (!kind) throw bad('invalid_kind');
      const report = await prisma.report.create({
        data: {
          kind,
          lang: LANGS.includes(body.lang) ? body.lang : null,
          sourceText: str(body.sourceText, { max: 4000, name: 'sourceText' }),
          translatedText: str(body.translatedText, { max: 4000, name: 'translatedText' }),
          context: str(body.context, { max: 200, name: 'context' }),
          comment: str(body.comment, { max: 2000, name: 'comment' }),
          shopId: str(body.shopId, { max: 50, name: 'shopId' }),
          userId: user?.id || null,
        },
      });
      return { ok: true, id: report.id };
    },
  ],

  // 用語集（固定訳）の公開一覧
  [
    'GET',
    'glossary',
    async ({ query }) => {
      const lang = langOf(query);
      const rows = await prisma.glossaryTerm.findMany({ orderBy: { ja: 'asc' } });
      return { terms: rows.map((r) => ({ ja: r.ja, text: r[lang], note: r.note })) };
    },
  ],
];

