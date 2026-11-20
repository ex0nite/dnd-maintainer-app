import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteEditor, type NoteDraft } from '@/components/NoteEditor';
import { useCampaignContext } from '@/hooks/useCampaignContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRole } from '@/hooks/usePermissions';
import {
  useAuthorNames,
  useCreatePersonalNote,
  useCreateSharedNote,
  useDeletePersonalNote,
  useDeleteSharedNote,
  usePersonalNotes,
  useSharedNotes,
  useUpdatePersonalNote,
  useUpdateSharedNote,
  type PersonalNote,
  type SharedNote,
} from '@/hooks/useCampaignNotes';

type Tab = 'shared' | 'personal';

/** Shared note id being edited, or 'new'. Personal likewise. */
type Editing = string | 'new' | null;

function NoteMeta({ author, date }: { author?: string; date: string }) {
  const { t, i18n } = useTranslation('common');
  const day = new Date(date).toLocaleDateString(i18n.language);
  return (
    <p className="text-xs text-muted-foreground">{author ? t('campaignNotes.byOn', { author, date: day }) : day}</p>
  );
}

/** Two-step delete: the first click asks, the second one confirms (no modal to trap focus on a phone). */
function DeleteButton({ pending, label, onConfirm }: { pending: boolean; label: string; onConfirm: () => void }) {
  const { t } = useTranslation('common');
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={label}
        title={label}
        onClick={() => setAsking(true)}
      >
        <Trash2 className="size-4" />
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button variant="destructive" className="min-h-11" pending={pending} onClick={onConfirm}>
        {t('campaignNotes.confirmDelete')}
      </Button>
      <Button variant="outline" className="min-h-11" onClick={() => setAsking(false)}>
        {t('buttons.cancel')}
      </Button>
    </span>
  );
}

function SharedNotes({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation('common');
  const { userId, isDm } = useRole();
  const { data: notes = [], isLoading, isError } = useSharedNotes(campaignId);
  const { data: names = {} } = useAuthorNames(campaignId);
  const create = useCreateSharedNote(campaignId);
  const update = useUpdateSharedNote(campaignId);
  const remove = useDeleteSharedNote(campaignId);
  const [editing, setEditing] = useState<Editing>(null);

  const save = (id: string | 'new', d: NoteDraft) => {
    const fields = { title: d.title, body: d.body, category: d.category, pinned: d.pinned };
    const done = { onSuccess: () => setEditing(null), onError: () => toast.error(t('campaignNotes.saveFailed')) };
    if (id === 'new') create.mutate(fields, done);
    else update.mutate({ id, ...fields }, done);
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('campaignNotes.loadError')}
      </p>
    );

  return (
    <div className="space-y-3">
      {editing === 'new' ? (
        <NoteEditor
          idPrefix="new-shared"
          shared
          pending={create.isPending}
          onSave={(d) => save('new', d)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('campaignNotes.newShared')}
        </Button>
      )}
      {notes.length === 0 && <p className="text-muted-foreground">{t('campaignNotes.noShared')}</p>}
      <ul className="space-y-3">
        {notes.map((note: SharedNote) => {
          // The database decides (author or DM); the interface only hides what would be refused.
          const canModify = isDm || (!!userId && note.author_id === userId);
          return (
            <li key={note.id}>
              {editing === note.id ? (
                <NoteEditor
                  idPrefix={`edit-${note.id}`}
                  shared
                  initial={note}
                  pending={update.isPending}
                  onSave={(d) => save(note.id, d)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <article className="space-y-2 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <h3 className="flex items-center gap-2 break-words font-semibold">
                        {note.pinned && (
                          <Pin className="size-4 shrink-0 text-primary" aria-label={t('campaignNotes.pinned')} />
                        )}
                        <span className="min-w-0 [overflow-wrap:anywhere]">{note.title}</span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{t(`notes.categories.${note.category}`)}</Badge>
                        <NoteMeta
                          author={(note.author_id && names[note.author_id]) || t('campaignNotes.unknownAuthor')}
                          date={note.updated_at}
                        />
                      </div>
                    </div>
                    {canModify && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={t('buttons.edit')}
                          title={t('buttons.edit')}
                          onClick={() => setEditing(note.id)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          label={t('buttons.delete')}
                          pending={remove.isPending}
                          onConfirm={() =>
                            remove.mutate(note.id, { onError: () => toast.error(t('campaignNotes.deleteFailed')) })
                          }
                        />
                      </div>
                    )}
                  </div>
                  {/* Plain text: React escapes it, newlines are kept. */}
                  <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
                </article>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A player's own notebook (editable) or, for the DM, every player's notebook (read-only, D-10). */
function PersonalNotes({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation('common');
  const { isDm } = useRole();
  const { data: notes = [], isLoading, isError } = usePersonalNotes(campaignId);
  const { data: names = {} } = useAuthorNames(campaignId);
  const create = useCreatePersonalNote(campaignId);
  const update = useUpdatePersonalNote(campaignId);
  const remove = useDeletePersonalNote(campaignId);
  const [editing, setEditing] = useState<Editing>(null);

  const save = (id: string | 'new', d: NoteDraft) => {
    const done = { onSuccess: () => setEditing(null), onError: () => toast.error(t('campaignNotes.saveFailed')) };
    if (id === 'new') create.mutate({ title: d.title, body: d.body }, done);
    else update.mutate({ id, title: d.title, body: d.body }, done);
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('campaignNotes.loadError')}
      </p>
    );

  return (
    <div className="space-y-3">
      {isDm && <p className="text-sm text-muted-foreground">{t('campaignNotes.dmReadOnly')}</p>}
      {!isDm &&
        (editing === 'new' ? (
          <NoteEditor
            idPrefix="new-personal"
            shared={false}
            pending={create.isPending}
            onSave={(d) => save('new', d)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('campaignNotes.newPersonal')}
          </Button>
        ))}
      {notes.length === 0 && (
        <p className="text-muted-foreground">{t(isDm ? 'campaignNotes.noPlayerNotes' : 'campaignNotes.noPersonal')}</p>
      )}
      <ul className="space-y-3">
        {notes.map((note: PersonalNote) => (
          <li key={note.id}>
            {editing === note.id ? (
              <NoteEditor
                idPrefix={`edit-${note.id}`}
                shared={false}
                initial={note}
                pending={update.isPending}
                onSave={(d) => save(note.id, d)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <article className="space-y-2 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                      {note.title || t('campaignNotes.untitled')}
                    </h3>
                    <NoteMeta
                      author={isDm ? (names[note.author_id] ?? t('campaignNotes.unknownAuthor')) : undefined}
                      date={note.updated_at}
                    />
                  </div>
                  {/* The DM reads, never edits: no command at all (the database refuses it too). */}
                  {!isDm && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={t('buttons.edit')}
                        title={t('buttons.edit')}
                        onClick={() => setEditing(note.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteButton
                        label={t('buttons.delete')}
                        pending={remove.isPending}
                        onConfirm={() =>
                          remove.mutate(note.id, { onError: () => toast.error(t('campaignNotes.deleteFailed')) })
                        }
                      />
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
              </article>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CampaignNotes() {
  const { t } = useTranslation('common');
  const { campaignId } = useCampaignContext();
  const { isDm } = useRole();
  const [tab, setTab] = useState<Tab>('shared');
  usePageTitle(t('campaignNotes.title'));

  if (!campaignId)
    return (
      <div className="page-container">
        <Skeleton className="h-8 w-64" />
      </div>
    );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'shared', label: t('campaignNotes.tabShared') },
    { id: 'personal', label: t(isDm ? 'campaignNotes.tabPlayers' : 'campaignNotes.tabPersonal') },
  ];

  return (
    <div className="page-container max-w-3xl space-y-4">
      <h1 className="page-title">{t('campaignNotes.title')}</h1>
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls="notes-panel"
            onClick={() => setTab(id)}
            className={`min-h-11 border-b-2 px-3 text-sm font-medium ${tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="notes-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'shared' ? <SharedNotes campaignId={campaignId} /> : <PersonalNotes campaignId={campaignId} />}
      </div>
    </div>
  );
}
