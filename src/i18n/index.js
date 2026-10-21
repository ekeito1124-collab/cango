import en from './en.js';
import zh from './zh.js';
import ko from './ko.js';
import fr from './fr.js';
import es from './es.js';
import ja from './ja.js';

const dicts = { en, zh, ko, fr, es, ja };
export const LOCALES = { en: 'en-GB', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', es: 'es-ES', ja: 'ja-JP' };

export function makeT(lang) {
  const d = dicts[lang] || en;
  return (key, vars) => {
    let s = d[key] ?? en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
    return s;
  };
}
