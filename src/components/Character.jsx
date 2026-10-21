import { useEffect, useId, useState } from 'react';
import { useApp } from '../context.jsx';

// 案内役キャラクター「チャボ」：立体感のある小さな恐竜（グラデーションと光沢で 3D 風に描画）
export function ChaboIcon({ size = 56, animated = true }) {
  const id = useId().replace(/:/g, '');
  const g = (name) => `url(#${name}-${id})`;
  return (
    <svg className={animated ? 'dino' : undefined} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={`body-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#c6f29a" />
          <stop offset="0.45" stopColor="#7fcf55" />
          <stop offset="1" stopColor="#3f8f2f" />
        </radialGradient>
        <radialGradient id={`belly-${id}`} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="1" stopColor="#f2d58e" />
        </radialGradient>
        <radialGradient id={`spike-${id}`} cx="30%" cy="25%" r="80%">
          <stop offset="0" stopColor="#ffd59a" />
          <stop offset="1" stopColor="#f0803c" />
        </radialGradient>
        <radialGradient id={`eye-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#4a3a2e" />
          <stop offset="1" stopColor="#120c08" />
        </radialGradient>
        <linearGradient id={`cup-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfaf3" />
          <stop offset="1" stopColor="#d9cdb5" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="32" ry="5" fill="#000" opacity="0.16" />
      {/* しっぽ */}
      <path d="M84 92 Q110 98 116 78 Q112 74 108 80 Q100 90 82 80 Z" fill={g('body')} />
      {/* 背中のトゲ */}
      <g fill={g('spike')}>
        <path d="M70 18 q7 -4 9 5 q-4 3 -9 -5z" />
        <path d="M80 28 q8 -3 8 7 q-5 2 -8 -7z" />
        <path d="M86 54 q9 -2 7 8 q-5 1 -7 -8z" />
        <path d="M90 68 q9 0 5 9 q-5 0 -5 -9z" />
      </g>
      {/* からだ */}
      <ellipse cx="64" cy="82" rx="28" ry="25" fill={g('body')} />
      <ellipse cx="58" cy="88" rx="17" ry="16" fill={g('belly')} />
      {/* あし */}
      <ellipse cx="48" cy="106" rx="10" ry="5.5" fill={g('body')} />
      <ellipse cx="74" cy="106" rx="10" ry="5.5" fill={g('body')} />
      {/* あたま */}
      <ellipse cx="52" cy="44" rx="33" ry="29" fill={g('body')} />
      <ellipse cx="40" cy="26" rx="12" ry="6" fill="#fff" opacity="0.45" transform="rotate(-18 40 26)" />
      {/* め */}
      <ellipse cx="40" cy="44" rx="8" ry="9" fill="#fff" />
      <ellipse cx="64" cy="44" rx="8" ry="9" fill="#fff" />
      <circle cx="41" cy="46" r="5.5" fill={g('eye')} />
      <circle cx="63" cy="46" r="5.5" fill={g('eye')} />
      <circle cx="43" cy="43.5" r="2" fill="#fff" />
      <circle cx="65" cy="43.5" r="2" fill="#fff" />
      <circle cx="39.5" cy="48.5" r="0.9" fill="#fff" opacity="0.8" />
      <circle cx="61.5" cy="48.5" r="0.9" fill="#fff" opacity="0.8" />
      {/* ほっぺ・くち・はな */}
      <ellipse cx="30" cy="57" rx="6" ry="3.6" fill="#ff9aa2" opacity="0.6" />
      <ellipse cx="74" cy="57" rx="6" ry="3.6" fill="#ff9aa2" opacity="0.6" />
      <path d="M46 59 Q52 65 58 59" stroke="#2e5a1e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="47" cy="33" r="1.2" fill="#2e5a1e" opacity="0.5" />
      <circle cx="57" cy="33" r="1.2" fill="#2e5a1e" opacity="0.5" />
      {/* 抹茶の湯のみを持つ手 */}
      <rect x="49" y="76" width="18" height="15" rx="5" fill={g('cup')} />
      <ellipse cx="58" cy="77" rx="9" ry="2.6" fill="#7aa548" />
      <ellipse cx="46" cy="83" rx="5" ry="4" fill={g('body')} />
      <ellipse cx="70" cy="83" rx="5" ry="4" fill={g('body')} />
    </svg>
  );
}

// このタブで一度表示したメッセージ
const seenMessages = new Set();

// 案内役のキャラクター（10-1）。非表示にすると小さな再表示ボタンだけを残す
export function Character({ message, children }) {
  const { t, prefs, setPrefs } = useApp();
  const [collapsed, setCollapsed] = useState(() => seenMessages.has(message));
  // 画面を隠し続けないよう、初めて見るメッセージだけ開き、しばらくしたら顔アイコンだけに畳む（タップで再表示）
  useEffect(() => {
    if (!message || seenMessages.has(message)) {
      setCollapsed(true);
      return undefined;
    }
    seenMessages.add(message);
    setCollapsed(false);
    const timer = setTimeout(() => setCollapsed(true), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!prefs.characterVisible) {
    return (
      <button className="chabo-mini" onClick={() => setPrefs({ characterVisible: true })} aria-label={t('char.show')} title={t('char.show')}>
        <ChaboIcon size={34} />
      </button>
    );
  }
  if (!message && !children) return null;
  return (
    <aside className={'chabo' + (collapsed ? ' collapsed' : '')} aria-label={t('char.name')}>
      <button className="chabo-face" onClick={() => setCollapsed((c) => !c)} aria-label={t('char.name')}>
        <ChaboIcon />
      </button>
      {!collapsed && (
        <div className="chabo-bubble">
          <div className="chabo-head">
            <strong>{t('char.name')}</strong>
            <button className="link small" onClick={() => setPrefs({ characterVisible: false })}>
              {t('char.hide')}
            </button>
          </div>
          {message && <p>{message}</p>}
          {children}
        </div>
      )}
    </aside>
  );
}

// 店舗データだけからおすすめ理由を組み立てる（データにない情報は断定しない：9-3）
export function shopReason(shop, t, year) {
  const parts = [];
  if (shop.guide.foundedYear) parts.push(t('char.shopYears', { n: year - shop.guide.foundedYear }));
  if (shop.guide.ownerDistance === 'OWNER_SERVES') parts.push(t('char.shopFamilyOwner'));
  if (shop.guide.ownerDistance === 'MAKER_PRESENT') parts.push(t('char.shopMaker'));
  if (shop.guide.clientele === 'LOCAL_MOSTLY') parts.push(t('char.shopLocal'));
  if (shop.guide.soloWelcome) parts.push(t('char.shopSolo'));
  if (!parts.length) return null;
  return `${t('char.shopBased')} ${parts.join(', ')}.`;
}
