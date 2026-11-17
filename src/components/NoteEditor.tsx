import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  SHARED_NOTE_CATEGORIES,
  type SharedNoteCategory,
} from '@/hooks/useCampaignNotes';

export interface NoteDraft {
  title: string;
  body: string;
  category: SharedNoteCategory;
  pinned: boolean;
}

/** Plain-text note form (title, body, and for shared notes a category and the pin). Text is shown escaped elsewhere. */
export function NoteEditor({
  idPrefix,
  initial,
  shared,
  pending,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  initial?: Partial<NoteDraft>;
  /** Shared notes have a mandatory title, a category and a pin; personal notes just a free title and text. */
  shared: boolean;
  pending: boolean;
  onSave: (draft: NoteDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState<NoteDraft>({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    category: initial?.category ?? 'general',
    pinned: initial?.pinned ?? false,
  });
  const titleMissing = shared && draft.title.trim() === '';

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titleMissing) onSave({ ...draft, title: draft.title.trim() });
      }}
    >
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium">
          {t('campaignNotes.titleLabel')}
        </label>
        <Input
          id={`${idPrefix}-title`}
          value={draft.title}
          maxLength={NOTE_TITLE_MAX}
          required={shared}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      {shared && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
              {t('campaignNotes.categoryLabel')}
            </label>
            <select
              id={`${idPrefix}-category`}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as SharedNoteCategory })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SHARED_NOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`notes.categories.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <label htmlFor={`${idPrefix}-pinned`} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              id={`${idPrefix}-pinned`}
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
              className="size-4"
            />
            {t('campaignNotes.pinLabel')}
          </label>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-body`} className="text-sm font-medium">
          {t('campaignNotes.bodyLabel')}
        </label>
        <Textarea
          id={`${idPrefix}-body`}
          value={draft.body}
          rows={6}
          maxLength={NOTE_BODY_MAX}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {t('campaignNotes.counter', { count: draft.body.length, max: NOTE_BODY_MAX })}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('buttons.cancel')}
        </Button>
        <Button type="submit" pending={pending} disabled={titleMissing}>
          {t('buttons.save')}
        </Button>
      </div>
    </form>
  );
}
