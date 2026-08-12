// Shared SourceWhale Public API client.
//
// Verified against https://sourcewhale.app/public-api/swagger:
//   host   : https://sourcewhale.app/public-api/v1
//   auth   : `api-key: <key>` request header (NOT Authorization: Bearer)
//   surface: campaigns/list, projects/list, statistics/dashboard,
//            candidates/search (key+value), candidates/add, candidates/modify
//
// There is no bulk change-polling endpoint (no people/search, no notes/search),
// so activity has to arrive via their Zapier/webhook subscribe surface.

export const SOURCEWHALE_BASE = 'https://sourcewhale.app/public-api/v1';

export type SwResult<T = any> = {
  ok: boolean;
  status: number;
  payload: T;
};

export function getApiKey(): string | null {
  const key = Deno.env.get('SOURCEWHALE_API_KEY');
  return key && key.trim() ? key.trim() : null;
}

async function swRequest<T = any>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<SwResult<T>> {
  const qs = opts.params ? `?${new URLSearchParams(opts.params).toString()}` : '';
  const res = await fetch(`${SOURCEWHALE_BASE}${path}${qs}`, {
    method,
    headers: {
      'api-key': apiKey,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let payload: any;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text.slice(0, 500) }; }
  if (!res.ok) console.error('sourcewhale api error', path, res.status, JSON.stringify(payload).slice(0, 300));
  return { ok: res.ok, status: res.status, payload };
}

export const swGet = <T = any>(apiKey: string, path: string, params?: Record<string, string>) =>
  swRequest<T>(apiKey, 'GET', path, { params });

export const swPost = <T = any>(apiKey: string, path: string, body: unknown) =>
  swRequest<T>(apiKey, 'POST', path, { body });

// ---------- Endpoint wrappers ----------

export type SwCampaign = { campaignId: string; campaignName: string };
export type SwProject = { projectId: string; projectName: string };

export async function listCampaigns(apiKey: string): Promise<SwCampaign[]> {
  const { ok, payload } = await swGet<{ campaigns?: SwCampaign[] }>(apiKey, '/campaigns/list');
  return ok ? (payload?.campaigns ?? []) : [];
}

export async function listProjects(apiKey: string): Promise<SwProject[]> {
  const { ok, payload } = await swGet<{ projects?: SwProject[] }>(apiKey, '/projects/list');
  return ok ? (payload?.projects ?? []) : [];
}

export function dashboardStats(apiKey: string, from: string, to: string) {
  return swGet(apiKey, '/statistics/dashboard', { from, to });
}

/** candidates/search takes a single field lookup, e.g. key=email&value=a@b.com */
export async function searchCandidates(
  apiKey: string,
  key: 'email' | 'linkedinUrl' | 'candidateId' | 'phone' | string,
  value: string,
): Promise<{ ok: boolean; status: number; candidates: any[] }> {
  const { ok, status, payload } = await swGet<{ candidates?: any[] }>(
    apiKey, '/candidates/search', { key, value },
  );
  return { ok, status, candidates: ok ? (payload?.candidates ?? []) : [] };
}

export const addCandidate = (apiKey: string, body: unknown) => swPost(apiKey, '/candidates/add', body);
export const modifyCandidate = (apiKey: string, body: unknown) => swPost(apiKey, '/candidates/modify', body);

// ---------- Mapping helpers ----------

function first<T>(v: T[] | undefined | null): T | undefined {
  return Array.isArray(v) && v.length ? v[0] : undefined;
}

/** SourceWhale returns unix seconds for timestamps. */
export function swTime(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  const ms = v > 1e12 ? v : v * 1000;
  return new Date(ms).toISOString();
}

export function splitName(full: string | undefined | null): { first_name: string; last_name: string } {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

export type CandidatePatch = Record<string, any>;

/**
 * Map a SourceWhale candidate object onto our `candidates` columns.
 * Only non-empty values are included so we never blank out CRM data.
 */
export function swCandidateToPatch(
  c: any,
  campaignNames: Map<string, string>,
): CandidatePatch {
  const patch: CandidatePatch = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') patch[k] = v;
  };

  const firstName = c?.firstName ?? splitName(c?.name ?? c?.unparsedName).first_name;
  const lastName = c?.lastName ?? splitName(c?.name ?? c?.unparsedName).last_name;
  set('first_name', firstName);
  set('last_name', lastName);
  set('email', first<string>(c?.emails) ?? c?.lastSentTo);
  set('phone', first<string>(c?.phones));
  set('job_title', c?.role ?? first<any>(c?.experience)?.role);
  set('current_employer', c?.company ?? c?.unparsedCompany);
  set('location', c?.location ?? [c?.city, c?.state, c?.country].filter(Boolean).join(', '));
  set('linkedin_url', c?.linkedinUrl ? normalizeUrl(c.linkedinUrl) : undefined);

  // SourceWhale attribution
  set('sourcewhale_candidate_id', c?.candidateId);
  set('sourcewhale_campaign_id', c?.campaignId);
  set('sourcewhale_campaign_name', c?.campaignId ? campaignNames.get(c.campaignId) : undefined);
  set('sourcewhale_stage', c?.stage);
  set('sourcewhale_status', c?.status);
  set('sourcewhale_last_contacted', swTime(c?.lastContacted));
  patch.sourcewhale_synced_at = new Date().toISOString();

  return patch;
}

export function normalizeUrl(u: string): string {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
}

/** Build the payload for candidates/add | candidates/modify from one of our rows. */
export function candidateToSwPayload(row: any): Record<string, any> {
  const body: Record<string, any> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') body[k] = v;
  };
  set('candidateId', row.sourcewhale_candidate_id);
  set('firstName', row.first_name);
  set('lastName', row.last_name);
  set('name', row.name ?? [row.first_name, row.last_name].filter(Boolean).join(' '));
  if (row.email) body.emails = [row.email];
  if (row.phone) body.phones = [row.phone];
  set('role', row.job_title);
  set('company', row.current_employer);
  set('location', row.location);
  set('linkedinUrl', row.linkedin_url);
  return body;
}

// ---------- Zapier / webhook subscriptions ----------
//
// Confirmed with SourceWhale (Aug 2026): the only supported subscriptionType
// values are `candidateCreated` and `candidateUpdated`. There is NO subscription
// type for notes, comments, replies or general candidate activity.
//
// POST /zapier/subscribe   body { subscriptionType, url }  -> { id }
// POST /zapier/unsubscribe body { subscriptionId }         -> "success"

export const SW_SUBSCRIPTION_TYPES = ['candidateCreated', 'candidateUpdated'] as const;
export type SwSubscriptionType = typeof SW_SUBSCRIPTION_TYPES[number];

export function isSwSubscriptionType(v: unknown): v is SwSubscriptionType {
  return typeof v === 'string' && (SW_SUBSCRIPTION_TYPES as readonly string[]).includes(v);
}

export function subscribeZapier(apiKey: string, subscriptionType: SwSubscriptionType, url: string) {
  return swPost<{ id?: string }>(apiKey, '/zapier/subscribe', { subscriptionType, url });
}

export function unsubscribeZapier(apiKey: string, subscriptionId: string) {
  return swPost(apiKey, '/zapier/unsubscribe', { subscriptionId });
}
