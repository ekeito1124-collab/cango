import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDateTime } from '../lib.js';
import { Chips } from '../components/ui.jsx';
import { TodayQuestions } from '../components/Onboarding.jsx';
import { CURRENCIES, LANGS, LANG_LABELS } from '../../shared/constants.js';

export default function Settings() {
  const { t, lang, prefs, setPrefs, user, setUser, today, meta } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(prefs.today);
  const [saved, setSaved] = useState(false);
  const [glossary, setGlossary] = useState(null);

  useEffect(() => {
    setDraft(prefs.today);
  }, [prefs.today]);

  const changeLang = (l) => {
    if (user) api('auth/profile', { method: 'PATCH', body: { lang: l } }).then((d) => setUser(d.user)).catch(() => {});
    navigate(location.pathname.replace(/^\/[a-z]{2}/, '/' + l), { replace: true });
  };
  const changeCurrency = (c) => {
    setPrefs({ currency: c });
    if (user) api('auth/profile', { method: 'PATCH', body: { currency: c } }).then((d) => setUser(d.user)).catch(() => {});
  };
  const saveToday = () => {
    setPrefs({ today: { ...draft, religious: prefs.religiousConsent?.given ? draft.religious : [] }, todayDate: today, onboarded: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  // 同意の撤回：宗教上の制限の回答をこの端末から削除する
  const deleteReligious = () => {
    setPrefs({ religiousConsent: null, today: { ...prefs.today, religious: [] } });
    setDraft((d) => ({ ...d, religious: [] }));
  };
  const loadGlossary = () => api('glossary', { query: { lang } }).then((d) => setGlossary(d.terms));

  return (
    <div className="settings stack">
      <h1>{t('settings.title')}</h1>

      <section className="card">
        <h2>{t('onb.lang')}</h2>
        <Chips multi={false} options={LANGS} value={lang} onChange={(v) => v && changeLang(v)} label={(c) => LANG_LABELS[c]} />
        <h2>{t('onb.currency')}</h2>
        <Chips multi={false} options={CURRENCIES} value={prefs.currency} onChange={(v) => v && changeCurrency(v)} label={(c) => c} />
      </section>

      <section className="card">
        <h2>{t('settings.character')}</h2>
        <Chips
          multi={false}
          options={['show', 'hide']}
          value={prefs.characterVisible ? 'show' : 'hide'}
          onChange={(v) => v && setPrefs({ characterVisible: v === 'show' })}
          label={(c) => (c === 'show' ? t('char.show') : t('char.hide'))}
        />
        <p className="fine">{t('settings.characterNote')}</p>
      </section>

      <section className="card">
        <h2>{t('settings.today')}</h2>
        <TodayQuestions draft={draft} setDraft={setDraft} />
        <button className="btn primary" onClick={saveToday}>
          {saved ? t('common.saved') : t('common.save')}
        </button>
      </section>

      <section className="card">
        <h2>{t('settings.religiousData')}</h2>
        {prefs.religiousConsent?.given ? (
          <>
            <p className="fine">{t('settings.consentGiven', { time: fmtDateTime(prefs.religiousConsent.at, lang) })}</p>
            <p className="fine">{t('consent.body')}</p>
            <button className="btn danger-outline" onClick={deleteReligious}>
              {t('settings.deleteReligious')}
            </button>
          </>
        ) : (
          <>
            <p className="fine">{t('settings.noConsent')}</p>
            {prefs.religiousConsent?.given === false && (
              <button className="btn" onClick={() => setPrefs({ religiousConsent: null })}>
                {t('settings.giveConsent')}
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>{t('privacy.title')}</h2>
        <p>{meta?.translationEnabled ? t('privacy.translationOn') : t('privacy.translationOff')}</p>
        <p className="fine">{t('privacy.local')}</p>
      </section>

      <section className="card">
        <h2>{t('settings.glossary')}</h2>
        {glossary ? (
          <table className="glossary">
            <tbody>
              {glossary.map((g) => (
                <tr key={g.ja}>
                  <td lang="ja">{g.ja}</td>
                  <td>{g.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <button className="btn" onClick={loadGlossary}>
            {t('settings.glossary')}
          </button>
        )}
      </section>
    </div>
  );
}
