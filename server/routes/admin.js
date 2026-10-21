import { prisma } from '../db.js';
import { bad, notFound, str } from '../http.js';
import { requireUser } from '../auth.js';
import { hashText, invalidateGlossary, translateMany, translateOne } from '../translate.js';
import { llmStatus } from '../llm.js';
import { shopTexts } from '../shopView.js';
import { TRANSLATION_LANGS, todayJst } from '../../shared/constants.js';

const admin = (user) => requireUser(user, ['ADMIN']);

// 掲載中の店舗の、翻訳が必要な日本語テキストをすべて集める
async function publishedTexts() {
  const shops = await prisma.shop.findMany({
    where: { published: true },
    include: { dishes: true, referralsFrom: true, availability: { where: { date: { gte: todayJst() } } } },
  });
  const texts = new Set();
  for (const s of shops) {
    for (const t of shopTexts(s, { detail: true })) texts.add(t);
    for (const a of s.availability) if (a.conditionNote) texts.add(a.conditionNote);
  }
  return [...texts];
}

async function missingByLang(texts) {
  const rows = await prisma.translationCache.findMany({
    where: { sourceHash: { in: texts.map(hashText) } },
    select: { sourceHash: true, targetLang: true },
  });
  const have = new Set(rows.map((r) => r.targetLang + ':' + r.sourceHash));
  const out = {};
  for (const l of TRANSLATION_LANGS) out[l] = texts.filter((t) => !have.has(l + ':' + hashText(t)));
  return out;
}

const REVIEW = ['APPROVED', 'REJECTED', 'PENDING'];

// 運営向け：掲載内容の確認（7-2, 8-3）・翻訳/食品表示の報告対応（4-2, 9-2）・用語集管理
export default [
  // 自動翻訳（Gemini）の状態。キーが設定されたかどうか・直近のエラー・未翻訳の件数
  [
    'GET',
    'admin/translation/status',
    async ({ user }) => {
      admin(user);
      const missing = await missingByLang(await publishedTexts());
      return { ...llmStatus(), missing: Object.fromEntries(Object.entries(missing).map(([l, list]) => [l, list.length])) };
    },
  ],
  // 接続テスト：短い文を 1 つ翻訳してみる（キャッシュは使わない）
  [
    'POST',
    'admin/translation/test',
    async ({ user }) => {
      admin(user);
      const sample = '抹茶と季節の和菓子';
      const text = await translateOne(sample, 'en', { cache: false });
      return { ok: Boolean(text), sample, text, ...llmStatus() };
    },
  ],
  // 未翻訳の掲載文をまとめて翻訳する。関数の時間制限に収まるよう 1 回 35 秒までで区切る
  [
    'POST',
    'admin/translation/backfill',
    async ({ user }) => {
      admin(user);
      const started = Date.now();
      const texts = await publishedTexts();
      let translated = 0;
      for (const lang of TRANSLATION_LANGS) {
        let missing = (await missingByLang(texts))[lang];
        while (missing.length && Date.now() - started < 35_000) {
          const chunk = missing.slice(0, 40);
          const result = await translateMany(chunk, lang);
          const done = chunk.filter((t) => result.get(t)).length;
          translated += done;
          if (!done) break; // エラーで進まないときは止める
          missing = missing.slice(chunk.length);
        }
      }
      const remaining = Object.values(await missingByLang(texts)).reduce((n, list) => n + list.length, 0);
      return { translated, remaining, ...llmStatus() };
    },
  ],
  [
    'GET',
    'admin/overview',
    async ({ user }) => {
      admin(user);
      const [reports, shops, referrals, glossary] = await Promise.all([
        prisma.report.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 200 }),
        prisma.shop.findMany({
          where: {
            OR: [
              { published: false },
              { ownerWordsStatus: 'PENDING', ownerWords: { not: null } },
              { dailyProfileStatus: 'PENDING', dailyProfile: { not: null } },
            ],
          },
          include: { owner: { select: { email: true } } },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.referral.findMany({
          where: { reviewStatus: 'PENDING' },
          include: { fromShop: { select: { name: true } }, toShop: { select: { name: true } } },
        }),
        prisma.glossaryTerm.findMany({ orderBy: { ja: 'asc' } }),
      ]);
      return { reports, shops, referrals, glossary };
    },
  ],
  [
    'POST',
    'admin/reports/:id/resolve',
    async ({ user, params }) => {
      admin(user);
      await prisma.report.update({ where: { id: params.id }, data: { status: 'RESOLVED' } });
      return { ok: true };
    },
  ],
  [
    'POST',
    'admin/shops/:id/review',
    async ({ user, params, body }) => {
      admin(user);
      const data = {};
      if (REVIEW.includes(body.ownerWordsStatus)) data.ownerWordsStatus = body.ownerWordsStatus;
      if (REVIEW.includes(body.dailyProfileStatus)) data.dailyProfileStatus = body.dailyProfileStatus;
      if (typeof body.published === 'boolean') data.published = body.published;
      const shop = await prisma.shop.update({ where: { id: params.id }, data }).catch(() => null);
      if (!shop) throw notFound();
      return { ok: true };
    },
  ],
  [
    'POST',
    'admin/referrals/:id/review',
    async ({ user, params, body }) => {
      admin(user);
      if (!REVIEW.includes(body.status)) throw bad('invalid_status');
      await prisma.referral.update({ where: { id: params.id }, data: { reviewStatus: body.status } });
      return { ok: true };
    },
  ],
  [
    'PUT',
    'admin/glossary',
    async ({ user, body }) => {
      admin(user);
      const data = { ja: str(body.ja, { required: true, max: 100, name: 'ja' }), note: str(body.note, { max: 200, name: 'note' }) };
      for (const l of TRANSLATION_LANGS) data[l] = str(body[l], { required: true, max: 200, name: l });
      await prisma.glossaryTerm.upsert({ where: { ja: data.ja }, update: data, create: data });
      invalidateGlossary();
      return { ok: true };
    },
  ],
  [
    'DELETE',
    'admin/glossary/:id',
    async ({ user, params }) => {
      admin(user);
      await prisma.glossaryTerm.delete({ where: { id: params.id } });
      invalidateGlossary();
      return { ok: true };
    },
  ],
  // 報告を受けた訳文を人手で修正する
  [
    'PUT',
    'admin/translations',
    async ({ user, body }) => {
      admin(user);
      const sourceText = str(body.sourceText, { required: true, max: 4000, name: 'sourceText' });
      if (!TRANSLATION_LANGS.includes(body.lang)) throw bad('invalid_lang');
      const text = str(body.text, { required: true, max: 4000, name: 'text' });
      const sourceHash = hashText(sourceText);
      await prisma.translationCache.upsert({
        where: { sourceHash_targetLang: { sourceHash, targetLang: body.lang } },
        update: { text, provider: 'manual' },
        create: { sourceHash, targetLang: body.lang, sourceText, text, provider: 'manual' },
      });
      return { ok: true };
    },
  ],
];
