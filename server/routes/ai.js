import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db.js';
import { HttpError, notFound, str } from '../http.js';
import { translationEnabled } from '../translate.js';
import { shopTexts, visibleReferralWhere } from '../shopView.js';
import {
  ALLERGENS,
  CATEGORIES,
  CLIENTELE,
  DIETARY,
  LANGS,
  OWNER_DISTANCE,
  RELIGIOUS,
  SCENES,
  SHOP_LANGS,
} from '../../shared/constants.js';

// AI による条件変換・質疑応答（10章, SHOULD）
// 画面側はキャラクター表示中のみ呼び出す。回答は登録済みの店舗データに限定する

const LANG_NAMES = { en: 'English', zh: 'Simplified Chinese', ko: 'Korean', fr: 'French', es: 'Spanish', ja: 'Japanese' };
let client;
const anthropic = () => (client ||= new Anthropic());

async function structured(system, user, schema) {
  if (!translationEnabled()) throw new HttpError(503, 'ai_unavailable');
  const response = await anthropic().beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason !== 'end_turn') throw new HttpError(502, 'ai_failed');
  return JSON.parse(response.content.find((b) => b.type === 'text').text);
}

const enumArray = (values) => ({ type: 'array', items: { type: 'string', enum: values } });

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    category: enumArray(CATEGORIES),
    scene: { type: 'string', enum: [...SCENES, 'none'] },
    clientele: enumArray(CLIENTELE),
    ownerDistance: enumArray(OWNER_DISTANCE),
    dietary: enumArray(DIETARY),
    religious: enumArray(RELIGIOUS),
    allergens: enumArray(ALLERGENS),
    langs: enumArray(SHOP_LANGS),
    solo: { type: 'boolean' },
    notInGuides: { type: 'boolean' },
    available: { type: 'boolean' },
    party: { type: 'integer', description: '0 when not mentioned' },
    unsupported: { type: 'array', items: { type: 'string' } },
  },
  required: ['category', 'scene', 'clientele', 'ownerDistance', 'dietary', 'religious', 'allergens', 'langs', 'solo', 'notInGuides', 'available', 'party', 'unsupported'],
  additionalProperties: false,
};

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['shop_fact', 'general_travel', 'unknown'] },
    answer: { type: 'string' },
  },
  required: ['kind', 'answer'],
  additionalProperties: false,
};

export default [
  [
    'POST',
    'ai/parse',
    async ({ body }) => {
      const text = str(body.text, { required: true, max: 300, name: 'text' });
      const system = [
        'Convert a traveler\'s free-text wish into search filters for a local-shop booking app in Japan.',
        'Use only the enum codes in the schema. Leave a field empty/false/null when the wish does not clearly ask for it.',
        'Codes: clientele LOCAL_MOSTLY = shop self-reports mostly local customers. ownerDistance OWNER_SERVES = owner serves guests, MAKER_PRESENT = you can meet the maker.',
        'notInGuides = the traveler wants places not listed in guidebooks/tours. available = they want places likely to accept a booking on the chosen date.',
        'Use scene "none" and party 0 when not mentioned. Scenes: tea_time, after_work, old_breakfast, shotengai_afternoon (shopping street afternoon), local_diner, today.',
        'Put any part of the wish that cannot be expressed with these filters into "unsupported", written in the traveler\'s language, briefly.',
      ].join('\n');
      const filters = await structured(system, text, PARSE_SCHEMA);
      if (filters.scene === 'none') filters.scene = null;
      if (!(filters.party > 0 && filters.party <= 20)) filters.party = null;
      return { filters };
    },
  ],
  [
    'POST',
    'ai/ask',
    async ({ body }) => {
      const question = str(body.question, { required: true, max: 300, name: 'question' });
      const lang = LANGS.includes(body.lang) ? body.lang : 'en';
      const shop = await prisma.shop.findFirst({
        where: { slug: String(body.shopSlug || ''), published: true },
        include: { dishes: true, referralsFrom: { where: visibleReferralWhere, include: { toShop: { select: { name: true } } } } },
      });
      if (!shop) throw notFound('shop_not_found');
      const bookable = shop.reservationMethod !== 'NONE';
      // 公開済みの情報だけを渡す（未確認の店主のことば等は含めない）
      const facts = {
        name: shop.name,
        category: shop.category,
        address: shop.address,
        texts: shopTexts(shop, { detail: true }),
        hours: shop.hoursText,
        closedDays: shop.closedDays,
        priceYen: [shop.priceMin, shop.priceMax],
        reservationMethod: shop.reservationMethod,
        selfReported: {
          clientele: shop.clientele,
          regulars: shop.regulars,
          guidebookListed: shop.guidebookListed,
          tourListed: shop.tourListed,
          foundedYear: shop.foundedYear,
          ownerDistance: shop.ownerDistance,
          soloWelcome: shop.soloWelcome,
        },
        ...(bookable
          ? {
              languages: shop.languages,
              halalCertified: shop.halalCertified,
              dietarySelfDeclared: shop.dietaryOptions,
              allergenFreeShopwide: shop.allergenFreeShopwide,
              ingredientAdjust: shop.ingredientAdjust,
              maxPartySize: shop.maxPartySize,
              dishes: shop.dishes.map((d) => ({ name: d.name, priceYen: d.price, allergens: d.allergens, dietary: d.dietary })),
            }
          : {}),
      };
      const system = [
        `You are a friendly guide character in a booking app for local shops in Japan. Answer in ${LANG_NAMES[lang]}, in at most 3 short sentences.`,
        'For questions about this shop, answer ONLY from the shop data provided. Never guess. If the data does not contain the answer, set kind to "unknown" and say you do not know and suggest asking the shop.',
        'Dietary, halal and allergy information other than official halal certification is self-declared by the shop; say so when relevant. Never claim there is no cross-contact.',
        'For general travel-in-Japan questions (manners, tipping, payment), set kind to "general_travel" and give a general tendency, making clear it is general information.',
        'Do not invent owner quotes, ratings, popularity, or experiences.',
      ].join('\n');
      const user = `Shop data (JSON):\n${JSON.stringify(facts)}\n\nTraveler question:\n${question}`;
      return await structured(system, user, ASK_SCHEMA);
    },
  ],
];
