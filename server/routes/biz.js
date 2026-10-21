import { prisma } from '../db.js';
import { bad, codes, conflict, forbidden, int, isDate, isTime, notFound, str } from '../http.js';
import { hashPassword, publicUser, requireUser, setSession, validateEmail, validatePassword } from '../auth.js';
import { pretranslate, translateOne } from '../translate.js';
import { DAILY_PROFILE_FIELDS } from '../shopView.js';
import { expirePending, notifyTraveler } from './reservations.js';
import {
  ALLERGENS,
  CATEGORIES,
  CLIENTELE,
  CONDITIONS,
  DIETARY,
  FULL_REASONS,
  OWNER_DISTANCE,
  REGULARS,
  RELIGIOUS,
  SCENES,
  SHOP_LANGS,
  addDays,
  defaultApprovalDeadline,
  todayJst,
} from '../../shared/constants.js';

const STATUS_JA = { CONFIRMED: '確定', DECLINED: 'お断り', CANCELLED_BY_SHOP: '店舗都合によるキャンセル' };
const TRAVELER_MSG = {
  CONFIRMED: {
    en: 'Your reservation has been confirmed by the shop.',
    zh: '店家已确认您的预约。',
    ko: '가게에서 예약을 확정했습니다.',
    fr: 'Votre réservation a été confirmée par la boutique.',
    es: 'El establecimiento ha confirmado tu reserva.',
    ja: 'お店が予約を承認しました。予約が確定しました。',
  },
  DECLINED: {
    en: 'Unfortunately, the shop could not accept your request. Your reservation is not confirmed.',
    zh: '很遗憾，店家无法接受您的请求。预约未成立。',
    ko: '죄송하지만 가게에서 요청을 수락하지 못했습니다. 예약은 확정되지 않았습니다.',
    fr: "Malheureusement, la boutique n'a pas pu accepter votre demande. La réservation n'est pas confirmée.",
    es: 'Lamentablemente, el establecimiento no pudo aceptar tu solicitud. La reserva no está confirmada.',
    ja: '申し訳ありませんが、お店がリクエストを受けられませんでした。予約は確定していません。',
  },
  CANCELLED_BY_SHOP: {
    en: 'The shop has cancelled your reservation.',
    zh: '店家已取消您的预约。',
    ko: '가게에서 예약을 취소했습니다.',
    fr: 'La boutique a annulé votre réservation.',
    es: 'El establecimiento ha cancelado tu reserva.',
    ja: 'お店が予約をキャンセルしました。',
  },
  MESSAGE: {
    en: 'You have a new message from the shop.',
    zh: '您收到了店家的新消息。',
    ko: '가게에서 새 메시지가 도착했습니다.',
    fr: 'Vous avez un nouveau message de la boutique.',
    es: 'Tienes un nuevo mensaje del establecimiento.',
    ja: 'お店から新しいメッセージが届きました。',
  },
};

function requireOwner(user) {
  requireUser(user, ['OWNER']);
  if (!user.shop) throw forbidden('no_shop');
  return user.shop.id;
}

// 旅行者の個人情報は予約対応に必要な範囲だけを事業者へ渡す（20-2）
function cardView(r) {
  return {
    id: r.id,
    status: r.status,
    date: r.date,
    time: r.time,
    partySize: r.partySize,
    dietary: r.dietary,
    allergies: r.allergies,
    conditionsAgreed: r.conditionsAgreed,
    conditionNoteAgreed: r.conditionNoteAgreed,
    message: r.message,
    messageLang: r.messageLang,
    messageJa: r.messageJa,
    respondBy: r.respondBy,
    approvedAt: r.approvedAt,
    createdAt: r.createdAt,
    policy: { code: r.policy.code, version: r.policy.version },
    guestLabel: 'お客様 #' + r.userId.slice(-4).toUpperCase(),
    guestLang: r.user.lang,
    messages: (r.messages || []).map(ownerMessageView),
  };
}

function ownerMessageView(m) {
  return {
    id: m.id,
    sender: m.sender,
    createdAt: m.createdAt,
    // 事業者には日本語を表示し、旅行者の原文も確認できるようにする（13-2）
    text: m.sender === 'TRAVELER' ? m.translated || m.original : m.original,
    original: m.sender === 'TRAVELER' ? m.original : null,
    translationMissing: m.sender === 'TRAVELER' && !m.translated,
  };
}

async function loadShopReservation(id, shopId) {
  await expirePending({ id });
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: { user: true, policy: true, messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!r || r.shopId !== shopId) throw notFound('reservation_not_found');
  return r;
}

async function decide(ctx, nextStatus, allowedFrom) {
  const shopId = requireOwner(ctx.user);
  const r = await loadShopReservation(ctx.params.id, shopId);
  if (!allowedFrom.includes(r.status)) throw conflict('invalid_status', r.status);
  const now = new Date();
  // 承認待ちからの変更は、別のリクエストと競合しないよう状態を条件に更新する
  const updated = await prisma.reservation.updateMany({
    where: { id: r.id, status: r.status },
    data: {
      status: nextStatus,
      decidedAt: now,
      ...(nextStatus === 'CONFIRMED' ? { approvedAt: now } : {}),
      ...(nextStatus === 'CANCELLED_BY_SHOP' ? { cancelledAt: now } : {}),
    },
  });
  if (!updated.count) throw conflict('invalid_status');
  const note = str(ctx.body.message, { max: 1000, name: 'message' });
  if (note) await addShopMessage(r, note);
  const lang = r.user.lang;
  await notifyTraveler(ctx.req, r.user, `[${r.date} ${r.time}] ${STATUS_JA[nextStatus]}`, TRAVELER_MSG[nextStatus][lang] || TRAVELER_MSG[nextStatus].en);
  return { reservation: cardView(await loadShopReservation(r.id, shopId)) };
}

async function addShopMessage(r, text) {
  const translated = await translateOne(text, r.user.lang, { from: 'ja', cache: false, context: 'A reply from a small Japanese shop owner to a foreign traveler.' });
  await prisma.message.create({
    data: {
      shopId: r.shopId,
      userId: r.userId,
      reservationId: r.id,
      sender: 'SHOP',
      original: text,
      originalLang: 'ja',
      translated,
      translatedLang: r.user.lang,
    },
  });
}

const bool = (v) => (v === true || v === false ? v : null);

function slugify(s) {
  const base = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'shop'}-${Math.random().toString(36).slice(2, 7)}`;
}

// 店舗情報の更新内容を検証して Prisma の data に変換する
function shopData(b, { partial = true } = {}) {
  const d = {};
  const set = (k, v) => {
    if (v !== undefined) d[k] = v;
  };
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) set('name', str(b.name, { required: true, max: 100, name: 'name' }));
  if (has('nameRomaji')) set('nameRomaji', str(b.nameRomaji, { max: 100, name: 'nameRomaji' }));
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(b.category)) throw bad('invalid_category');
    set('category', b.category);
  }
  if (has('area')) set('area', str(b.area, { max: 50, name: 'area' }) || '');
  if (!partial || has('address')) set('address', str(b.address, { required: true, max: 200, name: 'address' }));
  if (!partial || has('lat')) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw bad('invalid_location');
    set('lat', lat);
    set('lng', lng);
  }
  if (!partial || has('description')) set('description', str(b.description, { required: true, max: 1000, name: 'description' }));
  if (has('photos')) {
    const photos = (Array.isArray(b.photos) ? b.photos : []).map((p) => String(p).trim()).filter((p) => /^https:\/\//.test(p) || p.startsWith('/'));
    set('photos', photos.slice(0, 8));
  }
  if (!partial || has('hoursText')) set('hoursText', str(b.hoursText, { required: true, max: 200, name: 'hoursText' }));
  for (const k of ['openTime', 'closeTime']) {
    if (has(k)) {
      if (!isTime(b[k])) throw bad('invalid_' + k);
      set(k, b[k]);
    }
  }
  if (has('closedDays')) set('closedDays', [...new Set((b.closedDays || []).map(Number))].filter((n) => n >= 0 && n <= 6));
  if (!partial || has('priceMin')) set('priceMin', int(b.priceMin, { min: 0, max: 1000000, required: true, name: 'priceMin' }));
  if (!partial || has('priceMax')) set('priceMax', int(b.priceMax, { min: 0, max: 1000000, required: true, name: 'priceMax' }));
  if (has('priceNote')) set('priceNote', str(b.priceNote, { max: 200, name: 'priceNote' }));
  if (!partial || has('reservationMethod')) {
    if (!['APP', 'EMAIL', 'NONE'].includes(b.reservationMethod)) throw bad('invalid_method');
    set('reservationMethod', b.reservationMethod);
  }
  if (has('languages')) set('languages', codes(b.languages, SHOP_LANGS, 'languages'));
  if (has('dietaryOptions')) set('dietaryOptions', codes(b.dietaryOptions, [...DIETARY, ...RELIGIOUS], 'dietary'));
  if (has('appealPoints')) set('appealPoints', (b.appealPoints || []).map((x) => str(x, { max: 100, name: 'appeal' })).filter(Boolean).slice(0, 10));
  if (has('allergenFreeShopwide')) set('allergenFreeShopwide', codes(b.allergenFreeShopwide, ALLERGENS, 'allergens'));
  if (has('ingredientAdjust')) set('ingredientAdjust', codes(b.ingredientAdjust, ['less', 'remove'], 'adjust'));
  if (has('clientele')) set('clientele', b.clientele && CLIENTELE.includes(b.clientele) ? b.clientele : null);
  if (has('regulars')) set('regulars', b.regulars && REGULARS.includes(b.regulars) ? b.regulars : null);
  if (has('guidebookListed')) set('guidebookListed', bool(b.guidebookListed));
  if (has('tourListed')) set('tourListed', bool(b.tourListed));
  if (has('foundedYear')) set('foundedYear', int(b.foundedYear, { min: 1000, max: 2100, name: 'foundedYear' }));
  if (has('ownerDistance')) set('ownerDistance', b.ownerDistance && OWNER_DISTANCE.includes(b.ownerDistance) ? b.ownerDistance : null);
  if (has('soloWelcome')) set('soloWelcome', Boolean(b.soloWelcome));
  if (has('maxPartySize')) set('maxPartySize', int(b.maxPartySize, { min: 1, max: 20, required: true, name: 'maxPartySize' }));
  if (has('timeSlots')) {
    const slots = [...new Set(b.timeSlots || [])];
    if (slots.some((t) => !isTime(t))) throw bad('invalid_timeSlots');
    set('timeSlots', slots.sort());
  }
  if (has('requestDeadlineHours')) set('requestDeadlineHours', int(b.requestDeadlineHours, { min: 0, max: 24 * 14, required: true, name: 'deadline' }));
  if (has('cancelPolicyCode')) {
    if (!['STANDARD', 'STRICT'].includes(b.cancelPolicyCode)) throw bad('invalid_policy');
    set('cancelPolicyCode', b.cancelPolicyCode);
  }
  if (has('dailyScenes')) set('dailyScenes', codes(b.dailyScenes, SCENES.filter((s) => s !== 'today'), 'scenes'));
  if (has('normalBusiness')) set('normalBusiness', Boolean(b.normalBusiness));
  if (has('specialOffer')) set('specialOffer', str(b.specialOffer, { max: 300, name: 'specialOffer' }));
  if (has('ownerWords')) set('ownerWords', str(b.ownerWords, { max: 300, name: 'ownerWords' }));
  if (has('dailyProfile')) {
    const p = {};
    for (const f of DAILY_PROFILE_FIELDS) {
      const v = str(b.dailyProfile?.[f], { max: 400, name: f });
      if (v) p[f] = v;
    }
    set('dailyProfile', p);
  }
  return d;
}

function shopTextsForTranslation(d, dishes = []) {
  const t = [d.description, d.hoursText, d.priceNote, d.specialOffer, d.ownerWords, ...(d.appealPoints || []), ...dishes.map((x) => x.name)];
  if (d.dailyProfile) t.push(...Object.values(d.dailyProfile));
  return t.filter(Boolean);
}

export default [
  // 事業者登録。掲載は運営の確認後に公開する（22-7 の確認手続きは未確定のため、運営承認を必須とする）
  [
    'POST',
    'biz/signup',
    async ({ body, res }) => {
      const email = validateEmail(body.email);
      validatePassword(body.password);
      if (await prisma.user.findUnique({ where: { email } })) throw conflict('email_taken');
      const data = shopData(body.shop || {}, { partial: false });
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(body.password),
          role: 'OWNER',
          lang: 'en',
          shop: { create: { ...data, slug: slugify(data.nameRomaji || body.shop?.nameRomaji), area: data.area || '', published: false } },
        },
        include: { shop: { select: { id: true, slug: true, name: true } } },
      });
      await setSession(res, user);
      await pretranslate(shopTextsForTranslation(data));
      return { user: publicUser(user) };
    },
  ],

  [
    'GET',
    'biz/overview',
    async ({ user }) => {
      const shopId = requireOwner(user);
      await expirePending({ shopId });
      const shop = await prisma.shop.findUnique({ where: { id: shopId }, include: { dishes: { orderBy: { sortOrder: 'asc' } } } });
      const pending = await prisma.reservation.count({ where: { shopId, status: 'PENDING' } });
      const today = todayJst();
      const upcoming = await prisma.reservation.count({ where: { shopId, status: 'CONFIRMED', date: { gte: today } } });
      const lastAvail = await prisma.availability.findFirst({ where: { shopId }, orderBy: { updatedAt: 'desc' } });
      const unanswered = await prisma.message.count({ where: { shopId, reservationId: null, sender: 'TRAVELER' } });
      return { shop, counts: { pending, upcoming, unanswered }, availabilityUpdatedAt: lastAvail?.updatedAt || null };
    },
  ],

  [
    'PUT',
    'biz/shop',
    async ({ user, body }) => {
      const shopId = requireOwner(user);
      const before = await prisma.shop.findUnique({ where: { id: shopId } });
      const data = shopData(body, { partial: true });
      // 店主のことば・日常プロフィールは変更時に運営の確認待ちに戻す（7-2）
      if ('ownerWords' in data && data.ownerWords !== before.ownerWords) data.ownerWordsStatus = 'PENDING';
      if ('dailyProfile' in data && JSON.stringify(data.dailyProfile) !== JSON.stringify(before.dailyProfile)) data.dailyProfileStatus = 'PENDING';
      const shop = await prisma.shop.update({ where: { id: shopId }, data, include: { dishes: { orderBy: { sortOrder: 'asc' } } } });
      await pretranslate(shopTextsForTranslation(data));
      return { shop };
    },
  ],

  // 料理とアレルギー物質（9-2）。一覧をまとめて置き換える
  [
    'PUT',
    'biz/dishes',
    async ({ user, body }) => {
      const shopId = requireOwner(user);
      const list = Array.isArray(body.dishes) ? body.dishes.slice(0, 50) : [];
      const dishes = list.map((d, i) => ({
        shopId,
        name: str(d.name, { required: true, max: 100, name: 'dish' }),
        price: int(d.price, { min: 0, max: 1000000, name: 'price' }),
        allergens: codes(d.allergens, ALLERGENS, 'allergens'),
        dietary: codes(d.dietary, [...DIETARY, ...RELIGIOUS], 'dietary'),
        adjustable: codes(d.adjustable, ['less', 'remove'], 'adjust'),
        sortOrder: i,
      }));
      await prisma.$transaction([prisma.dish.deleteMany({ where: { shopId } }), prisma.dish.createMany({ data: dishes })]);
      await pretranslate(dishes.map((d) => d.name));
      return { dishes: await prisma.dish.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } }) };
    },
  ],

  // 〇△✕の設定（14-2）
  [
    'GET',
    'biz/availability',
    async ({ user, query }) => {
      const shopId = requireOwner(user);
      const from = isDate(query.from) ? query.from : todayJst();
      const to = isDate(query.to) ? query.to : addDays(from, 41);
      const rows = await prisma.availability.findMany({ where: { shopId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
      return { availability: rows };
    },
  ],
  [
    'PUT',
    'biz/availability',
    async ({ user, body }) => {
      const shopId = requireOwner(user);
      const shop = await prisma.shop.findUnique({ where: { id: shopId } });
      const dates = Array.isArray(body.dates) ? body.dates : [];
      if (!dates.length || dates.length > 62 || dates.some((d) => !isDate(d) || d < todayJst())) throw bad('invalid_dates');
      if (!['OK', 'LIMITED', 'FULL'].includes(body.status)) throw bad('invalid_status');
      const conditions = body.status === 'LIMITED' ? codes(body.conditions, CONDITIONS, 'conditions') : body.status === 'FULL' ? codes(body.conditions, FULL_REASONS, 'conditions') : [];
      const conditionNote = body.status === 'LIMITED' ? str(body.conditionNote, { max: 200, name: 'conditionNote' }) : null;
      if (body.status === 'LIMITED' && !conditions.length && !conditionNote) throw bad('conditions_required');
      if (conditions.includes('OTHER') && !conditionNote) throw bad('condition_note_required');
      let customDeadline = null;
      if (body.approvalDeadline) {
        customDeadline = new Date(body.approvalDeadline);
        if (Number.isNaN(customDeadline.getTime())) throw bad('invalid_deadline');
      }
      await prisma.$transaction(
        dates.map((date) => {
          const data = { status: body.status, conditions, conditionNote, approvalDeadline: customDeadline || defaultApprovalDeadline(shop, date) };
          return prisma.availability.upsert({ where: { shopId_date: { shopId, date } }, update: data, create: { ...data, shopId, date } });
        }),
      );
      if (conditionNote) await pretranslate([conditionNote]);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    'biz/availability/:date',
    async ({ user, params }) => {
      const shopId = requireOwner(user);
      await prisma.availability.deleteMany({ where: { shopId, date: params.date } });
      return { ok: true };
    },
  ],

  // 予約リクエスト（日本語の構造化カード：13章）
  [
    'GET',
    'biz/reservations',
    async ({ user, query }) => {
      const shopId = requireOwner(user);
      await expirePending({ shopId });
      const scope = query.scope || 'pending';
      const today = todayJst();
      const where =
        scope === 'pending'
          ? { shopId, status: 'PENDING' }
          : scope === 'upcoming'
            ? { shopId, status: 'CONFIRMED', date: { gte: today } }
            : { shopId };
      const rows = await prisma.reservation.findMany({
        where,
        include: { user: true, policy: true, messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: scope === 'all' ? { createdAt: 'desc' } : [{ date: 'asc' }, { time: 'asc' }],
        take: 200,
      });
      return { reservations: rows.map(cardView) };
    },
  ],
  ['POST', 'biz/reservations/:id/approve', (ctx) => decide(ctx, 'CONFIRMED', ['PENDING'])],
  ['POST', 'biz/reservations/:id/decline', (ctx) => decide(ctx, 'DECLINED', ['PENDING'])],
  ['POST', 'biz/reservations/:id/cancel', (ctx) => decide(ctx, 'CANCELLED_BY_SHOP', ['CONFIRMED'])],
  // 「質問・確認する」は予約確定を意味しない（13-4）
  [
    'POST',
    'biz/reservations/:id/messages',
    async ({ user, params, body, req }) => {
      const shopId = requireOwner(user);
      const r = await loadShopReservation(params.id, shopId);
      const text = str(body.message, { required: true, max: 1000, name: 'message' });
      await addShopMessage(r, text);
      await notifyTraveler(req, r.user, `[${r.date} ${r.time}] Message`, TRAVELER_MSG.MESSAGE[r.user.lang] || TRAVELER_MSG.MESSAGE.en);
      return { reservation: cardView(await loadShopReservation(r.id, shopId)) };
    },
  ],

  // 予約前の問い合わせ
  [
    'GET',
    'biz/inquiries',
    async ({ user }) => {
      const shopId = requireOwner(user);
      const msgs = await prisma.message.findMany({ where: { shopId, reservationId: null }, orderBy: { createdAt: 'asc' }, include: { user: true } });
      const threads = new Map();
      for (const m of msgs) {
        if (!threads.has(m.userId)) threads.set(m.userId, { userId: m.userId, guestLabel: 'お客様 #' + m.userId.slice(-4).toUpperCase(), guestLang: m.user.lang, messages: [] });
        threads.get(m.userId).messages.push(ownerMessageView(m));
      }
      return { threads: [...threads.values()].reverse() };
    },
  ],
  [
    'POST',
    'biz/inquiries/:userId',
    async ({ user, params, body, req }) => {
      const shopId = requireOwner(user);
      const exists = await prisma.message.findFirst({ where: { shopId, userId: params.userId, reservationId: null }, include: { user: true } });
      if (!exists) throw notFound('thread_not_found');
      const text = str(body.message, { required: true, max: 1000, name: 'message' });
      const traveler = exists.user;
      const translated = await translateOne(text, traveler.lang, { from: 'ja', cache: false, context: 'A reply from a small Japanese shop owner to a foreign traveler.' });
      await prisma.message.create({
        data: { shopId, userId: traveler.id, sender: 'SHOP', original: text, originalLang: 'ja', translated, translatedLang: traveler.lang },
      });
      await notifyTraveler(req, traveler, 'Message from the shop', TRAVELER_MSG.MESSAGE[traveler.lang] || TRAVELER_MSG.MESSAGE.en);
      return { ok: true };
    },
  ],

  // 町の紹介網（8-3）
  [
    'GET',
    'biz/referrals',
    async ({ user }) => {
      const shopId = requireOwner(user);
      const [outgoing, incoming, candidates] = await Promise.all([
        prisma.referral.findMany({ where: { fromShopId: shopId }, include: { toShop: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'asc' } }),
        prisma.referral.findMany({ where: { toShopId: shopId }, include: { fromShop: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'asc' } }),
        prisma.shop.findMany({ where: { published: true, id: { not: shopId } }, select: { id: true, name: true, area: true, category: true }, orderBy: { name: 'asc' } }),
      ]);
      return { outgoing, incoming, candidates };
    },
  ],
  [
    'POST',
    'biz/referrals',
    async ({ user, body }) => {
      const shopId = requireOwner(user);
      const toShopId = str(body.toShopId, { required: true, max: 50, name: 'toShop' });
      if (toShopId === shopId) throw bad('self_referral');
      const target = await prisma.shop.findFirst({ where: { id: toShopId, published: true } });
      if (!target) throw notFound('shop_not_found');
      const message = str(body.message, { required: true, max: 200, name: 'message' });
      const existing = await prisma.referral.findUnique({ where: { fromShopId_toShopId: { fromShopId: shopId, toShopId } } });
      if (existing) throw conflict('already_referred');
      const r = await prisma.referral.create({ data: { fromShopId: shopId, toShopId, message } });
      await pretranslate([message]);
      return { referral: r };
    },
  ],
  [
    'PATCH',
    'biz/referrals/:id',
    async ({ user, params, body }) => {
      const shopId = requireOwner(user);
      const r = await prisma.referral.findUnique({ where: { id: params.id } });
      if (!r || (r.fromShopId !== shopId && r.toShopId !== shopId)) throw notFound();
      const data = {};
      if (r.fromShopId === shopId && body.message !== undefined) {
        data.message = str(body.message, { required: true, max: 200, name: 'message' });
        if (data.message !== r.message) data.reviewStatus = 'PENDING';
      }
      if (r.fromShopId === shopId && typeof body.isPublic === 'boolean') data.isPublic = body.isPublic;
      // 紹介先の店舗による掲載同意
      if (r.toShopId === shopId && ['APPROVED', 'DECLINED'].includes(body.targetConsent)) data.targetConsent = body.targetConsent;
      const updated = await prisma.referral.update({ where: { id: r.id }, data });
      if (data.message) await pretranslate([data.message]);
      return { referral: updated };
    },
  ],
  [
    'DELETE',
    'biz/referrals/:id',
    async ({ user, params }) => {
      const shopId = requireOwner(user);
      const r = await prisma.referral.findUnique({ where: { id: params.id } });
      if (!r || (r.fromShopId !== shopId && r.toShopId !== shopId)) throw notFound();
      await prisma.referral.delete({ where: { id: r.id } });
      return { ok: true };
    },
  ],
];
