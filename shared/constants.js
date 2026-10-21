// サーバー（api/）とブラウザ（src/）の両方で使う定数とルール

// 旅行者向けの表示言語。日本語は原文をそのまま表示する
export const LANGS = ['en', 'zh', 'ko', 'fr', 'es', 'ja'];
// 自動翻訳・用語集の対象言語（日本語の原文から訳す先）
export const TRANSLATION_LANGS = ['en', 'zh', 'ko', 'fr', 'es'];
export const LANG_LABELS = {
  en: 'English',
  zh: '简体中文',
  ko: '한국어',
  fr: 'Français',
  es: 'Español',
  ja: '日本語',
};

export const CURRENCIES = ['JPY', 'SGD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY', 'HKD', 'TWD', 'KRW', 'THB', 'MYR'];

export const CATEGORIES = ['tea_farm', 'cafe', 'shokudo', 'izakaya', 'wagashi', 'shop', 'workshop', 'restaurant'];

// 日常シーン（6-1）
export const SCENES = ['tea_time', 'after_work', 'old_breakfast', 'shotengai_afternoon', 'local_diner', 'today'];

// △の受け入れ条件（4-3, 6-2, 14-2）
export const CONDITIONS = ['MAX_2', 'SOLO_ONLY', 'SMOKING_ONLY', 'EVENING_ONLY', 'COUNTER_ONLY', 'OTHER'];
// ✕の理由（任意）
export const FULL_REASONS = ['BUSY_SEASON'];

// 特定原材料8品目 + 主な準ずるもの
export const ALLERGENS = ['shrimp', 'crab', 'walnut', 'wheat', 'buckwheat', 'egg', 'milk', 'peanut', 'soy', 'sesame', 'fish', 'shellfish'];

// 食事制限（自己申告で絞り込みに使う）
export const DIETARY = ['vegetarian', 'vegan', 'gluten_free'];
// 宗教上の制限（同意を得てから質問する：5-4）
export const RELIGIOUS = ['halal', 'no_pork', 'no_alcohol', 'no_beef', 'kosher'];

export const BUDGETS = [
  { code: 'b1', max: 2000 },
  { code: 'b2', min: 2000, max: 5000 },
  { code: 'b3', min: 5000, max: 10000 },
  { code: 'b4', min: 10000, max: 15000 },
  { code: 'b5', min: 15000 },
];

export const CLIENTELE = ['LOCAL_MOSTLY', 'MIXED', 'TRAVELERS_MOSTLY'];
export const REGULARS = ['MANY', 'SOME', 'FEW'];
export const OWNER_DISTANCE = ['OWNER_SERVES', 'MAKER_PRESENT', 'STAFF_SERVES'];
export const SHOP_LANGS = ['ja', 'en', 'zh', 'ko', 'fr', 'es'];

// 日常プロフィールの項目（7-2）
export const DAILY_PROFILE_FIELDS = ['origin', 'clientele', 'regulars', 'values', 'usualItems', 'forTravelers'];

export const RESERVATION_ACTIVE = ['PENDING', 'CONFIRMED'];

// 日本時間の YYYY-MM-DD
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function jstDate(dateStr, time = '00:00') {
  return new Date(`${dateStr}T${time}:00+09:00`);
}

export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// 承認期限の初期値：その日の最初の予約枠（なければ開店時刻）から requestDeadlineHours 前
export function defaultApprovalDeadline(shop, dateStr) {
  const first = [...(shop.timeSlots || [])].sort()[0] || shop.openTime || '10:00';
  return new Date(jstDate(dateStr, first).getTime() - (shop.requestDeadlineHours ?? 24) * 3600e3);
}

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function isOpenAt(shop, dateStr, hhmm) {
  if (dateStr && (shop.closedDays || []).includes(weekdayOf(dateStr))) return false;
  const t = toMinutes(hhmm);
  return toMinutes(shop.openTime) <= t && t < toMinutes(shop.closeTime);
}

// 日常シーンに当てはまるか。事業者が設定したシーンを正とし、
// 「今日行けそうなお店」だけは今日の空き状況から判定する（存在しない情報で断定しない：6-1）
export function matchesScene(shop, scene, todayAvailability) {
  if (scene === 'today') {
    return shop.reservationMethod !== 'NONE' && todayAvailability && todayAvailability.status !== 'FULL' && !todayAvailability.deadlinePassed;
  }
  return (shop.dailyScenes || []).includes(scene);
}

// キャンセル料の目安（12-3）
export function cancellationFeeRate(policy, hoursBefore) {
  const rules = [...(policy.rules || [])].sort((a, b) => a.hoursBefore - b.hoursBefore);
  for (const r of rules) if (hoursBefore <= r.hoursBefore) return r.ratePercent;
  return 0;
}

export function googleMapsUrl(shop) {
  const q = encodeURIComponent(`${shop.name} ${shop.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const AREAS = [
  { code: 'uji', name: { ja: '宇治', en: 'Uji' }, lat: 34.8892, lng: 135.8077 },
  { code: 'kyoto', name: { ja: '京都駅周辺', en: 'Kyoto Station' }, lat: 34.9858, lng: 135.7588 },
];
