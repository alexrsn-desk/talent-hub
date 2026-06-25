import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCEWHALE_BASE = 'https://api.sourcewhale.com/public/v1';

function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

function normalizeList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['data', 'contacts', 'results', 'items']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function buildName(c: any): string {
  const full = pick<string>(c, ['name', 'full_name', 'fullName']);
  if (full) return String(full).trim();
  const first = pick<string>(c, ['first_name', 'firstName', 'firstname']);
  const last = pick<string>(c, ['last_name', 'lastName', 'lastname']);
  return [first, last].filter(Boolean).join(' ').trim();
}

function normName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function fetchSourceWhale(apiKey: string, qs: URLSearchParams) {
  const upstream = await fetch(`${SOURCEWHALE_BASE}/contacts?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const text = await upstream.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { ok: upstream.ok, status: upstream.status, payload };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('SOURCEWHALE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'SOURCEWHALE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve current user from JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? (req.method === 'POST' ? 'import' : 'list');

    const qs = new URLSearchParams();
    qs.set('limit', String(Math.min(Number(url.searchParams.get('limit') ?? '100'), 200)));
    const cursor = url.searchParams.get('cursor');
    const search = url.searchParams.get('search');
    if (cursor) qs.set('cursor', cursor);
    if (search) qs.set('search', search);

    const { ok, status, payload } = await fetchSourceWhale(apiKey, qs);
    if (!ok) {
      console.error('SourceWhale error', status, JSON.stringify(payload).slice(0, 300));
      return new Response(JSON.stringify({ error: 'Upstream error', status, details: payload }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list') {
      return new Response(JSON.stringify(payload), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // action === 'import' — upsert into candidates
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const contacts = normalizeList(payload);
    let inserted = 0, updated = 0, skipped = 0;
    const results: any[] = [];

    for (const c of contacts) {
      const name = buildName(c);
      const email = pick<string>(c, ['email', 'email_address', 'work_email', 'personal_email']);
      if (!name && !email) { skipped++; continue; }

      const job_title = pick<string>(c, ['job_title', 'current_job_title', 'title', 'position']);
      const current_employer = pick<string>(c, ['company', 'company_name', 'current_employer', 'employer', 'organisation', 'organization']);
      const linkedin_url = pick<string>(c, ['linkedin_url', 'linkedin', 'linkedinUrl']);
      const phone = pick<string>(c, ['phone', 'phone_number', 'mobile']);
      const location = pick<string>(c, ['location', 'city', 'country']);

      let existing: any = null;
      if (email) {
        const { data } = await admin.from('candidates')
          .select('id,name,email')
          .eq('owner_user_id', userId)
          .ilike('email', email)
          .limit(50);
        existing = (data ?? []).find((r) => !name || normName(r.name) === normName(name)) ?? null;
      }

      if (existing) {
        const patch: any = { source: 'Inbound' };
        if (job_title) patch.job_title = job_title;
        if (current_employer) patch.current_employer = current_employer;
        if (linkedin_url) patch.linkedin_url = linkedin_url;
        if (phone) patch.phone = phone;
        if (location) patch.location = location;
        const { error } = await admin.from('candidates').update(patch).eq('id', existing.id);
        if (error) { console.error('update error', error); skipped++; continue; }
        updated++;
        results.push({ id: existing.id, action: 'updated' });
      } else {
        const { data, error } = await admin.from('candidates').insert({
          owner_user_id: userId,
          name: name || (email as string),
          email: email ?? null,
          job_title: job_title ?? null,
          current_employer: current_employer ?? null,
          linkedin_url: linkedin_url ?? null,
          phone: phone ?? null,
          location: location ?? null,
          status: 'New',
          source: 'Inbound',
        }).select('id').single();
        if (error) { console.error('insert error', error); skipped++; continue; }
        inserted++;
        results.push({ id: data?.id, action: 'inserted' });
      }
    }

    return new Response(JSON.stringify({
      ok: true, total: contacts.length, inserted, updated, skipped, results,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('sourcewhale-contacts failure', err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
