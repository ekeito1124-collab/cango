// 事業者・運営向け画面の日本語ラベル
export const JA = {
  cat: { tea_farm: '茶農家', cafe: '喫茶店', shokudo: '食堂', izakaya: '居酒屋', wagashi: '和菓子店', shop: '個人商店', workshop: '工房', restaurant: '飲食店' },
  scene: {
    tea_time: 'いつものお茶時間',
    after_work: '仕事帰りに立ち寄るお店',
    old_breakfast: '昔ながらの朝ごはん',
    shotengai_afternoon: '商店街の午後',
    local_diner: '地元の人が通う食堂',
    today: '今日行けそうなお店',
  },
  avail: { OK: '〇 受け入れ可能', LIMITED: '△ 条件付きで可能', FULL: '✕ 受け入れ不可' },
  sym: { OK: '〇', LIMITED: '△', FULL: '✕' },
  cond: { MAX_2: '2名まで', SOLO_ONLY: '一人客のみ', SMOKING_ONLY: '喫煙席のみ', EVENING_ONLY: '夕方のみ', COUNTER_ONLY: 'カウンター席のみ', OTHER: 'その他の条件', BUSY_SEASON: '繁忙期のため' },
  allergen: {
    shrimp: 'えび',
    crab: 'かに',
    walnut: 'くるみ',
    wheat: '小麦',
    buckwheat: 'そば',
    egg: '卵',
    milk: '乳',
    peanut: '落花生',
    soy: '大豆',
    sesame: 'ごま',
    fish: '魚',
    shellfish: '貝類',
  },
  diet: { vegetarian: 'ベジタリアン', vegan: 'ヴィーガン', gluten_free: 'グルテンフリー', halal: 'ハラル', no_pork: '豚肉不使用', no_alcohol: 'アルコール不使用', no_beef: '牛肉不使用', kosher: 'コーシャ' },
  adjust: { less: '少なめにできる', remove: '材料を抜ける' },
  clientele: { LOCAL_MOSTLY: '地元のお客さんが中心', MIXED: '地元客と旅行者が半々', TRAVELERS_MOSTLY: '旅行者が中心' },
  regulars: { MANY: '常連さんが多い', SOME: '常連さんもいる', FEW: '常連さんは少ない' },
  ownerDistance: { OWNER_SERVES: '店主が接客する', MAKER_PRESENT: '作り手と話せる', STAFF_SERVES: 'スタッフが接客する' },
  shopLang: { ja: '日本語', en: '英語', zh: '中国語', ko: '韓国語', fr: 'フランス語', es: 'スペイン語' },
  guestLang: { ja: '日本語', en: '英語', zh: '中国語（簡体字）', ko: '韓国語', fr: 'フランス語', es: 'スペイン語' },
  method: { APP: 'アプリで予約を受ける', EMAIL: '電話対応の店舗（翻訳付きメッセージで受ける）', NONE: '予約は受けない（地図に掲載のみ）' },
  status: {
    PENDING: '承認待ち',
    CONFIRMED: '確定',
    DECLINED: 'お断り済み',
    EXPIRED: '期限切れ',
    CANCELLED_BY_TRAVELER: 'お客様がキャンセル',
    CANCELLED_BY_SHOP: '店舗がキャンセル',
  },
  review: { PENDING: '運営確認待ち', APPROVED: '掲載中', REJECTED: '掲載見送り' },
  consent: { PENDING: '同意待ち', APPROVED: '同意済み', DECLINED: '辞退' },
  policy: { STANDARD: '標準', STRICT: '厳しめ' },
  profile: {
    origin: 'お店を始めた経緯',
    clientele: '普段の客層',
    regulars: '常連客との関係',
    values: '店主が大切にしていること',
    usualItems: 'いつも提供している商品・料理',
    forTravelers: '外国人旅行者に知ってほしいこと',
  },
  wd: ['日', '月', '火', '水', '木', '金', '土'],
};

export const jaList = (map, codes) => (codes && codes.length ? codes.map((c) => map[c] || c).join('、') : '申告なし');

export function jaDateTime(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function jaDate(d) {
  const dt = new Date(`${d}T00:00:00Z`);
  return `${dt.getUTCMonth() + 1}月${dt.getUTCDate()}日（${JA.wd[dt.getUTCDay()]}）`;
}
