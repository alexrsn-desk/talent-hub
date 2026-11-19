// Publishes a LinkedIn post as the signed-in user's own LinkedIn account.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { appUserReconnectRequired, callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser, markReconnectRequired } from "../_shared/appUserConnections.ts";
import { LINKEDIN_SCOPES } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/mailer.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ text: z.string().min(1).max(3000), job_id: z.string().uuid().optional() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const key = await getConnectionKeyForUser(user.id, "linkedin");
    if (!key) return json({ connected: false, error: "Connect LinkedIn in Settings first" }, 400);
    const call = (path: string, init?: RequestInit) =>
      callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: "linkedin", path, init, requiredScopes: LINKEDIN_SCOPES });

    const me = await call("/v2/userinfo");
    if (await appUserReconnectRequired(me)) { await markReconnectRequired(user.id, "linkedin"); return json({ connected: false, reconnectRequired: true }, 401); }
    if (!me.ok) return json({ error: `LinkedIn profile lookup failed (${me.status})`, details: await me.text() }, 502);
    const { sub } = await me.json();

    const res = await call("/v2/ugcPosts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author: `urn:li:person:${sub}`,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: parsed.data.text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (await appUserReconnectRequired(res)) { await markReconnectRequired(user.id, "linkedin"); return json({ connected: false, reconnectRequired: true }, 401); }
    if (!res.ok) { const t = await res.text(); console.error(t); return json({ error: `LinkedIn post failed (${res.status})`, details: t }, 502); }
    return json({ ok: true, post_id: res.headers.get("x-restli-id") });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
