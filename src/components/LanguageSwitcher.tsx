import { useTranslation } from 'react-i18next';
import { isLanguage, LANGUAGES, rememberLanguage } from '@/lib/language';

/** French / English choice (story 6.2). The choice is remembered on the device. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation('common');
  const current = isLanguage(i18n.language) ? i18n.language : 'en';

  return (
    <div className={className}>
      <label htmlFor="language-select" className="mb-1 block text-xs font-medium text-muted-foreground">
        {t('language.label')}
      </label>
      <select
        id="language-select"
        value={current}
        onChange={(e) => {
          if (!isLanguage(e.target.value)) return;
          rememberLanguage(e.target.value);
          void i18n.changeLanguage(e.target.value);
        }}
        className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        {LANGUAGES.map((language) => (
          // The names stay in their own language: a player lost in the wrong one can still find theirs.
          <option key={language} value={language} lang={language}>
            {language === 'fr' ? 'Français' : 'English'}
          </option>
        ))}
      </select>
    </div>
  );
}
