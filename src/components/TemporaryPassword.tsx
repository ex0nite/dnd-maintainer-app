import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TemporaryPasswordProps {
  title: string;
  password: string;
  onDone: () => void;
}

/** Shows a temporary password once (never in a live region: it must not be read aloud), with a copy button. */
export function TemporaryPassword({ title, password, onDone }: TemporaryPasswordProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The form or list is replaced by this panel: move focus here.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard can be refused (insecure context, permissions): the password stays selectable on screen.
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{t('players.created.once')}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all break-all rounded bg-muted px-3 py-2 font-mono text-base">{password}</code>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span className="ml-2">{copied ? t('players.created.copied') : t('players.created.copy')}</span>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('players.created.mustChange')}</p>
      <Button type="button" onClick={onDone}>
        {t('players.created.done')}
      </Button>
    </section>
  );
}
