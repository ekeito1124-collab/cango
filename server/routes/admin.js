import { prisma } from '../db.js';
import { bad, notFound, str } from '../http.js';
import { requireUser } from '../auth.js';
import { hashText, invalidateGlossary } from '../translate.js';
import { TRANSLATION_LANGS } from '../../shared/constants.js';

const admin = (user) => requireUser(user, ['ADMIN']);
const REVIEW = ['APPROVED', 'REJECTED', 'PENDING'];

// 運営向け：掲載内容の確認（7-2, 8-3）・翻訳/食品表示の報告対応（4-2, 9-2）・用語集管理
export default [
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
