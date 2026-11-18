import { Button } from '@/components/ui/button';
import { RULESET_IDS, type RulesetId } from '@/lib/ruleset';
import { useTranslation } from 'react-i18next';

interface RulesetPickerProps {
  value: RulesetId;
  onChange: (value: RulesetId) => void;
  disabled?: boolean;
  /** Prefix of the element ids, so two pickers can live on one page. */
  idPrefix: string;
  /** Id of the element that labels the group. */
  labelledBy: string;
  /** Id of the element that explains why the choice is frozen, or what to expect from it. */
  describedBy?: string;
}

/** Two-way choice between the rules editions (story 9.1). */
export function RulesetPicker({
  value,
  onChange,
  disabled = false,
  idPrefix,
  labelledBy,
  describedBy,
}: RulesetPickerProps) {
  const { t } = useTranslation('common');
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {RULESET_IDS.map((id) => (
        <Button
          key={id}
          id={`${idPrefix}-${id}`}
          type="button"
          size="sm"
          variant={value === id ? 'default' : 'outline'}
          aria-pressed={value === id}
          disabled={disabled}
          onClick={() => {
            if (value !== id) onChange(id);
          }}
        >
          {t(`campaign.ruleset.options.${id}`)}
        </Button>
      ))}
    </div>
  );
}
