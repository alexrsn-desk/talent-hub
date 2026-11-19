// Per-user mailbox / LinkedIn connections: start, complete, status, disconnect.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { authorizeAppUserOAuth, callAsAppUser, disconnectAppUser, exchangeAppUserOAuthCode } from "../_shared/appUserConnector.ts";
import { deleteConnectionForUser, getConnectionKeyForUser, listConnectionsForUser, saveConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { CONNECTORS, type ConnectorKey } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/mailer.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Connector = z.enum(["microsoft_outlook", "google_mail", "linkedin"]);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("start"), connector: Connector, origin: z.string().url() }),
  z.object({ action: z.literal("complete"), code: z.string().min(1).max(4000) }),
  z.object({ action: z.literal("disconnect"), connector: Connector }),
]);

async function fetchAccountEmail(connector: ConnectorKey, key: string): Promise<string | null> {
  try {
    const path = connector === "microsoft_outlook" ? "/me" : connector === "google_mail" ? "/gmail/v1/users/me/profile" : "/v2/userinfo";
    const r = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: connector, path });
    if (!r.ok) return null;
    const d = await r.json();
    return d.mail || d.userPrincipalName || d.emailAddress || d.email || d.name || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Sign in required" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    if (b.action === "status") {
      const available = Object.fromEntries(Object.entries(CONNECTORS).map(([k, v]) => [k, !!Deno.env.get(v.clientEnv)]));
      return json({ connections: await listConnectionsForUser(user.id), available });
    }
    if (b.action === "start") {
      const cfg = CONNECTORS[b.connector];
      const clientAPIKey = Deno.env.get(cfg.clientEnv);
      if (!clientAPIKey) return json({ error: "This provider hasn't been set up for your workspace yet.", code: "not_configured" }, 400);
      const { authorizationUrl } = await authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL, connectorId: b.connector, appUserId: user.id, clientAPIKey,
        returnUrl: new URL("/oauth/return", b.origin).toString(),
        credentialsConfiguration: { scopes: cfg.scopes, ...cfg.extra },
      });
      return json({ authorizationUrl });
    }
    if (b.action === "complete") {
      const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, b.code);
      if (!(connectorId in CONNECTORS)) return json({ error: "Unexpected connector" }, 400);
      const email = await fetchAccountEmail(connectorId as ConnectorKey, connectionAPIKey);
      await saveConnectionKeyForUser(user.id, connectorId, connectionAPIKey, email);
      return json({ ok: true, connector: connectorId, account: email });
    }
    // disconnect
    const key = await getConnectionKeyForUser(user.id, b.connector);
    if (key) {
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: b.connector }); }
      catch (e) { console.error(e); }
    }
    await deleteConnectionForUser(user.id, b.connector);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
