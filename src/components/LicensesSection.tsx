import { useTranslation } from 'react-i18next';

/** Where the SRD 5.1 and its license are published (attribution required by CC-BY-4.0, docs/rules-as-data.md §7). */
export const SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

/**
 * Attribution of the SRD 5.1 content shipped with the app (the 2014 SRD layer of the rules, story 9.5). Shown in the
 * settings, in French and English.
 */
export function LicensesSection(): React.JSX.Element {
  const { t } = useTranslation('common');
  const links = [
    { label: t('settings.licenses.srdLink'), href: SRD_URL },
    { label: t('settings.licenses.licenseLink'), href: CC_BY_URL },
  ];
  return (
    <section className="space-y-3" aria-labelledby="licenses-title">
      <div>
        <h2 id="licenses-title" className="text-lg font-semibold">
          {t('settings.licenses.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.licenses.description')}</p>
      </div>
      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <h3 className="font-medium">{t('settings.licenses.srdTitle')}</h3>
        <p>{t('settings.licenses.srdNotice')}</p>
        <p className="text-muted-foreground">{t('settings.licenses.srdScope')}</p>
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.href} className="break-all">
              <span className="font-medium">{link.label}</span>
              {': '}
              <a href={link.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {link.href}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
