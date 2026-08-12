// Temporary diagnostic: makes REAL calls to the SourceWhale public API using the
// stored SOURCEWHALE_API_KEY and reports status codes + truncated bodies.
// Never returns the key itself (only a masked fingerprint).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('SOURCEWHALE_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'SOURCEWHALE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const fingerprint = {
    length: key.length,
    endsWith: key.slice(-4),
    hasWhitespace: /\s/.test(key),
    looksLikeBearerPrefixed: /^bearer /i.test(key),
  };

  const today = new Date().toISOString().slice(0, 10);
  const attempts: Array<{ label: string; url: string; headers: Record<string, string> }> = [
    { label: 'projects/list', url: 'https://sourcewhale.app/public-api/v1/projects/list', headers: { 'api-key': key } },
    { label: 'campaigns/list', url: 'https://sourcewhale.app/public-api/v1/campaigns/list', headers: { 'api-key': key } },
    { label: 'statistics/dashboard', url: `https://sourcewhale.app/public-api/v1/statistics/dashboard?from=${today}&to=${today}`, headers: { 'api-key': key } },
    { label: 'candidates/search email', url: 'https://sourcewhale.app/public-api/v1/candidates/search?key=email&value=anokhis@gmail.com', headers: { 'api-key': key } },
  ];


  const results: any[] = [];

  // Zapier subscription surface probes (POST). We deliberately send a body with
  // the documented field names so validation errors reveal the real contract.
  const hookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sourcewhale-webhook`;
  const posts = [
    { label: 'zapier/subscribe (subscriptionType+targetUrl)', url: 'https://sourcewhale.app/public-api/v1/zapier/unsubscribe', body: { subscriptionId: '02ca849d-467f-48fd-849a-6cd7654ba7ee' } },
    { label: 'zapier/subscriptions list', url: 'https://sourcewhale.app/public-api/v1/zapier/subscriptions', body: null },
  ];
  for (const p of posts) {
    try {
      const res = await fetch(p.url, {
        method: p.body ? 'POST' : 'GET',
        headers: { 'api-key': key, Accept: 'application/json', ...(p.body ? { 'Content-Type': 'application/json' } : {}) },
        body: p.body ? JSON.stringify(p.body) : undefined,
      });
      results.push({ label: p.label, url: p.url, status: res.status, ok: res.ok, body: (await res.text()).slice(0, 2000) });
    } catch (e) {
      results.push({ label: p.label, url: p.url, status: 0, ok: false, body: `fetch error: ${(e as Error).message}` });
    }
  }

  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { headers: { ...a.headers, Accept: 'application/json' } });
      const body = (await res.text()).slice(0, 4000);
      results.push({ label: a.label, url: a.url, status: res.status, ok: res.ok, body });
    } catch (e) {
      results.push({ label: a.label, url: a.url, status: 0, ok: false, body: `fetch error: ${(e as Error).message}` });
    }
  }

  return new Response(JSON.stringify({ fingerprint, results }, null, 2), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
