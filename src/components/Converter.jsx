import { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDateTime, fmtMoney } from '../lib.js';
import { Modal } from './ui.jsx';
import { CURRENCIES } from '../../shared/constants.js';

const FOREIGN = CURRENCIES.filter((c) => c !== 'JPY');
const QUICK_YEN = [1000, 3000, 5000, 10000];

// 為替計算。日本円 ⇄ 選んだ通貨を双方向に換算する（参考値）
export default function Converter() {
  const { t, lang, prefs, setPrefs, user, setUser, rates, ratesState, converter, closeConverter } = useApp();
  const [currency, setCurrency] = useState(prefs.currency !== 'JPY' ? prefs.currency : 'USD');
  const [yenToForeign, setYenToForeign] = useState(true);
  const [input, setInput] = useState(String(converter?.amount ?? 1000));
  if (!converter) return null;

  const rate = rates?.rates?.[currency];
  const amount = Number(String(input).replace(/[,\s]/g, ''));
  const valid = Number.isFinite(amount) && amount >= 0;
  const result = rate && valid ? (yenToForeign ? amount * rate : amount / rate) : null;
  const from = yenToForeign ? 'JPY' : currency;
  const to = yenToForeign ? currency : 'JPY';

  const useAsDisplay = () => {
    setPrefs({ currency });
    if (user) api('auth/profile', { method: 'PATCH', body: { currency } }).then((d) => setUser(d.user)).catch(() => {});
  };

  return (
    <Modal title={t('fx.title')} onClose={closeConverter}>
      <div className="converter stack">
        <label>
          <span className="field-label">{t('fx.currency')}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {FOREIGN.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="fx-box">
          <label className="fx-row">
            <span className="fx-code">{from}</span>
            <input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('fx.amount')} />
          </label>
          <button
            type="button"
            className="fx-swap"
            onClick={() => {
              setYenToForeign((v) => !v);
              if (result !== null) setInput(String(Math.round(result * 100) / 100));
            }}
            aria-label={t('fx.swap')}
          >
            ⇅
          </button>
          <div className="fx-row result" aria-live="polite">
            <span className="fx-code">{to}</span>
            <strong>{result !== null ? fmtMoney(result, to, lang) : ratesState === 'loading' || ratesState === 'idle' ? t('common.loading') : '—'}</strong>
          </div>
        </div>

        {yenToForeign && (
          <div className="chips">
            {QUICK_YEN.map((y) => (
              <button key={y} type="button" className="chip" onClick={() => setInput(String(y))}>
                ¥{y.toLocaleString('ja-JP')}
              </button>
            ))}
          </div>
        )}

        {rate ? (
          <p className="fine">
            1 JPY = {rate.toPrecision(4)} {currency} · 1 {currency} = {(1 / rate).toFixed(2)} JPY
            <br />
            {t('fx.note', { time: fmtDateTime(rates.fetchedAt, lang) })}
          </p>
        ) : (
          ratesState === 'error' && <p className="error">{t('fx.unavailable')}</p>
        )}

        {prefs.currency !== currency && (
          <button type="button" className="btn" onClick={useAsDisplay}>
            {t('fx.useAsDisplay', { c: currency })}
          </button>
        )}
      </div>
    </Modal>
  );
}
