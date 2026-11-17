import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useRole } from '@/hooks/usePermissions';
import { useAuthorNames } from '@/hooks/useCampaignNotes';
import {
  COMMENT_BODY_MAX,
  useAddComment,
  useDeleteComment,
  useSessionComments,
  useUpdateComment,
  type SessionComment,
} from '@/hooks/useRecaps';

/** Small form: one text area and a save button (new comment, or the edit of an existing one). */
function CommentForm({
  idPrefix,
  initial = '',
  label,
  pending,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  initial?: string;
  label: string;
  pending: boolean;
  onSave: (body: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('common');
  const [body, setBody] = useState(initial);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSave(body.trim());
      }}
    >
      <label htmlFor={`${idPrefix}-body`} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={`${idPrefix}-body`}
        autoFocus={!!onCancel}
        value={body}
        rows={3}
        maxLength={COMMENT_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('recaps.counter', { count: body.length, max: COMMENT_BODY_MAX })}
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
              {t('buttons.cancel')}
            </Button>
          )}
          <Button type="submit" className="min-h-11" pending={pending} disabled={!body.trim()}>
            {t('buttons.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The comments of a published recap. Members write and manage their own; the DM moderates every comment. The
 * database decides: the buttons only hide what would be refused. Text is plain, shown escaped.
 */
export function SessionComments({ sessionId, campaignId }: { sessionId: string; campaignId: string }) {
  const { t, i18n } = useTranslation('common');
  const { userId, isDm } = useRole();
  const { data: comments = [], isLoading, isError } = useSessionComments(sessionId);
  const { data: names = {} } = useAuthorNames(campaignId);
  const add = useAddComment(sessionId, campaignId);
  const update = useUpdateComment(sessionId);
  const remove = useDeleteComment(sessionId);
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [newKey, setNewKey] = useState(0);

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('recaps.commentsLoadError')}
      </p>
    );
  }

  return (
    <section aria-labelledby="comments-heading" className="space-y-3">
      <h2 id="comments-heading" className="text-lg font-semibold">
        {t('recaps.comments')}
      </h2>
      {comments.length === 0 && <p className="text-muted-foreground">{t('recaps.noComments')}</p>}
      <ul className="space-y-3">
        {comments.map((c: SessionComment) => {
          const canModify = isDm || (!!userId && c.author_id === userId);
          return (
            <li key={c.id} className="rounded-lg border border-border bg-card p-3">
              {editing === c.id ? (
                <CommentForm
                  idPrefix={`edit-${c.id}`}
                  label={t('recaps.editComment')}
                  initial={c.body}
                  pending={update.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(body) =>
                    update.mutate(
                      { id: c.id, body },
                      { onSuccess: () => setEditing(null), onError: () => toast.error(t('recaps.saveFailed')) }
                    )
                  }
                />
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-xs text-muted-foreground">
                      {t('recaps.commentBy', {
                        author: (c.author_id && names[c.author_id]) || t('recaps.unknownAuthor'),
                        date: new Date(c.created_at).toLocaleDateString(i18n.language),
                      })}
                    </p>
                    {canModify &&
                      (asking === c.id ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="destructive"
                            autoFocus
                            className="min-h-11"
                            pending={remove.isPending}
                            onClick={() =>
                              remove.mutate(c.id, {
                                onSuccess: () => setAsking(null),
                                onError: () => toast.error(t('recaps.deleteFailed')),
                              })
                            }
                          >
                            {t('recaps.confirmDelete')}
                          </Button>
                          <Button variant="outline" className="min-h-11" onClick={() => setAsking(null)}>
                            {t('buttons.cancel')}
                          </Button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            aria-label={t('buttons.edit')}
                            title={t('buttons.edit')}
                            onClick={() => setEditing(c.id)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            aria-label={t('buttons.delete')}
                            title={t('buttons.delete')}
                            onClick={() => setAsking(c.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      ))}
                  </div>
                  {/* Plain text: React escapes it, line breaks are kept. */}
                  <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{c.body}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <CommentForm
        key={newKey}
        idPrefix="new-comment"
        label={t('recaps.addComment')}
        pending={add.isPending}
        onSave={(body) =>
          add.mutate(body, {
            // A fresh form: the typed text is gone once the comment is saved.
            onSuccess: () => setNewKey((k) => k + 1),
            onError: () => toast.error(t('recaps.saveFailed')),
          })
        }
      />
    </section>
  );
}
