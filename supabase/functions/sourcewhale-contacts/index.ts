// SourceWhale integration on the confirmed-working Public API surface:
//   campaigns/list, projects/list, statistics/dashboard,
//   candidates/search, candidates/add, candidates/modify
// Host + auth: https://sourcewhale.app/public-api/v1 with an `api-key` header.
//
// There is no bulk listing/polling endpoint, so "sync" works by looking up our
// own candidates in SourceWhale one at a time (candidates/search by email, then
// LinkedIn URL) and enriching them, including campaign name via campaigns/list.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  addCandidate,
  candidateToSwPayload,
  dashboardStats,
  getApiKey,
  listCampaigns,
  listProjects,
  modifyCandidate,
  searchCandidates,
  swCandidateToPatch,
  isSwSubscriptionType,
  SW_SUBSCRIPTION_TYPES,
  subscribeZapier,
  unsubscribeZapier,
} from '../_shared/sourcewhale.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function campaignNameMap(apiKey: string) {
  const campaigns = await listCampaigns(apiKey);
  return {
    campaigns,
    map: new Map(campaigns.map((c) => [c.campaignId, c.campaignName])),
  };
}

/** Enrich our candidates for one owner from SourceWhale. */
async function enrichForOwner(
  admin: any,
  apiKey: string,
  userId: string,
  limit: number,
  names: Map<string, string>,
) {
  const { data: rows, error } = await admin
    .from('candidates')
    .select('id,first_name,last_name,name,email,linkedin_url,sourcewhale_candidate_id,sourcewhale_synced_at')
    .eq('owner_user_id', userId)
    .eq('gdpr_deleted', false)
    .or('email.not.is.null,linkedin_url.not.is.null')
    .order('sourcewhale_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return { ok: false, error: error.message, matched: 0, updated: 0, notFound: 0, scanned: 0 };

  let matched = 0, updated = 0, notFound = 0;

  for (const row of rows ?? []) {
    let found: any = null;

    const lookups: Array<[string, string]> = [];
    if (row.sourcewhale_candidate_id) lookups.push(['candidateId', row.sourcewhale_candidate_id]);
    if (row.email) lookups.push(['email', row.email]);
    if (row.linkedin_url) lookups.push(['linkedinUrl', String(row.linkedin_url).replace(/^https?:\/\//i, '')]);

    for (const [key, value] of lookups) {
      const res = await searchCandidates(apiKey, key, value);
      if (res.candidates.length) { found = res.candidates[0]; break; }
    }

    if (!found) {
      notFound++;
      await admin.from('candidates')
        .update({ sourcewhale_synced_at: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    matched++;
    const patch = swCandidateToPatch(found, names);
    // Never overwrite an existing name with a blank/partial one
    if (!patch.first_name) delete patch.first_name;
    if (!patch.last_name) delete patch.last_name;

    const { error: upErr } = await admin.from('candidates').update(patch).eq('id', row.id);
    if (!upErr) updated++;
  }

  return { ok: true, scanned: (rows ?? []).length, matched, updated, notFound };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = getApiKey();
    if (!apiKey) return json({ error: 'SOURCEWHALE_API_KEY not configured' }, 500);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? (req.method === 'POST' ? 'enrich' : 'overview');

    // ===== Scheduled mode: enrich every recruiter's desk =====
    if (action === 'cron') {
      const { map } = await campaignNameMap(apiKey);
      const { data: profiles } = await admin.from('recruiter_profiles').select('user_id');
      const owners = (profiles ?? []).map((p: any) => p.user_id).filter(Boolean);
      const summary: any[] = [];
      for (const owner of owners) {
        summary.push({ owner, ...(await enrichForOwner(admin, apiKey, owner, 100, map)) });
      }
      console.log('sourcewhale cron enrich', JSON.stringify({ owners: summary.length }));
      return json({ ok: true, ran: summary.length, summary });
    }

    // ===== Authenticated modes =====
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    switch (action) {
      case 'campaigns':
        return json({ campaigns: await listCampaigns(apiKey) });

      case 'projects':
        return json({ projects: await listProjects(apiKey) });

      case 'stats': {
        const today = new Date().toISOString().slice(0, 10);
        const from = url.searchParams.get('from') ??
          new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
        const to = url.searchParams.get('to') ?? today;
        const { ok, status, payload } = await dashboardStats(apiKey, from, to);
        return ok ? json({ from, to, stats: payload }) : json({ error: 'Upstream error', status }, status);
      }

      case 'overview': {
        const [{ campaigns }, projects] = await Promise.all([
          campaignNameMap(apiKey),
          listProjects(apiKey),
        ]);
        const { count: syncedCount } = await admin
          .from('candidates')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', userId)
          .not('sourcewhale_candidate_id', 'is', null);
        const { data: synced } = await admin
          .from('candidates')
          .select('id,name,email,job_title,current_employer,sourcewhale_campaign_name,sourcewhale_stage,sourcewhale_status,sourcewhale_last_contacted,sourcewhale_synced_at')
          .eq('owner_user_id', userId)
          .not('sourcewhale_candidate_id', 'is', null)
          .order('sourcewhale_last_contacted', { ascending: false, nullsFirst: false })
          .limit(500);
        return json({ campaigns, projects, syncedCount: syncedCount ?? 0, synced: synced ?? [] });
      }

      case 'search': {
        const key = url.searchParams.get('key') ?? 'email';
        const value = url.searchParams.get('value') ?? '';
        if (!value.trim()) return json({ error: 'value is required' }, 400);
        const { ok, status, candidates } = await searchCandidates(apiKey, key, value.trim());
        if (!ok) return json({ error: 'Upstream error', status }, status);
        const { map } = await campaignNameMap(apiKey);
        return json({
          candidates: candidates.map((c) => ({
            raw: c,
            campaignName: c?.campaignId ? map.get(c.campaignId) ?? null : null,
          })),
        });
      }

      case 'enrich': {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 300);
        const { map } = await campaignNameMap(apiKey);
        const result = await enrichForOwner(admin, apiKey, userId, limit, map);
        return json(result, result.ok ? 200 : 500);
      }

      // Push one of our candidates into SourceWhale (add, or modify if already linked)
      case 'push': {
        let body: any = {};
        try { body = await req.json(); } catch { /* ignore */ }
        const candidateId = body?.candidateId;
        const campaignId = body?.campaignId;
        if (!candidateId || typeof candidateId !== 'string') {
          return json({ error: 'candidateId is required' }, 400);
        }
        const { data: row, error } = await admin
          .from('candidates')
          .select('id,first_name,last_name,name,email,phone,job_title,current_employer,location,linkedin_url,do_not_contact,sourcewhale_candidate_id')
          .eq('id', candidateId)
          .eq('owner_user_id', userId)
          .maybeSingle();
        if (error || !row) return json({ error: 'Candidate not found' }, 404);
        if (row.do_not_contact) return json({ error: 'Candidate is marked do-not-contact' }, 409);

        const payload = candidateToSwPayload(row);
        if (campaignId) payload.campaignId = campaignId;

        const res = row.sourcewhale_candidate_id
          ? await modifyCandidate(apiKey, payload)
          : await addCandidate(apiKey, payload);
        if (!res.ok) return json({ error: 'Upstream error', status: res.status, details: res.payload }, res.status);

        const returned = (res.payload as any)?.candidate ?? (res.payload as any)?.candidates?.[0] ?? null;
        const newId = returned?.candidateId ?? (res.payload as any)?.candidateId ?? row.sourcewhale_candidate_id;
        if (newId) {
          await admin.from('candidates').update({
            sourcewhale_candidate_id: newId,
            sourcewhale_campaign_id: campaignId ?? undefined,
            sourcewhale_synced_at: new Date().toISOString(),
          }).eq('id', row.id);
        }
        return json({ ok: true, mode: row.sourcewhale_candidate_id ? 'modify' : 'add', result: res.payload });
      }

      // ===== Zapier/webhook subscriptions =====
      // Only candidateCreated + candidateUpdated are supported by SourceWhale.
      case 'subscriptions': {
        const { data } = await admin
          .from('sourcewhale_subscriptions')
          .select('subscription_type,subscription_id,target_url,created_at')
          .eq('owner_user_id', userId);
        return json({
          available: SW_SUBSCRIPTION_TYPES,
          targetUrl: `${supabaseUrl}/functions/v1/sourcewhale-webhook`,
          subscriptions: data ?? [],
        });
      }

      case 'subscribe': {
        let body: any = {};
        try { body = await req.json(); } catch { /* ignore */ }
        const subscriptionType = body?.subscriptionType;
        if (!isSwSubscriptionType(subscriptionType)) {
          return json({
            error: `subscriptionType must be one of: ${SW_SUBSCRIPTION_TYPES.join(', ')}`,
          }, 400);
        }
        const targetUrl = `${supabaseUrl}/functions/v1/sourcewhale-webhook`;

        // Replace any existing subscription for this type so we never leak hooks.
        const { data: existing } = await admin
          .from('sourcewhale_subscriptions')
          .select('subscription_id')
          .eq('owner_user_id', userId)
          .eq('subscription_type', subscriptionType)
          .maybeSingle();
        if (existing?.subscription_id) {
          await unsubscribeZapier(apiKey, existing.subscription_id);
        }

        const res = await subscribeZapier(apiKey, subscriptionType, targetUrl);
        const subscriptionId = (res.payload as any)?.id;
        if (!res.ok || !subscriptionId) {
          return json({ error: 'Upstream error', status: res.status, details: res.payload }, res.status || 502);
        }

        const { error: upErr } = await admin.from('sourcewhale_subscriptions').upsert({
          owner_user_id: userId,
          subscription_type: subscriptionType,
          subscription_id: subscriptionId,
          target_url: targetUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'owner_user_id,subscription_type' });
        if (upErr) return json({ error: upErr.message }, 500);

        return json({ ok: true, subscriptionType, subscriptionId, targetUrl });
      }

      case 'unsubscribe': {
        let body: any = {};
        try { body = await req.json(); } catch { /* ignore */ }
        const subscriptionType = body?.subscriptionType;
        if (!isSwSubscriptionType(subscriptionType)) {
          return json({
            error: `subscriptionType must be one of: ${SW_SUBSCRIPTION_TYPES.join(', ')}`,
          }, 400);
        }
        const { data: existing } = await admin
          .from('sourcewhale_subscriptions')
          .select('id,subscription_id')
          .eq('owner_user_id', userId)
          .eq('subscription_type', subscriptionType)
          .maybeSingle();
        if (!existing) return json({ ok: true, alreadyRemoved: true });

        const res = await unsubscribeZapier(apiKey, existing.subscription_id);
        await admin.from('sourcewhale_subscriptions').delete().eq('id', existing.id);
        return json({ ok: true, upstreamStatus: res.status });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('sourcewhale-contacts failure', err);
    return json({ error: (err as Error).message }, 500);
  }
});
