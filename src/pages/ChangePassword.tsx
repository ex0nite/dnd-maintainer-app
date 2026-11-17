import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useChangePassword, useProfile, type ChangePasswordResult } from '@/hooks/useProfile';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

/**
 * Standalone screen (no sidebar, no data fetch): it is the only page a player on a temporary password can reach
 * (RequireAuth), and any signed-in user can open it later to change their password.
 */
export default function ChangePassword() {
  const { t } = useTranslation('common');
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const { change, isPending } = useChangePassword();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<Exclude<ChangePasswordResult, 'ok'> | 'mismatch' | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = t('password.title');
  }, [t]);

  // Once the profile says the flag is down, a player who was forced here moves on.
  const forced = profile?.must_change_password === true;
  if (done && profile && !forced) return <Navigate to="/" replace />;

  const errorMessage = (e: Exclude<typeof error, null>): string => {
    switch (e) {
      case 'mismatch':
        return t('password.errors.mismatch');
      case 'too_short':
        return t('password.errors.tooShort', { count: MIN_PASSWORD_LENGTH });
      case 'same':
        return t('password.errors.same');
      case 'weak':
        return t('password.errors.weak');
      default:
        return t('password.errors.unavailable');
    }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError('mismatch');
      return;
    }
    const result = await change(password);
    setPassword('');
    setConfirmation('');
    if (result === 'ok') {
      setDone(true);
      navigate('/', { replace: true });
    } else {
      setError(result);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6"
        noValidate
      >
        <div className="flex items-center gap-3">
          <KeyRound className="size-8 text-primary shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-primary">{t('password.title')}</h1>
        </div>
        {forced && <p className="text-sm text-muted-foreground">{t('password.forced')}</p>}
        <p className="text-sm text-muted-foreground">{t('password.rule', { count: MIN_PASSWORD_LENGTH })}</p>

        <div className="space-y-2">
          <Label htmlFor="new-password">{t('password.new')}</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'password-error' : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t('password.confirm')}</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </div>

        {error && (
          <p id="password-error" role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending || !password || !confirmation}>
          {t('password.submit')}
        </Button>
        {forced && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </Button>
        )}
      </form>
    </main>
  );
}
