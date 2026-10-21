import { localized } from './translate.js';
import { DAILY_PROFILE_FIELDS, googleMapsUrl } from '../shared/constants.js';

export { DAILY_PROFILE_FIELDS };

export function availabilityView(a, tr, now = new Date()) {
  if (!a) return null;
  return {
    date: a.date,
    status: a.status,
    conditions: a.conditions,
    conditionNote: localized(tr, a.conditionNote),
    updatedAt: a.updatedAt,
    approvalDeadline: a.approvalDeadline,
    deadlinePassed: a.approvalDeadline <= now,
  };
}

export async function latestPolicies(prisma) {
  const rows = await prisma.cancellationPolicy.findMany({ orderBy: { version: 'desc' } });
  const out = {};
  for (const r of rows) if (!out[r.code]) out[r.code] = r;
  return out;
}

// 翻訳対象の日本語テキストを集める
export function shopTexts(shop, { detail = false } = {}) {
  const t = [shop.description];
  if (!detail) return t;
  t.push(shop.hoursText, shop.priceNote, shop.specialOffer, ...(shop.appealPoints || []));
  if (shop.ownerWordsStatus === 'APPROVED') t.push(shop.ownerWords);
  if (shop.dailyProfileStatus === 'APPROVED' && shop.dailyProfile) {
    for (const f of DAILY_PROFILE_FIELDS) t.push(shop.dailyProfile[f]);
  }
  for (const d of shop.dishes || []) t.push(d.name);
  for (const r of shop.referralsFrom || []) t.push(r.message);
  return t.filter(Boolean);
}

export function shopView(shop, tr, { detail = false, extra = {} } = {}) {
  const bookable = shop.reservationMethod !== 'NONE';
  const v = {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    nameRomaji: shop.nameRomaji,
    category: shop.category,
    area: shop.area,
    address: shop.address,
    lat: shop.lat,
    lng: shop.lng,
    photo: shop.photos?.[0] || null,
    description: localized(tr, shop.description),
    priceMin: shop.priceMin,
    priceMax: shop.priceMax,
    reservationMethod: shop.reservationMethod,
    // 評価は取得元がある場合のみ返す（架空の評価を表示しない）
    rating: shop.ratingSource ? { value: shop.rating, count: shop.ratingCount, source: shop.ratingSource } : null,
    guide: {
      clientele: shop.clientele,
      regulars: shop.regulars,
      guidebookListed: shop.guidebookListed,
      tourListed: shop.tourListed,
      foundedYear: shop.foundedYear,
      ownerDistance: shop.ownerDistance,
      soloWelcome: shop.soloWelcome,
    },
    normalBusiness: shop.normalBusiness,
    dailyScenes: shop.dailyScenes,
    mapsUrl: googleMapsUrl(shop),
    isDemo: shop.isDemo,
    ...extra,
  };
  // 予約不可店舗には食事・対応言語などの追加情報を出さない（12-1 C, 8-2）
  if (bookable) {
    Object.assign(v, {
      languages: shop.languages,
      halalCertified: shop.halalCertified,
      halalCertifier: shop.halalCertified ? shop.halalCertifier : null,
      dietaryOptions: shop.dietaryOptions,
      allergenFreeShopwide: shop.allergenFreeShopwide,
      ingredientAdjust: shop.ingredientAdjust,
      maxPartySize: shop.maxPartySize,
    });
  }
  if (!detail) return v;

  Object.assign(v, {
    photos: shop.photos,
    hoursText: localized(tr, shop.hoursText),
    closedDays: shop.closedDays,
    priceNote: localized(tr, shop.priceNote),
    ownerWords: shop.ownerWordsStatus === 'APPROVED' ? localized(tr, shop.ownerWords) : null,
    dailyProfile:
      shop.dailyProfileStatus === 'APPROVED' && shop.dailyProfile
        ? Object.fromEntries(DAILY_PROFILE_FIELDS.filter((f) => shop.dailyProfile[f]).map((f) => [f, localized(tr, shop.dailyProfile[f])]))
        : null,
    referrals: (shop.referralsFrom || []).map((r) => ({
      id: r.id,
      message: localized(tr, r.message),
      from: { slug: shop.slug, name: shop.name, nameRomaji: shop.nameRomaji },
      to: {
        slug: r.toShop.slug,
        name: r.toShop.name,
        nameRomaji: r.toShop.nameRomaji,
        category: r.toShop.category,
        reservationMethod: r.toShop.reservationMethod,
      },
    })),
  });
  if (bookable) {
    Object.assign(v, {
      appealPoints: (shop.appealPoints || []).map((p) => localized(tr, p)),
      specialOffer: localized(tr, shop.specialOffer),
      dishes: (shop.dishes || []).map((d) => ({
        id: d.id,
        name: localized(tr, d.name),
        price: d.price,
        allergens: d.allergens,
        dietary: d.dietary,
        adjustable: d.adjustable,
      })),
      timeSlots: shop.timeSlots,
      cancelPolicyCode: shop.cancelPolicyCode,
    });
  }
  return v;
}

// 公開できる紹介：紹介先の掲載同意・運営確認・公開設定・紹介先の公開がそろったもの（8-3）
export const visibleReferralWhere = {
  targetConsent: 'APPROVED',
  reviewStatus: 'APPROVED',
  isPublic: true,
  toShop: { published: true },
};
