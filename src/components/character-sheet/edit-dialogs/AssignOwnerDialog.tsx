import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePlayers } from '@/hooks/useAccounts';

/**
 * The DM gives a character to a player of its campaign, or takes it back (story 3.9). The change is immediate: the
 * former owner loses the write access at once, the new one gets it (the policies read the owner on every request).
 */
export function AssignOwnerDialog({
  campaignId,
  currentOwnerId,
  saving,
  onSave,
  onClose,
}: {
  campaignId: string;
  currentOwnerId: string | null | undefined;
  saving: boolean;
  onSave: (ownerId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const { data: players = [], isError } = usePlayers();
  const candidates = players.filter((p) => p.status !== 'archived' && p.campaignIds.includes(campaignId));
  // The current owner may be archived or no longer in the campaign: keep them as a (disabled) choice so "nobody" can
  // still be picked and saved.
  const currentIsListed = !currentOwnerId || candidates.some((p) => p.userId === currentOwnerId);
  const [value, setValue] = useState(currentOwnerId ?? '');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('characterSheet.assign.title')}</DialogTitle>
          <DialogDescription>{t('characterSheet.assign.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="assign-owner">{t('characterSheet.assign.label')}</Label>
          <select
            id="assign-owner"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('characterSheet.assign.nobody')}</option>
            {!currentIsListed && (
              <option value={currentOwnerId ?? ''} disabled>
                {t('characterSheet.assign.currentOwner')}
              </option>
            )}
            {candidates.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.pseudo}
              </option>
            ))}
          </select>
          {isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('characterSheet.assign.loadError')}
            </p>
          )}
          {!isError && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('characterSheet.assign.noPlayer')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('buttons.cancel')}
          </Button>
          <Button onClick={() => onSave(value || null)} pending={saving} disabled={value === (currentOwnerId ?? '')}>
            {t('characterSheet.assign.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
