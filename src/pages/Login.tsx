import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sword } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

export default function Login() {
  const { t } = useTranslation('common');
  const { session, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // usePageTitle needs the Layout outlet; the login page lives outside it.
  useEffect(() => {
    document.title = t('auth.signIn');
  }, [t]);

  const from = (location.state as { from?: string } | null)?.from;
  const destination = from && from !== '/login' ? from : '/';

  if (!isLoading && session) return <Navigate to={destination} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFailed(false);
    const ok = await signIn(pseudo, password);
    setSubmitting(false);
    if (ok) navigate(destination, { replace: true });
    else {
      setPassword('');
      setFailed(true);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6" noValidate>
        <div className="flex items-center gap-3">
          <Sword className="size-8 text-primary shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-primary">{t('auth.signIn')}</h1>
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-pseudo">{t('auth.pseudo')}</Label>
          <Input
            id="login-pseudo"
            name="pseudo"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            aria-invalid={failed}
            aria-describedby={failed ? 'login-error' : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">{t('auth.password')}</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={failed}
            aria-describedby={failed ? 'login-error' : undefined}
          />
        </div>

        {failed && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {t('auth.invalidCredentials')}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting || !pseudo || !password}>
          {submitting ? t('auth.signingIn') : t('auth.signInButton')}
        </Button>
      </form>
    </main>
  );
}
