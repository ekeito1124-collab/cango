import { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDateTime, fmtMoney, useGuard, yen } from '../lib.js';

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="close">
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// 選択式のチップ（複数選択 or 単一選択）
export function Chips({ options, value, onChange, multi = true, label }) {
  const selected = multi ? value || [] : value;
  const toggle = (code) => {
    if (multi) onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
    else onChange(selected === code ? null : code);
  };
  return (
    <div className="chips">
      {options.map((code) => {
        const on = multi ? selected.includes(code) : selected === code;
        return (
          <button type="button" key={code} className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(code)}>
            {label(code)}
          </button>
        );
      })}
    </div>
  );
}

// 翻訳されたテキスト：訳文・原文の切り替えと、翻訳品質の報告（4-2）
export function Translated({ value, context, as: Tag = 'p', className }) {
  const { t, lang } = useApp();
  const [showOrig, setShowOrig] = useState(false);
  const [reporting, setReporting] = useState(false);
  if (!value) return null;
  return (
    <div className={'translated ' + (className || '')}>
      <Tag lang={value.translated ? undefined : 'ja'}>{value.text}</Tag>
      {value.missing && <div className="tr-note">{t('tr.missing')}</div>}
      {value.translated && (
        <div className="tr-meta">
          <button className="link" onClick={() => setShowOrig((v) => !v)} aria-expanded={showOrig}>
            {t('tr.machine')} · {showOrig ? t('tr.hideOriginal') : t('tr.showOriginal')}
          </button>
        </div>
      )}
      {showOrig && (
        <div className="original">
          <p lang="ja">{value.original}</p>
          <button className="link" onClick={() => setReporting(true)}>
            {t('tr.report')}
          </button>
        </div>
      )}
      {reporting && (
        <ReportDialog
          title={t('tr.reportTitle')}
          placeholder={t('tr.reportPlaceholder')}
          onClose={() => setReporting(false)}
          payload={{ kind: 'TRANSLATION', lang, sourceText: value.original, translatedText: value.text, context }}
        />
      )}
    </div>
  );
}

export function ReportDialog({ title, placeholder, payload, onClose }) {
  const { t } = useApp();
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, guard] = useGuard();
  const submit = guard(async (e) => {
    e.preventDefault();
    try {
      await api('reports', { method: 'POST', body: { ...payload, comment } });
      setDone(true);
    } catch {
      setErr(t('common.error'));
    }
  });
  return (
    <Modal title={title} onClose={onClose}>
      {done ? (
        <>
          <p>{t('tr.reportThanks')}</p>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          {payload.translatedText && <blockquote>{payload.translatedText}</blockquote>}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={placeholder} maxLength={2000} rows={3} />
          {err && <p className="error">{err}</p>}
          <button className="btn primary" disabled={busy}>{t('report.send')}</button>
        </form>
      )}
    </Modal>
  );
}

// 日本円を正とし、選択通貨の参考額を併記する（5-5 為替表示）
export function Money({ amount, max }) {
  const { prefs, rates, lang } = useApp();
  const cur = prefs.currency;
  const rate = cur !== 'JPY' && rates?.rates?.[cur];
  return (
    <span className="money">
      ¥{yen(amount)}
      {max !== undefined && max !== amount && <>–¥{yen(max)}</>}
      {rate ? (
        <span className="fx">
          {' '}
          (≈ {fmtMoney(amount * rate, cur, lang)}
          {max !== undefined && max !== amount && <>–{fmtMoney(max * rate, cur, lang)}</>})
        </span>
      ) : null}
    </span>
  );
}

export function FxNote() {
  const { prefs, rates, t, lang } = useApp();
  if (prefs.currency === 'JPY' || !rates?.rates?.[prefs.currency]) return null;
  return <p className="fine">{t('fx.note', { time: fmtDateTime(rates.fetchedAt, lang) })}</p>;
}

const SYMBOL = { OK: '○', LIMITED: '△', FULL: '✕' };

export function AvailBadge({ a, compact = false, inLink = false }) {
  const { t, lang } = useApp();
  if (!a) return <span className="avail none">— {t('explore.noAvailability')}</span>;
  const closed = a.status !== 'FULL' && a.deadlinePassed;
  return (
    <div className={'avail ' + (closed ? 'FULL' : a.status)}>
      <span className="sym" aria-hidden>
        {SYMBOL[closed ? 'FULL' : a.status]}
      </span>
      <span>
        {closed ? t('shop.deadlinePassed') : t('avail.' + a.status)}
        {a.conditions?.length > 0 && <> · {a.conditions.filter((c) => c !== 'OTHER').map((c) => t('cond.' + c)).join(' · ')}</>}
      </span>
      {a.conditionNote &&
        (inLink ? (
          <span className="note">{a.conditionNote.text}</span>
        ) : (
          <Translated value={a.conditionNote} as="span" className="inline" context="availability condition" />
        ))}
      {!compact && <span className="updated">{t('explore.lastUpdated', { time: fmtDateTime(a.updatedAt, lang) })}</span>}
    </div>
  );
}

export function GuideInfo({ guide, max }) {
  const { t, today } = useApp();
  const year = Number(today.slice(0, 4));
  const items = [];
  if (guide.clientele) items.push(t('clientele.' + guide.clientele));
  if (guide.regulars) items.push(t('regulars.' + guide.regulars));
  if (guide.foundedYear) items.push(t('shop.founded', { year: guide.foundedYear, n: year - guide.foundedYear }));
  if (guide.ownerDistance) items.push(t('ownerDist.' + guide.ownerDistance));
  if (guide.guidebookListed === false && guide.tourListed === false) items.push(t('explore.notInGuides'));
  if (guide.soloWelcome) items.push(t('explore.solo'));
  if (!items.length) return null;
  return (
    <ul className="guide-tags" title={t('common.selfReported')}>
      {(max ? items.slice(0, max) : items).map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

const CAT_COLORS = {
  tea_farm: '#5f8a4a',
  cafe: '#8a5a3c',
  shokudo: '#c0703a',
  izakaya: '#8c3b3b',
  wagashi: '#b0577a',
  shop: '#4a6a8a',
  workshop: '#6b5b8a',
  restaurant: '#a0782a',
};

// 写真がない店舗はカテゴリ色のプレースホルダーを表示する
export function ShopPhoto({ shop, className = '' }) {
  const { t } = useApp();
  if (shop.photo) return <img className={'shop-photo ' + className} src={shop.photo} alt="" loading="lazy" />;
  return (
    <div className={'shop-photo placeholder ' + className} style={{ background: CAT_COLORS[shop.category] || '#777' }}>
      <span>{t('cat.' + shop.category)}</span>
    </div>
  );
}

export function ErrorText({ error }) {
  const { t } = useApp();
  if (!error) return null;
  const key = 'err.' + error.code;
  const authKey = 'auth.err.' + error.code;
  const msg = t(key) !== key ? t(key) : t(authKey) !== authKey ? t(authKey) : t('common.error');
  return <p className="error">{msg}</p>;
}

// 日程別の〇△✕を日付グリッドで一覧表示し、タップした日の条件・期限を下に出す
export function AvailabilityGrid({ list, days = 14 }) {
  const { t, lang } = useApp();
  const firstOpen = list.find((a) => a.status !== 'FULL' && !a.deadlinePassed);
  const [selected, setSelected] = useState(firstOpen?.date || list[0]?.date);
  if (!list.length) return <p className="muted">{t('explore.noAvailability')}</p>;
  const shown = list.slice(0, days);
  const sel = shown.find((a) => a.date === selected);
  const effective = (a) => (a.status !== 'FULL' && a.deadlinePassed ? 'FULL' : a.status);
  return (
    <div>
      <div className="avail-grid" role="listbox" aria-label={t('shop.availability')}>
        {shown.map((a) => {
          const st = effective(a);
          const d = new Date(`${a.date}T00:00:00Z`);
          return (
            <button
              key={a.date}
              type="button"
              role="option"
              aria-selected={a.date === selected}
              className={'avail-cell ' + st + (a.date === selected ? ' on' : '')}
              onClick={() => setSelected(a.date)}
            >
              <span className="wd">{fmtDateParts(d, lang).weekday}</span>
              <span className="day">{fmtDateParts(d, lang).day}</span>
              <span className="sym" aria-label={t('avail.' + st)}>
                {SYMBOL[st]}
              </span>
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="avail-detail">
          <strong>{fmtDateParts(new Date(`${sel.date}T00:00:00Z`), lang).full}</strong>
          <AvailBadge a={sel} compact />
          {sel.status !== 'FULL' && !sel.deadlinePassed && <p className="fine">{t('shop.deadline', { time: fmtDateTime(sel.approvalDeadline, lang) })}</p>}
        </div>
      )}
    </div>
  );
}

function fmtDateParts(d, lang) {
  const loc = { en: 'en-GB', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', es: 'es-ES', ja: 'ja-JP' }[lang] || 'en-GB';
  const f = (o) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o }).format(d);
  return { weekday: f({ weekday: 'short' }), day: d.getUTCDate(), full: f({ month: 'long', day: 'numeric', weekday: 'short' }) };
}

// 文字数の上限と現在の文字数を表示するテキストエリア
export function TextArea({ value, onChange, placeholder, max = 1000, rows = 3, label }) {
  return (
    <div className="textarea-wrap">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} rows={rows} aria-label={label || placeholder} />
      <span className={'counter' + (value.length >= max * 0.9 ? ' near' : '')} aria-live="polite">
        {value.length}/{max}
      </span>
    </div>
  );
}

// 読み込み中に出す灰色の枠（文字だけの「読み込み中」より速く感じられる）
export function Skeleton({ kind = 'list', count = 3 }) {
  const { t } = useApp();
  if (kind === 'detail') {
    return (
      <div className="skeleton-wrap" aria-busy="true" aria-label={t('common.loading')}>
        <div className="sk sk-hero" />
        <div className="sk sk-title" />
        <div className="sk sk-line" />
        <div className="sk sk-line short" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
    );
  }
  return (
    <ul className="shop-list skeleton-wrap" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="sk-item">
          <div className="sk sk-thumb" />
          <div className="sk-body">
            <div className="sk sk-title" />
            <div className="sk sk-line" />
            <div className="sk sk-line short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
