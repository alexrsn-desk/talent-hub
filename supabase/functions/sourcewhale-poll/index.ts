// Scheduled Sourcewhale poller — runs every 15 min via pg_cron.
// Polls people/search and notes/search for changes since the last sync,
// writes activity_events. Uses a unique (source, external_id) index for
// idempotency so events already delivered via webhook are not duplicated.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCEWHALE_BASE = 'https://api.sourcewhale.app/public/v1';
const SOURCE = 'sourcewhale';

function pick<T = any>(o: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}
function normalizeList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['data', 'results', 'items', 'people', 'notes', 'contacts']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}
async function swFetch(apiKey: string, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${SOURCEWHALE_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let payload: any; try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

async function pollForOwner(admin: any, apiKey: string, userId: string) {
  const now = new Date().toISOString();
  const summary = { people: 0, notes: 0, inserted: 0, duplicates: 0 };

  for (const endpoint of ['people/search', 'notes/search']) {
    const { data: state } = await admin.from('integration_sync_state')
      .select('last_synced_at')
      .eq('owner_user_id', userId).eq('source', SOURCE).eq('endpoint', endpoint)
      .maybeSingle();
    const since = state?.last_synced_at ?? new Date(Date.now() - 1000 * 60 * 60).toISOString();

    const { ok, payload } = await swFetch(apiKey, `/${endpoint}`, {
      updated_since: since, limit: '200',
    });
    if (!ok) continue;

    const items = normalizeList(payload);
    if (endpoint === 'people/search') summary.people = items.length;
    else summary.notes = items.length;

    for (const item of items) {
      const email = pick<string>(item, ['email', 'email_address']);
      const externalId = pick<string>(item, ['id', 'contact_id', 'note_id']);
      const occurred = pick<string>(item, ['updated_at', 'created_at', 'timestamp']) ?? now;

      // resolve candidate
      let candidateId: string | null = null;
      if (email) {
        const { data } = await admin.from('candidates').select('id')
          .eq('owner_user_id', userId).ilike('email', email).limit(1);
        candidateId = data?.[0]?.id ?? null;
      }

      // classify
      let event_type: string;
      if (endpoint === 'notes/search') event_type = 'note_logged';
      else if (pick(item, ['replied_at', 'reply_at'])) event_type = 'replied';
      else if (pick(item, ['last_contacted_at', 'sent_at'])) event_type = 'contacted';
      else event_type = 'updated';

      // idempotency key shared with webhook shape: prefer poll-scoped so
      // webhook rows (webhook:<id>:<type>) are distinct from poll rows
      // (poll:<endpoint>:<id>:<type>). We still de-dupe polled rows on repeat.
      const key = externalId ? `poll:${endpoint}:${externalId}:${event_type}` : null;

      const { error } = await admin.from('activity_events').insert({
        owner_user_id: userId,
        candidate_id: candidateId,
        event_type,
        source: SOURCE,
        external_id: key,
        occurred_at: occurred,
        payload: item,
        processed_at: now,
      });
      if (!error) summary.inserted++;
      else if (error.code === '23505') summary.duplicates++;
    }

    await admin.from('integration_sync_state').upsert({
      owner_user_id: userId, source: SOURCE, endpoint, last_synced_at: now,
    }, { onConflict: 'owner_user_id,source,endpoint' });
  }

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // cron auth: shared secret in header
  const cronSecret = Deno.env.get('SOURCEWHALE_CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (cronSecret && provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const apiKey = Deno.env.get('SOURCEWHALE_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SOURCEWHALE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profiles } = await admin.from('recruiter_profiles').select('user_id');
  const owners = (profiles ?? []).map((p: any) => p.user_id).filter(Boolean);

  const runs: any[] = [];
  for (const owner of owners) {
    try {
      const r = await pollForOwner(admin, apiKey, owner);
      runs.push({ owner, ...r });
    } catch (e) {
      runs.push({ owner, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, runs }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
