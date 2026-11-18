import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveRuleSet, useRuleName, useRuleSummary } from '@/hooks/useRuleSet';
import { isSubclassId } from '@/lib/sources/subclasses';
import type { PendingChoice } from '@/types/resolved';
import type { ChoiceKey, ChoiceDecision } from '@/types/choices';
import { useTranslation } from 'react-i18next';
import type { SubclassSource } from '@/types/sources';

interface SubclassPickerProps {
  readonly choice: Extract<PendingChoice, { type: 'subclass' }>;
  readonly currentDecision?: ChoiceDecision | undefined;
  readonly onDecide: (choiceKey: ChoiceKey, subclassId: string) => void;
  readonly onClear?: (key: ChoiceKey) => void;
  /** When true, calls onDecide immediately on selection and hides the confirm button. */
  readonly autoCommit?: boolean;
  /**
   * Optional filtered subclass map from useGameData. Only subclasses present in
   * this map are shown, PLUS the currently selected subclass (no-data-loss union).
   * Falls back to every subclass of the active rule set when undefined.
   */
  readonly allowedSubclasses?: Readonly<Partial<Record<string, SubclassSource>>>;
}

export function SubclassPicker({
  choice,
  currentDecision,
  onDecide,
  onClear,
  autoCommit,
  allowedSubclasses,
}: SubclassPickerProps) {
  const { t } = useTranslation('gamedata');
  const { t: tc } = useTranslation('common');
  const rules = useActiveRuleSet();
  const ruleName = useRuleName();
  const ruleSummary = useRuleSummary();

  const existingSubclassId: string | null =
    currentDecision?.type === 'subclass' && rules.subclasses.has(currentDecision.subclassId)
      ? currentDecision.subclassId
      : null;
  const [selected, setSelected] = useState<string | null>(existingSubclassId);
  const hasExistingDecision = existingSubclassId !== null;

  // Ids visible in the picker: the allowed map when given, else every subclass of the rule set.
  const isOffered = (id: string): boolean => (allowedSubclasses ? id in allowedSubclasses : rules.subclasses.has(id));

  // Filter to ids that are offered (visibility) OR are the currently selected id
  // (no-data-loss: keep the selection visible even when its book is disabled).
  // Data always comes from the full rule set so features are never undefined.
  const subclasses = (rules.subclassesByClass.get(choice.classId) ?? [])
    .filter((id) => isOffered(id) || id === existingSubclassId)
    .flatMap((id) => {
      const source = rules.subclasses.get(id);
      return source ? [{ id, ...source }] : [];
    })
    .sort((a, b) => ruleName('subclass', a.id).localeCompare(ruleName('subclass', b.id)));
  const className = t(`classes.${choice.classId}`, { defaultValue: choice.classId });

  const handleSelect = (id: string) => {
    setSelected(id);
    if (autoCommit) {
      onDecide(choice.choiceKey, id);
    }
  };

  const handleConfirm = () => {
    if (!selected) return;
    onDecide(choice.choiceKey, selected);
  };

  const handleClear = () => {
    setSelected(null);
    onClear?.(choice.choiceKey);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tc('characterSheet.subclassPicker.chooseSubclass')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {tc('characterSheet.subclassPicker.subclassDescription', { className })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {subclasses.length === 0 && (
          <p className="text-sm text-muted-foreground">{tc('characterSheet.subclassPicker.noSubclassesAvailable')}</p>
        )}
        {subclasses.map((sc) => {
          const isSelected = selected === sc.id;
          const isDisabledBook = sc.id === existingSubclassId && !isOffered(sc.id);

          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleSelect(sc.id)}
              className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
              }`}
            >
              <div className={`flex items-center gap-2 text-sm text-foreground ${isSelected ? 'font-semibold' : ''}`}>
                {ruleName('subclass', sc.id)}
                {isDisabledBook && (
                  <Badge variant="destructive" className="text-xs">
                    {tc('characterBuilder.hints.disabledSourceBook')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {ruleSummary('subclass', sc.id) ?? (isSubclassId(sc.id) ? t(`subclasses.${sc.id}.description`) : '')}
              </p>
              {isSelected && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {sc.features.flatMap((f) =>
                    f.grants
                      .filter((g): g is Extract<typeof g, { type: 'feature' }> => g.type === 'feature')
                      .map((g) => (
                        <li key={g.feature.id}>
                          <span className="font-semibold">
                            {g.feature.name ?? t(`features.${g.feature.id}.name`, { defaultValue: g.feature.id })}
                          </span>
                          {` ${tc('characterSheet.classLevelLabel', { level: f.classLevel })} `}
                          &mdash;{' '}
                          {g.feature.description ?? t(`features.${g.feature.id}.description`, { defaultValue: '' })}
                        </li>
                      ))
                  )}
                </ul>
              )}
            </button>
          );
        })}

        {!autoCommit && (
          <div className="flex gap-2 mt-4">
            {hasExistingDecision && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="flex-1">
                {tc('buttons.clearSelection')}
              </Button>
            )}
            <Button className="flex-1" disabled={!selected} onClick={handleConfirm}>
              {tc('buttons.confirm')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
