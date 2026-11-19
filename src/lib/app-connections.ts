import { supabase } from "@/integrations/supabase/client";

export type ConnectorId = "microsoft_outlook" | "google_mail" | "linkedin";
export type ConnectionRow = { connector_id: ConnectorId; account_email: string | null; reconnect_required: boolean; updated_at: string };

async function readError(error: any) {
  try { const t = await error?.context?.text(); const j = JSON.parse(t); return j.error || t; } catch { return error?.message || "Request failed"; }
}

export async function getConnectionStatus(): Promise<{ connections: ConnectionRow[]; available: Record<ConnectorId, boolean> }> {
  const { data, error } = await supabase.functions.invoke("app-connections", { body: { action: "status" } });
  if (error) throw new Error(await readError(error));
  return data;
}

export async function disconnectConnector(connector: ConnectorId) {
  const { error } = await supabase.functions.invoke("app-connections", { body: { action: "disconnect", connector } });
  if (error) throw new Error(await readError(error));
}

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => { window.removeEventListener("message", onMessage); if (poll !== undefined) window.clearInterval(poll); };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (event.origin !== window.location.origin || event.source !== popup ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") { resolve(); return; }
      popup.close();
      reject(new Error(event.data?.reason ?? "Connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => { if (!popup.closed) return; cleanup(); reject(new Error("The sign-in window was closed before finishing.")); }, 500);
  });
}

/** Must be called directly from a click handler (opens a popup). */
export async function connectConnector(connector: ConnectorId) {
  const popup = window.open("", "desky-oauth", "width=600,height=720");
  if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
  try {
    const { data, error } = await supabase.functions.invoke("app-connections", { body: { action: "start", connector, origin: window.location.origin } });
    if (error) throw new Error(await readError(error));
    const done = waitForOAuthCompletion(popup);
    popup.location.href = data.authorizationUrl;
    await done;
  } catch (e) {
    popup.close();
    throw e;
  }
}
