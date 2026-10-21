import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db.js';
import { TRANSLATION_LANGS } from '../shared/constants.js';

// 自動翻訳（4-2, 13-3, 20-1）
// 1. 翻訳キャッシュ（シード時の訳・過去の翻訳）を優先する
// 2. ない場合は ANTHROPIC_API_KEY があれば Claude で翻訳し、用語集の固定訳を必ず使わせる
// 3. どちらもない場合は null を返し、画面側で日本語原文と「翻訳未対応」を表示する

const LANG_NAMES = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Simplified Chinese',
  ko: 'Korean',
  fr: 'French',
  es: 'Spanish',
};

export const translationEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client;
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

export const hashText = (t) => crypto.createHash('sha256').update(t).digest('hex');

let glossaryCache = null;
let glossaryAt = 0;
async function glossary() {
  if (!glossaryCache || Date.now() - glossaryAt > 60e3) {
    glossaryCache = await prisma.glossaryTerm.findMany();
    glossaryAt = Date.now();
  }
  return glossaryCache;
}

export function invalidateGlossary() {
  glossaryCache = null;
}

// 原文に含まれる用語の固定訳だけをプロンプトに渡す
function relevantTerms(terms, texts, from, to) {
  const joined = texts.join('\n');
  const out = [];
  for (const t of terms) {
    const src = from === 'ja' ? t.ja : t[from];
    const dst = to === 'ja' ? t.ja : t[to];
    if (src && dst && joined.toLowerCase().includes(src.toLowerCase())) out.push({ source: src, target: dst });
  }
  return out;
}

async function callClaude(texts, from, to, terms, context) {
  const system = [
    `You translate short texts for a booking app that connects foreign travelers with small local businesses in Japan.`,
    `Translate each item ${from === 'auto' ? 'from whatever language it is written in' : `from ${LANG_NAMES[from]}`} into ${LANG_NAMES[to]}.`,
    `Keep the meaning exact. Do not add, embellish, or drop information: no extra praise, no guarantees, no invented details.`,
    `Keep proper nouns (shop names, place names) readable; romanize Japanese names when there is no common translation.`,
    `Numbers, dates, times, prices and allergen names must stay exactly equivalent.`,
    terms.length
      ? `Always use these fixed glossary translations when the source term appears:\n${terms.map((t) => `- "${t.source}" => "${t.target}"`).join('\n')}`
      : '',
    context ? `Context: ${context}` : '',
    `Return one translation per input item, in the same order.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await anthropic().beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { translations: { type: 'array', items: { type: 'string' } } },
          required: ['translations'],
          additionalProperties: false,
        },
      },
    },
    system,
    messages: [{ role: 'user', content: JSON.stringify({ items: texts }) }],
  });
  if (response.stop_reason !== 'end_turn') {
    console.error('[translate] stop_reason', response.stop_reason);
    return null;
  }
  const block = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(block.text);
  if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length) return null;
  return parsed.translations;
}

/**
 * 複数テキストをまとめて翻訳する。戻り値は Map<原文, 訳文|null>
 * @param {string[]} texts
 * @param {string} to 翻訳先言語
 * @param {{from?: string, cache?: boolean, context?: string}} opts
 */
export async function translateMany(texts, to, { from = 'ja', cache = true, context } = {}) {
  const unique = [...new Set(texts.filter((t) => typeof t === 'string' && t.trim()))];
  const result = new Map();
  if (!unique.length) return result;
  if (from === to) {
    for (const t of unique) result.set(t, t);
    return result;
  }

  let missing = unique;
  if (cache) {
    const rows = await prisma.translationCache.findMany({
      where: { targetLang: to, sourceHash: { in: unique.map(hashText) } },
    });
    const byHash = new Map(rows.map((r) => [r.sourceHash, r.text]));
    missing = [];
    for (const t of unique) {
      const hit = byHash.get(hashText(t));
      if (hit !== undefined) result.set(t, hit);
      else missing.push(t);
    }
  }

  if (missing.length && translationEnabled()) {
    try {
      const terms = relevantTerms(await glossary(), missing, from, to);
      // 1 回の呼び出しを大きくしすぎないよう 40 件ずつ処理する
      for (let i = 0; i < missing.length; i += 40) {
        const chunk = missing.slice(i, i + 40);
        const out = await callClaude(chunk, from, to, terms, context);
        if (!out) continue;
        chunk.forEach((t, j) => result.set(t, out[j]));
        if (cache) {
          await prisma.translationCache.createMany({
            data: chunk.map((t, j) => ({ sourceHash: hashText(t), targetLang: to, sourceText: t, text: out[j], provider: 'claude' })),
            skipDuplicates: true,
          });
        }
      }
    } catch (e) {
      console.error('[translate]', e?.status || '', e?.message);
    }
  }

  for (const t of unique) if (!result.has(t)) result.set(t, null);
  return result;
}

export async function translateOne(text, to, opts) {
  if (!text) return null;
  return (await translateMany([text], to, opts)).get(text) ?? null;
}

// 事業者が日本語で登録した掲載文を、5 言語すべてに事前翻訳してキャッシュする
export async function pretranslate(texts) {
  const list = texts.filter(Boolean);
  if (!list.length || !translationEnabled()) return;
  await Promise.all(TRANSLATION_LANGS.map((l) => translateMany(list, l)));
}

// 画面表示用：{ text: 訳文 or 原文, original: 原文, translated: bool }
export function localized(map, text) {
  if (!text) return null;
  const t = map.get(text);
  return t ? { text: t, original: text, translated: t !== text } : { text, original: text, translated: false, missing: true };
}
