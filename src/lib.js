import { useCallback, useRef, useState } from 'react';
import { LOCALES } from './i18n/index.js';

export class ApiError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api/' + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
      qs.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const res = await fetch(url, {
    method,
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'server_error', data.detail);
  return data;
}

// localStorage は使えない環境もあるため、必ず try/catch で包む
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('cango.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('cango.' + key, JSON.stringify(value));
    } catch {
      /* 保存できなくても動作は続ける */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem('cango.' + key);
    } catch {
      /* noop */
    }
  },
};

export function fmtDateTime(value, lang) {
  if (!value) return '';
  return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', {
    timeZone: 'Asia/Tokyo',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function fmtDate(dateStr, lang, opts = { month: 'short', day: 'numeric', weekday: 'short' }) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${dateStr}T00:00:00Z`));
}

export const yen = (n) => (n ?? 0).toLocaleString('ja-JP');

export function fmtMoney(amount, currency, lang) {
  return new Intl.NumberFormat(LOCALES[lang] || 'en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: ['JPY', 'KRW', 'TWD'].includes(currency) ? 0 : 2,
  }).format(amount);
}

// 連打しても 1 回しか送らないためのガード。
// 状態の更新を待たずに ref で即座に止めるので、ダブルクリックでも二重送信しない

export function useGuard() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const guard = useCallback(
    (fn) =>
      async (...args) => {
        const ev = args[0];
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (running.current) return undefined;
        running.current = true;
        setBusy(true);
        try {
          return await fn(...args);
        } finally {
          running.current = false;
          setBusy(false);
        }
      },
    [],
  );
  return [busy, guard];
}

// ブラウザの言語・地域から表示通貨を推測する（例：en-SG → SGD）
const REGION_CURRENCY = {
  SG: 'SGD', US: 'USD', GB: 'GBP', AU: 'AUD', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW', TH: 'THB', MY: 'MYR', JP: 'JPY',
};
const EURO = ['FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'HR'];
export function guessCurrency() {
  try {
    for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
      if (EURO.includes(region)) return 'EUR';
    }
  } catch {
    /* 判定できなければ日本円 */
  }
  return 'JPY';
}
