import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, guessCurrency, store } from './lib.js';
import { makeT } from './i18n/index.js';
import { todayJst } from '../shared/constants.js';

const Ctx = createContext(null);

const DEFAULT_PREFS = {
  currency: 'JPY',
  characterVisible: true,
  onboarded: false,
  todayDate: null,
  today: { budget: null, dietary: [], allergies: [], religious: [] },
  // 宗教上の制限は同意した場合のみ質問し、この端末にのみ保存する（5-4, 20-2）
  religiousConsent: null, // { given: true|false, at: ISO }
};

export function AppProvider({ lang, children }) {
  const [user, setUser] = useState(undefined);
  const [meta, setMeta] = useState(null);
  const [prefs, setPrefsState] = useState(() => ({ ...DEFAULT_PREFS, currency: guessCurrency(), ...store.get('prefs', {}) }));
  const [rates, setRates] = useState(null);

  useEffect(() => {
    api('auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
    api('meta')
      .then(setMeta)
      .catch(() => setMeta({ translationEnabled: false, aiEnabled: false, policies: {}, today: todayJst() }));
  }, []);

  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) };
      store.set('prefs', next);
      return next;
    });
  }, []);

  // ログイン中は通貨をアカウントの設定に合わせる
  useEffect(() => {
    if (user?.currency && user.currency !== prefs.currency) setPrefs({ currency: user.currency });
  }, [user?.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  // 為替レートは必要になったときに 1 回だけ取得する
  const [ratesState, setRatesState] = useState('idle');
  const loadRates = useCallback(() => {
    if (ratesState !== 'idle') return;
    setRatesState('loading');
    api('rates')
      .then((d) => {
        setRates(d.rates);
        setRatesState(d.rates ? 'ready' : 'error');
      })
      .catch(() => setRatesState('error'));
  }, [ratesState]);
  useEffect(() => {
    if (prefs.currency && prefs.currency !== 'JPY') loadRates();
  }, [prefs.currency, loadRates]);

  // 為替計算（どの画面からでも開ける）
  const [converter, setConverter] = useState(null);
  const openConverter = useCallback(
    (amount) => {
      loadRates();
      setConverter({ amount: amount ?? 1000, id: Date.now() });
    },
    [loadRates],
  );

  const t = useMemo(() => makeT(lang), [lang]);
  const today = meta?.today || todayJst();
  // その日に初めて開いたときは「今日の希望」を確認し直す（5-4）
  const needsTodayCheck = prefs.onboarded && prefs.todayDate !== today;
  const aiActive = Boolean(meta?.aiEnabled && prefs.characterVisible);

  const value = {
    lang,
    t,
    user,
    setUser,
    meta,
    prefs,
    setPrefs,
    rates,
    ratesState,
    loadRates,
    converter,
    openConverter,
    closeConverter: () => setConverter(null),
    today,
    needsTodayCheck,
    aiActive,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
