// Drafts personalised reconnection messages for a batch of contacts.
// Vendor-neutral: works with both Gemini and Claude via Lovable AI Gateway (OpenAI-compatible).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = "google/gemini-2.5-flash";
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const FRAMING = `CRITICAL — Non-negotiable rules for reconnection messages:
- NEVER write "just checking in", "touching base", "hope you're well — any vacancies", or anything that resembles asking if they have roles.
- Every message MUST offer something genuine — a candidate, a market insight, a personal callback, OR an honest warm reconnect for a real relationship.
- If you cannot find a specific hook, do NOT fabricate one. Return type: "no_hook".
- Lead with what you have to OFFER. Never lead with the role or with a need.
- Use the contact's first name only. Plain UK English. No emojis. No buzzwords.
- 80-150 words. Soft close — make it easy not to reply.
- If a template style is provided, follow its tone and structure.`;

const TYPE_GUIDE = `MESSAGE TYPES — pick ONE per contact:
1. "candidate_lead" — recruiter has a strong active candidate matching this contact's typical hiring profile. Open: "I've been speaking to someone I thought you should know about..."
2. "market_insight" — a relevant piece of market intelligence for their sector. Open: "Interesting thing I'm seeing in the market that might be relevant to you..."
3. "personal_touchpoint" — referencing something specific from a previous note/conversation. Open: "You mentioned [thing] in our last conversation — wanted to check in on how that went."
4. "soft_reconnect" — only when a genuine relationship exists AND none of the above fit. Open: "It's been a while — wanted to drop you a note." Must still include ONE specific reference, not a hollow check-in.
5. "no_hook" — flag this contact; no strong hook exists. Return empty subject/body.`;

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

    const { rows, candidateLead, marketInsight } = await req.json() as {
      rows: any[];
      candidateLead?: { name: string; story: string; profile: string } | null;
      marketInsight?: string | null;
    };

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    // Pull recruiter profile + their saved reactivation template
    const { data: prof } = await supabase
      .from("recruiter_profiles")
      .select("display_name, reactivation_email_template")
      .eq("user_id", user.id)
      .maybeSingle();

    // Pull last 3 notes per contact for context
    const ids = rows.map(r => r.id);
    const [{ data: clientNotes }, { data: candNotes }, { data: contactNotes }] = await Promise.all([
      supabase.from("notes").select("client_id,content,created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(200),
      supabase.from("notes").select("candidate_id,content,created_at").in("candidate_id", ids).order("created_at", { ascending: false }).limit(200),
      supabase.from("notes").select("contact_id,content,created_at").in("contact_id", ids).order("created_at", { ascending: false }).limit(200),
    ]);
    const notesById = new Map<string, string[]>();
    for (const arr of [clientNotes || [], candNotes || [], contactNotes || []]) {
      for (const n of arr as any[]) {
        const id = n.client_id || n.candidate_id || n.contact_id;
        if (!id) continue;
        const list = notesById.get(id) || [];
        if (list.length < 3) list.push((n.content || "").slice(0, 300));
        notesById.set(id, list);
      }
    }

    const templateBlock = prof?.reactivation_email_template
      ? `RECRUITER'S OWN RECONNECTION STYLE (mirror tone & structure):\n"""${prof.reactivation_email_template}"""\n`
      : "";

    const availableHooks = [
      candidateLead ? `- candidate_lead available: ${candidateLead.name} — ${candidateLead.story}` : null,
      marketInsight ? `- market_insight available: ${marketInsight}` : null,
    ].filter(Boolean).join("\n") || "- none provided";

    const sys = `You draft hyper-personal recruitment reconnection messages. ${FRAMING}\n\n${TYPE_GUIDE}\n\n${templateBlock}AVAILABLE HOOKS:\n${availableHooks}\n\nReturn STRICT JSON: {"messages":[{"id":"<row id>","type":"candidate_lead|market_insight|personal_touchpoint|soft_reconnect|no_hook","subject":"","body":"","reason":"<one-line why this type>"}]}`;

    const userPayload = rows.map(r => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      first_name: (r.name || "").split(" ")[0],
      company: r.company,
      days_since_contact: r.lastContactedDays,
      context: r.contextLine,
      touchpoints: r.touchpoints,
      has_placement: r.hasPlacement,
      last_notes: notesById.get(r.id) || [],
    }));

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Recruiter: ${prof?.display_name || "the recruiter"}\n\nCONTACTS:\n${JSON.stringify(userPayload, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (r.status === 429) return json({ error: "rate_limited" }, 429);
    if (r.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!r.ok) return json({ error: "ai_error", detail: await r.text() }, 500);
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]);
    }
    return json({ messages: parsed.messages || [] });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
