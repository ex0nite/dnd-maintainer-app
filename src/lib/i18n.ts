import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '@/locales/en/common.json';
import commonFr from '@/locales/fr/common.json';
import gamedataEn from '@/locales/en/gamedata.json';
import { getLogger } from '@/lib/logger';
import { initialLanguage } from '@/lib/language';

const logger = getLogger('i18n');

// Resolved features for origin/general feats reuse the feat's own name and
// description. The Source → Grant pipeline emits features keyed `feat-<featId>`
// (e.g. `feat-savage-attacker`), but the feat text lives under the `feats` map
// keyed by bare id. Mirror each feat into the `features` map at init so the
// resolved-feature render path (`features.<id>.name`) resolves from a single
// source of truth instead of firing the missing-key handler.
const featFeatures: Record<string, { name: string; description?: string }> = Object.fromEntries(
  Object.entries(gamedataEn.feats).map(([featId, entry]) => [`feat-${featId}`, entry])
);

const gamedata = {
  ...gamedataEn,
  features: { ...gamedataEn.features, ...featFeatures },
};

// The page language is right from the first paint (the init below is asynchronous).
document.documentElement.lang = initialLanguage();

i18n
  .use(initReactI18next)
  .init({
    lng: initialLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'gamedata'],
    resources: {
      en: { common: commonEn, gamedata },
      // The rules data (gamedata) stays in English whatever the interface language (story 6.2).
      fr: { common: commonFr satisfies typeof commonEn, gamedata },
    },
    interpolation: { escapeValue: false },
    saveMissing: true,
    missingKeyHandler: (_lngs: readonly string[], ns: string, key: string) => {
      if (import.meta.env.DEV) {
        logger.warn(`Missing translation key: ${ns}:${key}`);
      } else {
        logger.error(`Missing translation key: ${ns}:${key}`);
      }
    },
  })
  .then(() => {
    document.documentElement.lang = i18n.language;
    i18n.on('languageChanged', (language) => {
      document.documentElement.lang = language;
    });
  })
  .catch((err: unknown) => {
    logger.error('i18n initialization failed:', err);
    throw err;
  });

export default i18n;
