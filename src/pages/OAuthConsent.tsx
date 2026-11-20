import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Loader2, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { AuthorizationDetails, decideAuthorization, loadAuthorization } from '@/lib/oauth-consent';

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const id = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'approve' | 'deny' | 'switch' | null>(null);
  const [email, setEmail] = useState('');
  const [attempt, setAttempt] = useState(0);
  const deciding = useRef(false);

  useEffect(() => {
    let active = true;
    setError(null);
    setDetails(null);
    async function load() {
      try {
        if (!id.trim()) throw new Error('This connection request is missing. Start the connection again in Claude.');
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw new Error(sessionError.message);
        if (!data.session) {
          const next = window.location.pathname + window.location.search + window.location.hash;
          window.location.replace('/?next=' + encodeURIComponent(next));
          return;
        }
        setEmail(data.session.user.email ?? 'Your account');
        const result = await loadAuthorization(id);
        if (!active) return;
        if (result.redirect) { window.location.replace(result.redirect); return; }
        setDetails(result.details);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load this request. Please try again.');
      }
    }
    void load();
    return () => { active = false; };
  }, [id, attempt]);

  async function decide(approve: boolean) {
    if (deciding.current) return;
    deciding.current = true;
    setPending(approve ? 'approve' : 'deny');
    setError(null);
    try {
      const target = await decideAuthorization(id, approve);
      window.location.assign(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The connection could not be completed. Try again.');
      setPending(null);
      deciding.current = false;
    }
  }

  async function switchAccount() {
    if (deciding.current) return;
    deciding.current = true;
    setPending('switch');
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(signOutError.message);
      const next = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace('/?next=' + encodeURIComponent(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch accounts. Try again.');
      setPending(null);
      deciding.current = false;
    }
  }

  const name = details?.client?.name ?? details?.client?.client_name ?? 'this app';
  const scopes = [...new Set(details?.scopes ?? details?.scope?.split(/\s+/).filter(Boolean) ?? [])];
  const redirectUri = details?.redirect_uri ?? details?.client?.redirect_uri;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-foreground" />Desky</div>
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold !tracking-normal break-words">{details ? `Connect ${name} to Desky` : 'Connect to Desky'}</h1>
          {details && <p className="text-sm text-muted-foreground">This lets {name} use Desky as you.</p>}
        </header>
        {!details && !error && <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 motion-safe:animate-spin" />Checking your connection request…</div>}
        {details && <>
          <section aria-label="Signed-in account" className="flex flex-wrap items-center gap-3 border-y border-border py-4">
            <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Signed in as</p><p className="text-sm font-medium break-all">{email}</p></div>
            <Button variant="ghost" size="sm" disabled={pending !== null} onClick={switchAccount}>Switch account</Button>
          </section>
          <section aria-label="Requested access" className="space-y-4">
            <h2 className="text-sm font-semibold !tracking-normal">What you’re allowing</h2>
            <ul className="space-y-3 text-sm">
              {scopes.map(scope => <li key={scope} className="flex gap-3"><Check className="h-4 w-4 shrink-0 mt-0.5" /><span className="min-w-0 break-words">{scope === 'email' ? 'Share your email address' : scope === 'profile' ? 'Share your basic profile' : scope === 'openid' ? 'Confirm your identity' : `Additional permission requested: ${scope}`}</span></li>)}
              <li className="flex gap-3"><Check className="h-4 w-4 shrink-0 mt-0.5" /><span>Find, create and update candidates, jobs, clients, pipeline, notes and tasks.</span></li>
              <li className="flex gap-3"><Check className="h-4 w-4 shrink-0 mt-0.5" /><span>Prepare job launches, send emails and publish LinkedIn posts after you confirm the exact message.</span></li>
            </ul>
          </section>
          {redirectUri && <div className="text-xs text-muted-foreground space-y-1"><p>Return address provided by {name}</p><p className="break-all font-mono">{redirectUri}</p></div>}
          <div className="flex gap-3 border-t border-border pt-4 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0" /><p>Your agency permissions and Do Not Contact safeguards still apply. Only data your account can access is available.</p></div>
        </>}
        {error && <div role="alert" className="border-l-2 border-destructive pl-4 space-y-2"><p className="text-sm font-medium">{details ? 'The connection wasn’t completed' : 'Unable to open this request'}</p><p className="text-sm text-muted-foreground break-words">{error}</p></div>}
        {details ? <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button variant="outline" className="sm:flex-1" disabled={pending !== null} onClick={() => decide(false)}>{pending === 'deny' ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : null}Cancel connection</Button>
          <Button className="sm:flex-1" disabled={pending !== null} onClick={() => decide(true)}>{pending === 'approve' ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowRight className="h-4 w-4" />}{pending === 'approve' ? 'Connecting…' : 'Approve connection'}</Button>
        </div> : error && <div className="flex flex-wrap gap-3">{id && <Button variant="outline" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-4 w-4" />Try again</Button>}<Button variant="ghost" asChild><a href="/">Back to Desky</a></Button></div>}
      </div>
    </main>
  );
}