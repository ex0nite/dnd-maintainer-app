import type { ResolvedCharacter } from '@/types/resolved';
import { useTranslation } from 'react-i18next';
import { useRuleName } from '@/hooks/useRuleSet';

export function FeaturesPanel({ features }: { features: ResolvedCharacter['features'] }) {
  const { t } = useTranslation('gamedata');
  const { t: tc } = useTranslation('common');
  const ruleName = useRuleName();

  return (
    <div className="sheet-panel">
      <h2 className="text-lg font-bold text-foreground mb-4">{tc('characterSheet.sections.featuresAndTraits')}</h2>
      <div className="space-y-3">
        {features.map((resolvedFeature, i) => (
          <div key={i} className="bg-muted/50 p-3 rounded border">
            <div className="font-semibold text-foreground text-sm mb-1">
              {resolvedFeature.feature.name ??
                t(`features.${resolvedFeature.feature.id}.name`, { defaultValue: resolvedFeature.feature.id })}
            </div>
            <p className="text-xs text-muted-foreground">
              {resolvedFeature.feature.description ??
                t(`features.${resolvedFeature.feature.id}.description`, { defaultValue: '' })}
            </p>
            {resolvedFeature.source && (
              <div className="text-xs text-muted-foreground/70 mt-1">
                {tc('characterSheet.fields.source', {
                  source:
                    resolvedFeature.source.origin === 'class'
                      ? ruleName('class', resolvedFeature.source.id)
                      : resolvedFeature.source.origin === 'subclass'
                        ? ruleName('subclass', resolvedFeature.source.id)
                        : resolvedFeature.source.origin === 'species'
                          ? ruleName('species', resolvedFeature.source.id)
                          : resolvedFeature.source.origin === 'background'
                            ? ruleName('background', resolvedFeature.source.id)
                            : resolvedFeature.source.origin === 'loot'
                              ? resolvedFeature.source.description
                              : resolvedFeature.source.origin === 'feat'
                                ? ruleName('feat', resolvedFeature.source.id)
                                : resolvedFeature.source.id,
                })}
              </div>
            )}
            {resolvedFeature.saveDC !== undefined && resolvedFeature.feature.saveDC && (
              <div className="text-xs font-semibold text-foreground mt-1">
                {tc('characterSheet.fields.saveDC', {
                  dc: resolvedFeature.saveDC,
                  ability: t(`abilities.${resolvedFeature.feature.saveDC.dcAbility}`),
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
