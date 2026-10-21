import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../lib.js';
import { Chips, Modal } from './ui.jsx';
import { ChaboIcon } from './Character.jsx';
import { ALLERGENS, BUDGETS, CURRENCIES, DIETARY, LANGS, LANG_LABELS, RELIGIOUS } from '../../shared/constants.js';

export function ReligiousQuestion({ value, onChange }) {
  const { t, prefs, setPrefs } = useApp();
  const consent = prefs.religiousConsent;
  if (consent?.given === false) return null;
  if (!consent) {
    return (
      <div className="consent">
        <h4>{t('consent.title')}</h4>
        <p>{t('consent.body')}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setPrefs({ religiousConsent: { given: true, at: new Date().toISOString() } })}>
            {t('consent.agree')}
          </button>
          <button type="button" className="btn" onClick={() => setPrefs({ religiousConsent: { given: false, at: new Date().toISOString() } })}>
            {t('consent.decline')}
          </button>
        </div>
      </div>
    );
  }
  return <Chips options={RELIGIOUS} value={value} onChange={onChange} label={(c) => t('rel.' + c)} />;
}

export function TodayQuestions({ draft, setDraft }) {
  const { t } = useApp();
  return (
    <div className="stack">
      <p className="muted">{t('onb.todayIntro')}</p>
      <fieldset>
        <legend>{t('onb.budget')}</legend>
        <Chips multi={false} options={BUDGETS.map((b) => b.code)} value={draft.budget} onChange={(v) => setDraft({ ...draft, budget: v })} label={(c) => t('budget.' + c)} />
        <p className="fine">{t('onb.budgetNote')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('onb.dietary')}</legend>
        <Chips options={DIETARY} value={draft.dietary} onChange={(v) => setDraft({ ...draft, dietary: v })} label={(c) => t('diet.' + c)} />
      </fieldset>
      <fieldset>
        <legend>{t('onb.allergies')}</legend>
        <Chips options={ALLERGENS} value={draft.allergies} onChange={(v) => setDraft({ ...draft, allergies: v })} label={(c) => t('allergen.' + c)} />
        <p className="fine">{t('onb.allergiesNote')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('onb.religious')}</legend>
        <ReligiousQuestion value={draft.religious} onChange={(v) => setDraft({ ...draft, religious: v })} />
      </fieldset>
    </div>
  );
}

// 初回アクセス（5-2）と、その日最初のアクセス時の「今日の希望」確認（5-4）
export default function Onboarding({ onlyToday = false, onDone }) {
  const { t, lang, prefs, setPrefs, user, setUser, today } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(onlyToday ? 2 : 0);
  const [draft, setDraft] = useState(prefs.today);

  const finish = (skipToday = false) => {
    const religious = prefs.religiousConsent?.given ? draft.religious : [];
    setPrefs({
      onboarded: true,
      todayDate: today,
      today: skipToday ? { budget: null, dietary: [], allergies: [], religious: [] } : { ...draft, religious },
    });
    onDone?.();
  };

  const changeLang = (l) => {
    if (user) api('auth/profile', { method: 'PATCH', body: { lang: l } }).then((d) => setUser(d.user)).catch(() => {});
    navigate(location.pathname.replace(/^\/[a-z]{2}/, '/' + l) + location.search, { replace: true });
  };
  const changeCurrency = (c) => {
    setPrefs({ currency: c });
    if (user) api('auth/profile', { method: 'PATCH', body: { currency: c } }).then((d) => setUser(d.user)).catch(() => {});
  };

  return (
    <Modal title={step === 2 ? t('onb.todayTitle') : step === 1 ? t('onb.profileTitle') : t('app.name')} onClose={() => finish(true)}>
      {step === 0 && (
        <div className="stack">
          <div className="onb-hello">
            {prefs.characterVisible && <ChaboIcon size={72} />}
            <p>{t('onb.hello')}</p>
          </div>
          <p className="muted">{t('onb.account')}</p>
          <div className="row wrap">
            {!user && (
              <Link className="btn primary" to={`/${lang}/register`} onClick={() => setPrefs({ onboarded: true })}>
                {t('onb.createAccount')}
              </Link>
            )}
            <button className="btn" onClick={() => setStep(1)}>
              {user ? t('common.next') : t('onb.later')}
            </button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <fieldset>
            <legend>{t('onb.lang')}</legend>
            <Chips multi={false} options={LANGS} value={lang} onChange={(v) => v && changeLang(v)} label={(c) => LANG_LABELS[c]} />
          </fieldset>
          <fieldset>
            <legend>{t('onb.currency')}</legend>
            <Chips multi={false} options={CURRENCIES} value={prefs.currency} onChange={(v) => v && changeCurrency(v)} label={(c) => c} />
          </fieldset>
          <div className="row">
            <button className="btn" onClick={() => setStep(0)}>
              {t('common.back')}
            </button>
            <button className="btn primary" onClick={() => setStep(2)}>
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <TodayQuestions draft={draft} setDraft={setDraft} />
          <div className="row wrap">
            <button className="btn primary" onClick={() => finish(false)}>
              {t('onb.done')}
            </button>
            <button className="btn" onClick={() => finish(true)}>
              {t('onb.skipAll')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
