import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SOURCEWHALE_BASE = 'https://api.sourcewhale.com/public/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SOURCEWHALE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'SOURCEWHALE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Require auth — never expose this endpoint anonymously
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
    const cursor = url.searchParams.get('cursor') ?? '';
    const search = url.searchParams.get('search') ?? '';

    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    if (search) qs.set('search', search);

    const upstream = await fetch(`${SOURCEWHALE_BASE}/contacts?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    const text = await upstream.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    if (!upstream.ok) {
      console.error('SourceWhale error', upstream.status, text.slice(0, 300));
      return new Response(
        JSON.stringify({ error: 'Upstream error', status: upstream.status, details: payload }),
        { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('sourcewhale-contacts failure', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
