// Sourcewhale webhook receiver.
// Accepts candidateCreated / candidateUpdated events, upserts candidates,
// and writes a row to activity_events for auditing/replay.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCE = 'sourcewhale';

function pick<T = any>(o: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

function buildName(c: any): string {
  const full = pick<string>(c, ['name', 'full_name', 'fullName']);
  if (full) return String(full).trim();
  const first = pick<string>(c, ['first_name', 'firstName']);
  const last = pick<string>(c, ['last_name', 'lastName']);
  return [first, last].filter(Boolean).join(' ').trim();
}

async function verifySignature(secret: string, rawBody: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  // Accept "sha256=<hex>" or raw hex
  const provided = sig.startsWith('sha256=') ? sig.slice(7) : sig;
  if (provided.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const secret = Deno.env.get('SOURCEWHALE_WEBHOOK_SECRET');
  const rawBody = await req.text();

  if (secret) {
    const sig = req.headers.get('x-sourcewhale-signature')
             ?? req.headers.get('x-signature')
             ?? req.headers.get('x-hub-signature-256');
    const ok = await verifySignature(secret, rawBody, sig);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  let body: any;
  try { body = JSON.parse(rawBody); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Normalise: accept either a single event or { events: [...] }
  const events: any[] = Array.isArray(body?.events) ? body.events
                     : Array.isArray(body) ? body
                     : [body];

  const results: any[] = [];

  for (const ev of events) {
    const eventName = String(pick(ev, ['event', 'type', 'event_type']) ?? '').trim();
    const contact = ev.data ?? ev.candidate ?? ev.contact ?? ev.person ?? ev;
    const externalId = pick<string>(ev, ['id', 'event_id']) ?? pick<string>(contact, ['id', 'contact_id', 'candidate_id']);

    const email = pick<string>(contact, ['email', 'email_address', 'work_email', 'personal_email']);
    const name = buildName(contact);

    if (!email && !name) {
      results.push({ ok: false, reason: 'no identifier' });
      continue;
    }

    // Match to an owning recruiter: prefer explicit owner_email/owner_user_id in payload,
    // else fall back to the sole recruiter if only one exists.
    let ownerUserId: string | null = pick<string>(ev, ['owner_user_id']) ?? null;
    const ownerEmail = pick<string>(ev, ['owner_email', 'recruiter_email']);
    if (!ownerUserId && ownerEmail) {
      const { data } = await admin.from('recruiter_profiles')
        .select('user_id')
        .ilike('display_name', ownerEmail)
        .limit(1);
      ownerUserId = data?.[0]?.user_id ?? null;
    }
    if (!ownerUserId) {
      const { data } = await admin.from('recruiter_profiles').select('user_id').limit(2);
      if (data && data.length === 1) ownerUserId = data[0].user_id;
    }

    // Upsert candidate by email within this owner
    let candidateId: string | null = null;
    if (ownerUserId && email) {
      const { data: existing } = await admin.from('candidates')
        .select('id')
        .eq('owner_user_id', ownerUserId)
        .ilike('email', email)
        .limit(1);
      if (existing?.[0]) candidateId = existing[0].id;
    }

    const candidatePatch: any = {
      name: name || email,
      email: email ?? null,
      job_title: pick<string>(contact, ['job_title', 'title', 'position']) ?? null,
      current_employer: pick<string>(contact, ['company', 'company_name', 'current_employer', 'employer']) ?? null,
      linkedin_url: pick<string>(contact, ['linkedin_url', 'linkedin']) ?? null,
      phone: pick<string>(contact, ['phone', 'phone_number', 'mobile']) ?? null,
      location: pick<string>(contact, ['location', 'city', 'country']) ?? null,
    };

    if (candidateId) {
      await admin.from('candidates').update(candidatePatch).eq('id', candidateId);
    } else if (ownerUserId) {
      const { data: inserted } = await admin.from('candidates')
        .insert({
          owner_user_id: ownerUserId,
          status: 'New',
          source: 'Sourcewhale',
          ...candidatePatch,
        })
        .select('id').single();
      candidateId = inserted?.id ?? null;
    }

    // Map event name to activity_events.event_type
    const lower = eventName.toLowerCase();
    let mapped: string;
    if (lower.includes('create')) mapped = 'created';
    else if (lower.includes('reply') || lower.includes('replied')) mapped = 'replied';
    else if (lower.includes('note')) mapped = 'note_logged';
    else if (lower.includes('contact') || lower.includes('sent') || lower.includes('touch')) mapped = 'contacted';
    else if (lower.includes('stage')) mapped = 'stage_changed';
    else mapped = 'updated';

    // Idempotent insert using (source, external_id) unique index
    const { error: insErr } = await admin.from('activity_events').insert({
      owner_user_id: ownerUserId,
      candidate_id: candidateId,
      event_type: mapped,
      source: SOURCE,
      external_id: externalId ? `webhook:${externalId}:${mapped}` : null,
      occurred_at: pick<string>(ev, ['occurred_at', 'timestamp', 'created_at']) ?? new Date().toISOString(),
      payload: ev,
      processed_at: new Date().toISOString(),
    });

    results.push({
      ok: !insErr || insErr.code === '23505', // duplicate is fine
      candidate_id: candidateId,
      event_type: mapped,
      duplicate: insErr?.code === '23505',
    });
  }

  return new Response(JSON.stringify({ ok: true, received: events.length, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
