import { useTranslation } from 'react-i18next';
import { useRuleSet } from '@/hooks/useRuleSet';
import type { RulesetId } from '@/lib/ruleset';
import { localizedName } from '@/lib/rules/display';
import type { RuleEntryInfo } from '@/lib/rules/types';

interface RulesLibraryStatusProps {
  readonly ruleset: RulesetId;
}

/**
 * What the DM's rules library changes for an edition (story 9.3): entries that replace a built-in rule, entries
 * waiting for review (not usable yet) and stored entries ignored because they fail validation. Read-only: entries are
 * written through the MCP (story 9.4). Every text is shown as plain text.
 */
export function RulesLibraryStatus({ ruleset }: RulesLibraryStatusProps) {
  const { t, i18n } = useTranslation('common');
  const { rules, status } = useRuleSet(ruleset);
  const language = i18n?.language ?? 'en';

  if (status === 'loading') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('campaign.rulesLibrary.loading')}
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('campaign.rulesLibrary.error')}
      </p>
    );
  }

  const library = [...rules.entries.values()].filter((e) => e.layer === 'library');
  const overrides = library.filter((e) => e.overrides);
  const total = library.length + rules.unverified.length + rules.invalid.length;

  const label = (e: RuleEntryInfo) =>
    t('campaign.rulesLibrary.entry', {
      name: localizedName(e.name, language),
      kind: t(`campaign.rulesLibrary.kinds.${e.kind}`),
    });

  return (
    <div className="space-y-2 text-sm" data-testid="rules-library-status">
      <p className="text-muted-foreground">{t('campaign.rulesLibrary.count', { count: total })}</p>
      {overrides.length > 0 && (
        <div>
          <p className="font-medium">{t('campaign.rulesLibrary.overrides')}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {overrides.map((e) => (
              <li key={`${e.kind}:${e.id}`} className="break-words">
                {label(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rules.unverified.length > 0 && (
        <div>
          <p className="font-medium">{t('campaign.rulesLibrary.unverified')}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {rules.unverified.map((e) => (
              <li key={`${e.kind}:${e.id}`} className="break-words">
                {label(e)} &mdash; {e.needsReview.join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rules.invalid.length > 0 && (
        <div>
          <p className="font-medium text-destructive">{t('campaign.rulesLibrary.invalid')}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {rules.invalid.map((e) => (
              <li key={`${e.kind}:${e.id}`} className="break-words">
                {t('campaign.rulesLibrary.invalidEntry', {
                  kind: e.kind,
                  id: e.id,
                  path: e.issues[0]?.path || '-',
                  message: e.issues[0]?.message ?? '',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
