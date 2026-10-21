import { prisma } from '../db.js';
import { bad, codes, conflict, forbidden, HttpError, int, isDate, isTime, notFound, str } from '../http.js';
import { requireUser } from '../auth.js';
import { translateMany, translateOne, localized } from '../translate.js';
import { appUrl, sendMail } from '../mail.js';
import { latestPolicies } from '../shopView.js';
import {
  ALLERGENS,
  DIETARY,
  RELIGIOUS,
  RESERVATION_ACTIVE,
  cancellationFeeRate,
  defaultApprovalDeadline,
  googleMapsUrl,
  isOpenAt,
  jstDate,
  todayJst,
} from '../../shared/constants.js';

// 承認期限を過ぎた承認待ちは「期限切れ」にする（20-3）
export async function expirePending(where = {}) {
  await prisma.reservation.updateMany({
    where: { ...where, status: 'PENDING', respondBy: { lt: new Date() } },
    data: { status: 'EXPIRED', decidedAt: new Date() },
  });
}

function messageView(m) {
  // 旅行者には、店舗からのメッセージを翻訳文＋原文で表示する
  const text =
    m.sender === 'SHOP'
      ? { text: m.translated || m.original, original: m.original, translated: Boolean(m.translated), missing: !m.translated }
      : { text: m.original, original: m.original, translated: false };
  return { id: m.id, sender: m.sender, createdAt: m.createdAt, text };
}

function reservationView(r, tr) {
  return {
    id: r.id,
    status: r.status,
    date: r.date,
    time: r.time,
    partySize: r.partySize,
    dietary: r.dietary,
    allergies: r.allergies,
    message: r.message,
    conditionsAgreed: r.conditionsAgreed,
    conditionNoteAgreed: localized(tr, r.conditionNoteAgreed),
    conditionsAgreedAt: r.conditionsAgreedAt,
    policy: r.policy ? { code: r.policy.code, version: r.policy.version, rules: r.policy.rules, lateMinutes: r.policy.lateMinutes, lateRule: r.policy.lateRule, isProvisional: r.policy.isProvisional } : null,
    policyAgreedAt: r.policyAgreedAt,
    respondBy: r.respondBy,
    approvedAt: r.approvedAt,
    decidedAt: r.decidedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
    shop: r.shop && {
      slug: r.shop.slug,
      name: r.shop.name,
      nameRomaji: r.shop.nameRomaji,
      address: r.shop.address,
      lat: r.shop.lat,
      lng: r.shop.lng,
      priceMin: r.shop.priceMin,
      priceMax: r.shop.priceMax,
      reservationMethod: r.shop.reservationMethod,
      mapsUrl: googleMapsUrl(r.shop),
    },
    messages: r.messages ? r.messages.map(messageView) : undefined,
  };
}

// 事業者向けの日本語予約カードをメールでも送る（電話対応店舗の翻訳付きメール方式：12-1 B）
async function notifyShop(req, shop, subject, lines) {
  if (!shop.owner) return;
  await sendMail({
    to: shop.owner.email,
    subject,
    text: `${lines.join('\n')}\n\n承認・お断り・質問は管理画面から行えます：\n${appUrl(req)}/biz`,
  });
}

export async function notifyTraveler(req, user, subject, text) {
  await sendMail({ to: user.email, subject, text: `${text}\n\n${appUrl(req)}/${user.lang}/reservations` });
}

async function createReservation({ body, user, req }) {
  requireUser(user);
  if (user.role !== 'TRAVELER') throw forbidden('travelers_only');
  // カード登録を後回しにした人は、予約リクエスト時にダミー画面を通る（11-1）
  if (!user.cardDemoCompleted) throw new HttpError(402, 'card_demo_required');

  const slug = str(body.shopSlug, { required: true, name: 'shop', max: 100 });
  const shop = await prisma.shop.findFirst({ where: { slug, published: true }, include: { owner: true } });
  if (!shop) throw notFound('shop_not_found');
  if (shop.reservationMethod === 'NONE') throw bad('not_bookable');

  const date = body.date;
  if (!isDate(date) || date < todayJst()) throw bad('invalid_date');
  const time = body.time;
  if (!isTime(time)) throw bad('invalid_time');
  if (shop.timeSlots.length ? !shop.timeSlots.includes(time) : !isOpenAt(shop, date, time)) throw bad('invalid_time');
  const partySize = int(body.partySize, { min: 1, max: 20, required: true, name: 'party' });
  if (partySize > shop.maxPartySize) throw bad('party_too_large');
  const dietary = codes(body.dietary, [...DIETARY, ...RELIGIOUS], 'dietary');
  const allergies = codes(body.allergies, ALLERGENS, 'allergies');
  const message = str(body.message, { max: 1000, name: 'message' });

  const now = new Date();
  const avail = await prisma.availability.findUnique({ where: { shopId_date: { shopId: shop.id, date } } });
  let respondBy;
  if (avail) {
    if (avail.status === 'FULL') throw conflict('slot_full');
    if (avail.approvalDeadline <= now) throw conflict('deadline_passed');
    respondBy = avail.approvalDeadline;
  } else {
    // アプリ予約の店舗は空き情報が登録された日だけ受け付ける。電話対応店舗は店主の確認を前提に受け付ける
    if (shop.reservationMethod === 'APP') throw conflict('no_availability');
    respondBy = defaultApprovalDeadline(shop, date);
    if (respondBy <= now) throw conflict('deadline_passed');
  }
  if (respondBy > jstDate(date, time)) respondBy = jstDate(date, time);

  // △の条件には同意が必須（4-3）
  let conditionsAgreed = [];
  let conditionNoteAgreed = null;
  let conditionsAgreedAt = null;
  if (avail?.status === 'LIMITED') {
    if (body.agreeConditions !== true) throw bad('conditions_not_agreed');
    conditionsAgreed = avail.conditions;
    conditionNoteAgreed = avail.conditionNote;
    conditionsAgreedAt = now;
    if (avail.conditions.includes('MAX_2') && partySize > 2) throw bad('party_too_large');
    if (avail.conditions.includes('SOLO_ONLY') && partySize !== 1) throw bad('party_too_large');
  }

  // キャンセルポリシー：表示した版に同意したことを記録する（12-3）
  const policy = (await latestPolicies(prisma))[shop.cancelPolicyCode];
  if (!policy) throw new HttpError(500, 'policy_missing');
  if (body.agreePolicy !== true) throw bad('policy_not_agreed');
  if (Number(body.policyVersion) !== policy.version || body.policyCode !== policy.code) throw conflict('policy_changed');

  // 同じ店舗・同じ日の有効な予約（承認待ち・確定）の重複を防ぐ（20-3）
  const dup = await prisma.reservation.findFirst({
    where: {
      userId: user.id,
      shopId: shop.id,
      date,
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', respondBy: { gte: now } }],
    },
  });
  if (dup) throw conflict('duplicate_request');

  const messageJa = !message ? null : user.lang === 'ja' ? message : await translateOne(message, 'ja', { from: 'auto', cache: false, context: 'A message from a traveler to a small Japanese shop owner about a reservation request.' });

  const r = await prisma.reservation.create({
    data: {
      userId: user.id,
      shopId: shop.id,
      date,
      time,
      partySize,
      dietary,
      allergies,
      message,
      messageLang: user.lang,
      messageJa,
      conditionsAgreed,
      conditionNoteAgreed,
      conditionsAgreedAt,
      policyId: policy.id,
      policyVersion: policy.version,
      policyAgreedAt: now,
      respondBy,
    },
    include: { shop: true, policy: true },
  });

  await notifyShop(req, shop, '【新しい予約リクエスト】' + date + ' ' + time, [
    '新しい予約リクエストが届きました（まだ確定していません）。',
    `希望日：${date}`,
    `希望時間：${time}`,
    `人数：${partySize}名`,
    `食事制限：${dietary.length ? dietary.join(', ') : '申告なし'}`,
    `アレルギー：${allergies.length ? allergies.join(', ') : '申告なし'}`,
    `お客様からのメッセージ：${messageJa || message || 'なし'}`,
    `返信期限：${respondBy.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
  ]);

  const tr = await translateMany([r.conditionNoteAgreed], user.lang);
  return { reservation: reservationView(r, tr) };
}

async function loadOwn(id, user) {
  requireUser(user);
  await expirePending({ id });
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: { shop: { include: { owner: true } }, policy: true, messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!r || r.userId !== user.id) throw notFound('reservation_not_found');
  return r;
}

export default [
  ['POST', 'reservations', createReservation],

  [
    'GET',
    'reservations',
    async ({ user }) => {
      requireUser(user);
      await expirePending({ userId: user.id });
      const rows = await prisma.reservation.findMany({
        where: { userId: user.id },
        include: { shop: true, policy: true },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });
      const tr = await translateMany(rows.map((r) => r.conditionNoteAgreed), user.lang);
      return { reservations: rows.map((r) => reservationView(r, tr)) };
    },
  ],

  [
    'GET',
    'reservations/:id',
    async ({ params, user }) => {
      const r = await loadOwn(params.id, user);
      const tr = await translateMany([r.conditionNoteAgreed], user.lang);
      return { reservation: reservationView(r, tr) };
    },
  ],

  [
    'POST',
    'reservations/:id/cancel',
    async ({ params, user, req }) => {
      const r = await loadOwn(params.id, user);
      if (!RESERVATION_ACTIVE.includes(r.status)) throw conflict('not_cancellable');
      const hoursBefore = (jstDate(r.date, r.time).getTime() - Date.now()) / 3600e3;
      // MVP では実際の決済・キャンセル料徴収は行わない（21章）。目安の料率だけ返す
      const feeRate = r.status === 'CONFIRMED' ? cancellationFeeRate(r.policy, hoursBefore) : 0;
      const updated = await prisma.reservation.update({
        where: { id: r.id },
        data: { status: 'CANCELLED_BY_TRAVELER', cancelledAt: new Date() },
        include: { shop: true, policy: true },
      });
      await notifyShop(req, r.shop, '【キャンセル】' + r.date + ' ' + r.time, [`${r.date} ${r.time}（${r.partySize}名）の予約がお客様によりキャンセルされました。`]);
      return { reservation: reservationView(updated, new Map()), feeRate };
    },
  ],

  [
    'POST',
    'reservations/:id/messages',
    async ({ params, user, body, req }) => {
      const r = await loadOwn(params.id, user);
      const text = str(body.message, { required: true, max: 1000, name: 'message' });
      const ja = user.lang === 'ja' ? text : await translateOne(text, 'ja', { from: 'auto', cache: false });
      await prisma.message.create({
        data: { shopId: r.shopId, userId: user.id, reservationId: r.id, sender: 'TRAVELER', original: text, originalLang: user.lang, translated: ja, translatedLang: 'ja' },
      });
      await notifyShop(req, r.shop, '【お客様からのメッセージ】' + r.date, [`予約（${r.date} ${r.time}）についてメッセージが届きました。`, `内容（翻訳）：${ja || text}`]);
      const fresh = await loadOwn(params.id, user);
      return { reservation: reservationView(fresh, new Map()) };
    },
  ],

  // 予約前の問い合わせ（10-3）。アカウント登録が必要
  [
    'GET',
    'shops/:slug/inquiries',
    async ({ params, user }) => {
      requireUser(user);
      const shop = await prisma.shop.findFirst({ where: { slug: params.slug, published: true } });
      if (!shop) throw notFound('shop_not_found');
      const msgs = await prisma.message.findMany({ where: { shopId: shop.id, userId: user.id, reservationId: null }, orderBy: { createdAt: 'asc' } });
      return { messages: msgs.map(messageView) };
    },
  ],
  [
    'POST',
    'shops/:slug/inquiries',
    async ({ params, user, body, req }) => {
      requireUser(user);
      if (user.role !== 'TRAVELER') throw forbidden('travelers_only');
      const shop = await prisma.shop.findFirst({ where: { slug: params.slug, published: true }, include: { owner: true } });
      if (!shop) throw notFound('shop_not_found');
      const text = str(body.message, { required: true, max: 1000, name: 'message' });
      const ja = user.lang === 'ja' ? text : await translateOne(text, 'ja', { from: 'auto', cache: false, context: 'A question from a traveler to a small Japanese shop owner.' });
      await prisma.message.create({
        data: { shopId: shop.id, userId: user.id, sender: 'TRAVELER', original: text, originalLang: user.lang, translated: ja, translatedLang: 'ja' },
      });
      await notifyShop(req, shop, '【お問い合わせ】旅行者からの質問', [`旅行者から質問が届きました。`, `内容（翻訳）：${ja || text}`]);
      const msgs = await prisma.message.findMany({ where: { shopId: shop.id, userId: user.id, reservationId: null }, orderBy: { createdAt: 'asc' } });
      return { messages: msgs.map(messageView) };
    },
  ],
];
