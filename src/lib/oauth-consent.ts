import { supabase } from '@/integrations/supabase/client';

export type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string };
  redirect_uri?: string;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResponse = { data: AuthorizationDetails | null; error: { message: string } | null };
export type OAuthAPI = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResponse>;
  approveAuthorization: (id: string) => Promise<OAuthResponse>;
  denyAuthorization: (id: string) => Promise<OAuthResponse>;
};

function oauthAPI(): OAuthAPI {
  const auth = supabase.auth as unknown as { oauth?: OAuthAPI };
  if (!auth.oauth) throw new Error('Connections are temporarily unavailable. Please try again later.');
  return auth.oauth;
}

export async function loadAuthorization(id: string, api: OAuthAPI = oauthAPI()) {
  if (!id.trim()) throw new Error('This connection request is missing. Start the connection again in Claude.');
  const response = await api.getAuthorizationDetails(id);
  if (response.error) throw new Error(response.error.message);
  if (!response.data) throw new Error('This connection request has expired. Start again in Claude.');
  const redirect = response.data.redirect_url ?? response.data.redirect_to;
  if (redirect && !response.data.client) return { redirect, details: null };
  if (!response.data.client) throw new Error('This connection request is no longer available. Start again in Claude.');
  return { redirect: null, details: response.data };
}

export async function decideAuthorization(id: string, approve: boolean, api: OAuthAPI = oauthAPI()) {
  if (!id.trim()) throw new Error('This connection request is missing. Start again in Claude.');
  const response = approve ? await api.approveAuthorization(id) : await api.denyAuthorization(id);
  if (response.error) throw new Error(response.error.message);
  const target = response.data?.redirect_url ?? response.data?.redirect_to;
  if (!target) throw new Error('No return address was provided. Start the connection again in Claude.');
  return target;
}