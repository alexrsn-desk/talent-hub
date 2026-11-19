// Sends email as the signed-in user through whichever mailbox they connected (Outlook or Gmail).
import { appUserReconnectRequired, callAsAppUser } from "./appUserConnector.ts";
import { getConnectionKeyForUser, listConnectionsForUser, markReconnectRequired } from "./appUserConnections.ts";
import { CONNECTORS } from "./appUserScopes.ts";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export type MailProvider = "microsoft_outlook" | "google_mail";

export async function activeMailProvider(userId: string): Promise<MailProvider | null> {
  const rows = (await listConnectionsForUser(userId))
    .filter((r: any) => (r.connector_id === "microsoft_outlook" || r.connector_id === "google_mail") && !r.reconnect_required)
    .sort((a: any, b: any) => (b.updated_at > a.updated_at ? 1 : -1));
  return (rows[0]?.connector_id as MailProvider) ?? null;
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export type SendResult = { ok: true } | { ok: false; error: string; reconnect?: boolean };

export async function sendEmailAsUser(userId: string, provider: MailProvider, msg: { to: string; subject: string; body: string }): Promise<SendResult> {
  const key = await getConnectionKeyForUser(userId, provider);
  if (!key) return { ok: false, error: "Mailbox not connected" };
  let res: Response;
  if (provider === "microsoft_outlook") {
    res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: provider, path: "/me/sendMail",
      requiredScopes: [...CONNECTORS.microsoft_outlook.scopes],
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        message: { subject: msg.subject, body: { contentType: "Text", content: msg.body }, toRecipients: [{ emailAddress: { address: msg.to } }] },
        saveToSentItems: true,
      }) },
    });
  } else {
    const raw = b64([`To: ${msg.to}`, `Subject: ${hdr(msg.subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", msg.body].join("\r\n"))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: provider, path: "/gmail/v1/users/me/messages/send",
      requiredScopes: [...CONNECTORS.google_mail.scopes],
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) },
    });
  }
  if (await appUserReconnectRequired(res)) { await markReconnectRequired(userId, provider); return { ok: false, error: "Mailbox needs reconnecting", reconnect: true }; }
  if (!res.ok) { const t = await res.text(); console.error(`send failed [${res.status}]: ${t}`); return { ok: false, error: `Send failed (${res.status})` }; }
  return { ok: true };
}
