// Server-only storage of per-user encrypted connection keys.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptConnectionKey, decryptConnectionKey } from "./connectionKeyCrypto.ts";

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function saveConnectionKeyForUser(userId: string, connectorId: string, connectionAPIKey: string, accountEmail?: string | null) {
  const { error } = await adminClient().from("app_user_connections").upsert({
    user_id: userId, connector_id: connectorId,
    connection_key_ciphertext: await encryptConnectionKey(connectionAPIKey),
    account_email: accountEmail ?? null, reconnect_required: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,connector_id" });
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const { data, error } = await adminClient().from("app_user_connections")
    .select("connection_key_ciphertext").eq("user_id", userId).eq("connector_id", connectorId).maybeSingle();
  if (error) throw error;
  return data ? await decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function listConnectionsForUser(userId: string) {
  const { data, error } = await adminClient().from("app_user_connections")
    .select("connector_id, account_email, reconnect_required, updated_at").eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

export async function markReconnectRequired(userId: string, connectorId: string) {
  await adminClient().from("app_user_connections").update({ reconnect_required: true }).eq("user_id", userId).eq("connector_id", connectorId);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { error } = await adminClient().from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", connectorId);
  if (error) throw error;
}
