import { collectGrantsByType } from '@/lib/resolver/helpers';
import { useActiveRuleSet } from '@/hooks/useRuleSet';
import type { ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { PendingChoice } from '@/types/resolved';
import type { GrantBundle } from '@/types/sources';
import { useTranslation } from 'react-i18next';
import { ChoicePicker } from './ChoicePicker';

interface LineagePickerProps {
  readonly race: string;
  readonly bundles: readonly GrantBundle[];
  readonly build: { choices: Record<ChoiceKey, ChoiceDecision> } | null;
  readonly makeChoice: (key: ChoiceKey, decision: ChoiceDecision) => void;
  readonly clearChoice: (key: ChoiceKey) => void;
}

export function LineagePicker({ race, bundles, build, makeChoice, clearChoice }: LineagePickerProps) {
  const { t: tc } = useTranslation('common');
  const rules = useActiveRuleSet();

  if (!rules.lineages.has(race)) return null;

  // Every lineage choice of the species: a 2014 species that has its own lineage (dragonborn ancestry) and a
  // subspecies adds a second one (story 9.7).
  const lineageGrantTags = collectGrantsByType(bundles, 'lineage-choice').filter(
    (tg) => tg.source.origin === 'species'
  );
  if (lineageGrantTags.length === 0) {
    return <p className="text-sm text-muted-foreground">{tc('characterBuilder.hints.loadingLineage')}</p>;
  }

  return (
    <div className="mt-2 space-y-4">
      {lineageGrantTags.map((lineageTag) => {
        const lineageChoice: PendingChoice & { type: 'lineage-choice' } = {
          type: 'lineage-choice',
          choiceKey: lineageTag.grant.key,
          source: lineageTag.source,
          speciesId: race,
          from: lineageTag.grant.from,
        };
        const decision = build?.choices[lineageTag.grant.key];
        return (
          <ChoicePicker
            key={lineageTag.grant.key}
            choice={lineageChoice}
            currentDecision={decision as ChoiceDecision | undefined}
            onDecide={(key, d) => makeChoice(key, d)}
            onClear={(key) => clearChoice(key)}
          />
        );
      })}
    </div>
  );
}
