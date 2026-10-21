import { prisma } from './db.js';
import { CURRENCIES } from '../shared/constants.js';

const TTL_MS = 12 * 3600e3;

// 為替レート（参考値）。open.er-api.com から取得し、DB に 12 時間キャッシュする
export async function getRates() {
  const cached = await prisma.exchangeRate.findMany();
  const fresh = cached.length && cached.every((r) => Date.now() - r.fetchedAt.getTime() < TTL_MS);
  if (fresh) return pack(cached);
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    if (data.result !== 'success') throw new Error('rate api error');
    const fetchedAt = new Date((data.time_last_update_unix || Date.now() / 1000) * 1000);
    const rows = CURRENCIES.filter((c) => c !== 'JPY' && data.rates[c]).map((c) => ({ currency: c, rate: data.rates[c], fetchedAt }));
    await prisma.$transaction(
      rows.map((row) => prisma.exchangeRate.upsert({ where: { currency: row.currency }, update: row, create: row })),
    );
    return pack(rows);
  } catch (e) {
    console.error('[rates]', e.message);
    return cached.length ? pack(cached) : null;
  }
}

function pack(rows) {
  const rates = { JPY: 1 };
  let fetchedAt = null;
  for (const r of rows) {
    rates[r.currency] = r.rate;
    if (!fetchedAt || r.fetchedAt < fetchedAt) fetchedAt = r.fetchedAt;
  }
  return { base: 'JPY', rates, fetchedAt };
}
