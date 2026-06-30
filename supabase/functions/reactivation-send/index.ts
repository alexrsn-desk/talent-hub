// Sends a single reactivation message via Microsoft Outlook (if connected),
// logs the touchpoint, resets decay timers, and records send status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { messageId, sendViaOutlook, followupDays } = await req.json();
    const { data: msg, error } = await supabase
      .from("reactivation_messages")
      .select("*")
      .eq("id", messageId)
      .eq("owner_user_id", user.id)
      .single();
    if (error || !msg) return json({ error: "not_found" }, 404);

    let sent = false;
    let sendError: string | null = null;

    if (sendViaOutlook && msg.contact_email) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const OUTLOOK_KEY = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");
      if (LOVABLE_API_KEY && OUTLOOK_KEY) {
        const r = await fetch(`${GATEWAY_URL}/me/sendMail`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": OUTLOOK_KEY,
          },
          body: JSON.stringify({
            message: {
              subject: msg.subject || "Hello",
              body: { contentType: "Text", content: msg.body || "" },
              toRecipients: [{ emailAddress: { address: msg.contact_email } }],
            },
          }),
        });
        if (r.ok) sent = true;
        else sendError = await r.text().catch(() => "send_failed");
      } else {
        sendError = "outlook_not_connected";
      }
    } else {
      // Manual send / queued — recruiter marks sent themselves
      sent = true;
    }

    const followupDue = followupDays
      ? new Date(Date.now() + followupDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await supabase
      .from("reactivation_messages")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        followup_due_at: followupDue,
      })
      .eq("id", messageId);

    if (sent) {
      // Log activity + reset decay on the contact record
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action_type: "reactivation_sent",
        entity_type: msg.contact_kind,
        entity_id: msg.contact_id,
        metadata: { campaign_id: msg.campaign_id, message_type: msg.message_type, subject: msg.subject },
      } as any);

      const now = new Date().toISOString();
      if (msg.contact_kind === "past_client" || msg.contact_kind === "warm_prospect") {
        await supabase.from("clients").update({ last_activity_date: now }).eq("id", msg.contact_id).eq("owner_user_id", user.id);
      } else if (msg.contact_kind === "placed_candidate") {
        // candidates table doesn't have last_activity; insert a brief note as touchpoint
        await supabase.from("notes").insert({
          owner_user_id: user.id, candidate_id: msg.contact_id,
          content: `Reactivation message sent: ${msg.subject || "(no subject)"}`,
          note_type: "reactivation",
        } as any);
      } else if (msg.contact_kind === "cold_contact" || msg.contact_kind === "general") {
        await supabase.from("contacts").update({ last_contacted_at: now }).eq("id", msg.contact_id).eq("owner_user_id", user.id);
      }
    }

    return json({ ok: sent, error: sendError });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
