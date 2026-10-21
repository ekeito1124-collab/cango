// デモデータ投入： npm run db:seed
// 何度実行しても同じ状態になる（デモ店舗の空き状況・料理・紹介は作り直す）
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { GLOSSARY, POLICIES, REFERRALS, SHOPS, T } from './seed-data.js';
import { addDays, defaultApprovalDeadline, todayJst, weekdayOf } from '../shared/constants.js';

const prisma = new PrismaClient();
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const password = process.env.SEED_PASSWORD || 'demo-pass-1234';

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);

  for (const p of POLICIES) {
    await prisma.cancellationPolicy.upsert({ where: { code_version: { code: p.code, version: p.version } }, update: p, create: p });
  }

  for (const g of GLOSSARY) await prisma.glossaryTerm.upsert({ where: { ja: g.ja }, update: g, create: g });

  for (const [ja, tr] of Object.entries(T)) {
    for (const [lang, text] of Object.entries(tr)) {
      await prisma.translationCache.upsert({
        where: { sourceHash_targetLang: { sourceHash: hash(ja), targetLang: lang } },
        update: { text, provider: 'seed' },
        create: { sourceHash: hash(ja), targetLang: lang, sourceText: ja, text, provider: 'seed' },
      });
    }
  }

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', passwordHash, role: 'ADMIN', lang: 'en' },
  });
  await prisma.user.upsert({
    where: { email: 'traveler@example.com' },
    update: {},
    create: { email: 'traveler@example.com', passwordHash, role: 'TRAVELER', lang: 'en', currency: 'SGD', cardDemoCompleted: true },
  });

  const today = todayJst();
  const ids = {};
  for (const s of SHOPS) {
    const { dishes, limited, ...data } = s;
    const owner = await prisma.user.upsert({
      where: { email: `owner+${s.slug}@example.com` },
      update: {},
      create: { email: `owner+${s.slug}@example.com`, passwordHash, role: 'OWNER', lang: 'en' },
    });
    const shopData = {
      ...data,
      published: true,
      isDemo: true,
      ownerWordsStatus: 'APPROVED',
      dailyProfileStatus: 'APPROVED',
      ownerId: owner.id,
    };
    const shop = await prisma.shop.upsert({ where: { slug: s.slug }, update: shopData, create: shopData });
    ids[s.slug] = shop.id;

    await prisma.dish.deleteMany({ where: { shopId: shop.id } });
    if (dishes.length) await prisma.dish.createMany({ data: dishes.map((d, i) => ({ ...d, shopId: shop.id, sortOrder: i })) });

    // 空き状況：今日から 21 日分。定休日は ✕、数日おきに △ や ✕（繁忙）を混ぜる
    await prisma.availability.deleteMany({ where: { shopId: shop.id } });
    if (s.reservationMethod !== 'NONE') {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        const date = addDays(today, i);
        let status = 'OK';
        let conditions = [];
        let conditionNote = null;
        if (s.closedDays.includes(weekdayOf(date))) status = 'FULL';
        else if (i % 5 === 2 && limited) {
          status = 'LIMITED';
          conditions = limited.conditions;
          conditionNote = limited.conditionNote || null;
        } else if (i % 7 === 4) {
          status = 'FULL';
          conditions = s.slug === 'tsujimura-chaen' ? ['BUSY_SEASON'] : [];
        }
        // 電話対応店舗は空き情報の更新が数日おきになりがち、という想定で一部を未登録にする
        if (s.reservationMethod === 'EMAIL' && i > 10) continue;
        rows.push({ shopId: shop.id, date, status, conditions, conditionNote, approvalDeadline: defaultApprovalDeadline(shop, date) });
      }
      await prisma.availability.createMany({ data: rows });
    }
  }

  await prisma.referral.deleteMany({ where: { fromShopId: { in: Object.values(ids) } } });
  for (const r of REFERRALS) {
    await prisma.referral.create({
      data: { fromShopId: ids[r.from], toShopId: ids[r.to], message: r.message, targetConsent: 'APPROVED', reviewStatus: 'APPROVED' },
    });
  }

  console.log('Seed completed.');
  console.log(`  admin:    admin@example.com / ${password}`);
  console.log(`  traveler: traveler@example.com / ${password}`);
  console.log(`  owners:   owner+<slug>@example.com / ${password}  (例: owner+tsujimura-chaen@example.com)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
