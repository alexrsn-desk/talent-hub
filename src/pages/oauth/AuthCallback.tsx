import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { oauthReturnPath } from '@/lib/oauth-return-path';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [next] = useState(() => oauthReturnPath(params.get('next') ?? sessionStorage.getItem('desky_auth_return')));
  const providerError = params.get('error_description') ?? params.get('error');
  useEffect(() => {
    if (!loading && user && !providerError) {
      sessionStorage.removeItem('desky_auth_return');
      window.location.replace(next);
    }
  }, [user, loading, next, providerError]);
  if (loading || (user && !providerError)) return <main className="min-h-screen flex items-center justify-center gap-3 bg-background text-sm" role="status"><Loader2 className="h-5 w-5 motion-safe:animate-spin" />Completing sign-in…</main>;
  return <main className="min-h-screen flex items-center justify-center bg-background p-6"><div className="w-full max-w-sm space-y-4"><h1 className="text-xl font-semibold !tracking-normal">Sign-in wasn’t completed</h1><p role="alert" className="text-sm text-muted-foreground break-words">{providerError ?? 'Please sign in again to continue your connection.'}</p><Button asChild><a href={'/?next=' + encodeURIComponent(next)}>Return to sign in</a></Button></div></main>;
}