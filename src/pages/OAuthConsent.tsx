import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
type Details = {client?: {name?:string;client_name?:string;redirect_uri?:string}; redirect_uri?:string; scope?:string; scopes?:string[]; redirect_url?:string;redirect_to?:string};
type Response = {data:Details|null;error:{message:string}|null};
type OAuthAPI = {getAuthorizationDetails:(id:string)=>Promise<Response>;approveAuthorization:(id:string)=>Promise<Response>;denyAuthorization:(id:string)=>Promise<Response>};
const api = () => (supabase.auth as unknown as {oauth:OAuthAPI}).oauth;
export default function OAuthConsent() {
  const [params] = useSearchParams(); const id = params.get('authorization_id') ?? '';
  const [details,setDetails] = useState<Details|null>(null); const [error,setError] = useState<string|null>(null); const [busy,setBusy] = useState(false); const [email,setEmail] = useState('');
  useEffect(()=>{let active=true;setError(null);setDetails(null);
    (async()=>{try {
      if(!id) throw new Error('This connection request is missing or expired. Start the connection again in Claude.');
      const {data,error:sessionError}=await supabase.auth.getSession(); if(sessionError) throw sessionError;
      if(!data.session) { const next=window.location.pathname+window.location.search+window.location.hash; window.location.href='/?next='+encodeURIComponent(next); return; }
      if(active) setEmail(data.session.user.email ?? 'Your account');
      const response=await api().getAuthorizationDetails(id); if(!active) return; if(response.error) throw response.error;
      const target=response.data?.redirect_url ?? response.data?.redirect_to; if(target && !response.data?.client) {window.location.href=target;return;}
      if(!response.data?.client) throw new Error('This connection request is no longer available. Start again in Claude.');
      setDetails(response.data);
    }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load the connection request. Please start again.');}})();
    return()=>{active=false;};
  },[id]);
  async function decide(approve:boolean){setBusy(true);setError(null);try {const response=approve?await api().approveAuthorization(id):await api().denyAuthorization(id);if(response.error)throw new Error(response.error.message);const target=response.data?.redirect_url ?? response.data?.redirect_to;if(!target)throw new Error('No return address was provided. Start the connection again.');window.location.href=target;}catch(e){setError(e instanceof Error?e.message:'The connection could not be completed. Try again.');setBusy(false);}}
  const name=details?.client?.name ?? details?.client?.client_name ?? 'this app';
  const scopes=details?.scopes ?? details?.scope?.split(' ').filter(Boolean) ?? [];
  return <main className="min-h-screen flex items-center justify-center bg-background p-6"><div className="w-full max-w-md space-y-6">
    <h1 className="text-xl font-semibold">{details?`Connect ${name} to Desky`:'Connect to Desky'}</h1>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!details && !error && <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading connection request"/>}
    {details && <><div className="border-y border-border py-4 space-y-2 text-sm"><p>{email}</p><p className="text-muted-foreground break-all">{details.redirect_uri ?? details.client?.redirect_uri}</p></div>
      <p className="text-sm">This lets {name} use Desky as you.</p>
      <ul className="space-y-2 text-sm">{scopes.map(scope=><li key={scope}>{scope==='email'?'Share your email address':scope==='profile'?'Share your basic profile':scope==='openid'?'Confirm your identity':`Additional permission requested: ${scope}`}</li>)}<li>Read and update candidates, jobs, clients, pipeline, notes and tasks.</li><li>Send candidate emails and publish LinkedIn posts after your confirmation.</li></ul>
      <p className="text-sm text-muted-foreground">Your agency permissions and Do Not Contact safeguards still apply.</p>
      <div className="flex gap-3"><Button variant="outline" disabled={busy} onClick={()=>decide(false)}>Cancel connection</Button><Button disabled={busy} onClick={()=>decide(true)}>{busy?'Working…':'Approve'}</Button></div>
    </>}
  </div></main>;
}
