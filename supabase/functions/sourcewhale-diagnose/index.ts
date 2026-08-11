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
    // Correct per swagger: host sourcewhale.app/public-api, header `api-key`
    { label: 'swagger-correct: projects/list + api-key header', url: 'https://sourcewhale.app/public-api/v1/projects/list', headers: { 'api-key': key } },
    { label: 'swagger-correct: campaigns/list + api-key header', url: 'https://sourcewhale.app/public-api/v1/campaigns/list', headers: { 'api-key': key } },
    { label: 'swagger-correct: statistics/dashboard + api-key header', url: `https://sourcewhale.app/public-api/v1/statistics/dashboard?from=${today}&to=${today}`, headers: { 'api-key': key } },
    { label: 'swagger-correct: candidates/search (key=email) + api-key header', url: 'https://sourcewhale.app/public-api/v1/candidates/search?key=email&value=test@example.com', headers: { 'api-key': key } },
    // What our poller currently does (expected to fail)
    { label: 'current-poller: api.sourcewhale.app people/search + Bearer', url: 'https://api.sourcewhale.app/public/v1/people/search?limit=1', headers: { Authorization: `Bearer ${key}` } },
    { label: 'current-poller: api.sourcewhale.app notes/search + Bearer', url: 'https://api.sourcewhale.app/public/v1/notes/search?limit=1', headers: { Authorization: `Bearer ${key}` } },
    { label: 'current-fn: api.sourcewhale.app contacts + Bearer', url: 'https://api.sourcewhale.app/public/v1/contacts?limit=1', headers: { Authorization: `Bearer ${key}` } },
    // Auth-format probes on the correct host
    { label: 'probe: projects/list + Bearer header', url: 'https://sourcewhale.app/public-api/v1/projects/list', headers: { Authorization: `Bearer ${key}` } },
    { label: 'probe: projects/list + x-api-key header', url: 'https://sourcewhale.app/public-api/v1/projects/list', headers: { 'x-api-key': key } },
    // Non-existent paths on correct host (does people/notes search exist at all?)
    { label: 'probe: public-api/v1/people/search + api-key', url: 'https://sourcewhale.app/public-api/v1/people/search?limit=1', headers: { 'api-key': key } },
    { label: 'probe: public-api/v1/notes/search + api-key', url: 'https://sourcewhale.app/public-api/v1/notes/search?limit=1', headers: { 'api-key': key } },
  ];

  const results = [];
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
