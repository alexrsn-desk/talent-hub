// supabase/functions/generate-conversation-prompts/index.ts
// Generates personalised BD conversation prompts for a client or contact.
// Uses Lovable AI gateway (OpenAI-compatible). Standard JSON response — no provider-specific features.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  entity_type: "client" | "contact";
  entity_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const body = (await req.json()) as Body;
    if (!body?.entity_type || !body?.entity_id) {
      return json({ error: "entity_type and entity_id required" }, 400);
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    // Resolve the client_id (a contact is always linked to a client; we pull notes from the client)
    let clientId = body.entity_id;
    let entityName = "";
    let entitySector = "";
    let entityStatus = "";
    let entitySummary = "";
    let contactInfo: any = null;

    if (body.entity_type === "contact") {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/contacts?id=eq.${body.entity_id}&select=*`,
        { headers },
      );
      const rows = await r.json();
      if (!rows?.[0]) return json({ error: "Contact not found" }, 404);
      contactInfo = rows[0];
      clientId = rows[0].client_id;
      entityName = rows[0].name;
      entityStatus = rows[0].status || "";
      entitySummary = rows[0].summary || "";
    }

    // Get client info
    const cRes = await fetch(
      `${SUPABASE_URL}/rest/v1/clients?id=eq.${clientId}&select=*`,
      { headers },
    );
    const cRows = await cRes.json();
    if (!cRows?.[0]) return json({ error: "Client not found" }, 404);
    const client = cRows[0];
    if (body.entity_type === "client") {
      entityName = client.company_name;
      entityStatus = client.status || "";
      entitySummary = client.summary || "";
    }
    entitySector = client.sector || "";

    // Pull notes for this client (most recent 25)
    const nRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notes?client_id=eq.${clientId}&select=*&order=created_at.desc&limit=25`,
      { headers },
    );
    const notes = await nRes.json();

    // Pull signals from those notes
    const noteIds = (notes || []).map((n: any) => n.id);
    let signals: any[] = [];
    if (noteIds.length) {
      const sRes = await fetch(
        `${SUPABASE_URL}/rest/v1/call_signals?note_id=in.(${noteIds.join(",")})&select=*`,
        { headers },
      );
      signals = await sRes.json();
    }

    // Recent activity log
    const aRes = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_log?client_id=eq.${clientId}&select=*&order=created_at.desc&limit=15`,
      { headers },
    );
    const activity = await aRes.json();

    // Open jobs at this client (signal of hiring need)
    const jRes = await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?client_id=eq.${clientId}&status=eq.Open&select=id,title,location,salary_min,salary_max`,
      { headers },
    );
    const openJobs = await jRes.json();

    // Build context
    const lastNote = notes?.[0];
    const daysSinceLastNote = lastNote
      ? Math.floor((Date.now() - new Date(lastNote.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // If empty, return early
    if ((!notes || notes.length === 0) && (!activity || activity.length === 0)) {
      return json({
        empty: true,
        message: "Add notes from your first conversation to generate personalised prompts",
      });
    }

    const contextBlock = `
ENTITY TYPE: ${body.entity_type}
NAME: ${entityName}
${body.entity_type === "contact" ? `JOB TITLE: ${contactInfo?.job_title || "unknown"}` : ""}
COMPANY: ${client.company_name}
SECTOR: ${entitySector || "unknown"}
LOCATION: ${client.location || "unknown"}
BD PIPELINE STAGE: ${client.status || "unknown"}
SUMMARY: ${entitySummary || "(none)"}
NEXT ACTION: ${client.next_action || "(none)"}${client.next_action_due_date ? ` due ${client.next_action_due_date}` : ""}
DAYS SINCE LAST CONTACT: ${daysSinceLastNote ?? "no record"}
OPEN JOBS AT THIS COMPANY: ${openJobs?.length ? openJobs.map((j: any) => `${j.title}${j.location ? ` (${j.location})` : ""}`).join(", ") : "none"}

RECENT NOTES (most recent first):
${(notes || []).slice(0, 12).map((n: any, i: number) => `[${i + 1}] ${n.activity_type} on ${n.created_at?.slice(0, 10)}${n.outcome ? ` — outcome: ${n.outcome}` : ""}\n${(n.content || "").slice(0, 600)}`).join("\n\n")}

DETECTED SIGNALS:
${signals.length ? signals.slice(0, 15).map((s: any) => `- [${s.signal_type}] ${s.explanation} (trigger: "${s.trigger_phrase}")${s.suggested_action ? ` → suggested: ${s.suggested_action}` : ""}`).join("\n") : "(none)"}

RECENT ACTIVITY LOG:
${(activity || []).slice(0, 8).map((a: any) => `- ${a.action_type} on ${a.created_at?.slice(0, 10)}`).join("\n") || "(none)"}
`.trim();

    const systemPrompt = `You are a senior recruitment BD coach. You help recruiters prepare for the next conversation with a client or contact. Your prompts must be SPECIFIC to the data provided — never generic. Reference real things from the notes, signals, and recent activity. If a fact is not in the data, do not invent it.

Rules:
- Specificity is the entire value. Reference actual things mentioned: company news, projects, people, dates, hiring plans, concerns, timing.
- Never write generic prompts like "ask about hiring plans" without grounding in something specific from the notes.
- Quote or paraphrase what was actually said where useful.
- Be warm and practical. Write the way a sharp colleague would brief you 5 minutes before the call.
- If days-since-last-contact is high, factor that in (e.g. "come with something new not just a check in").

Output ONLY a JSON object — no markdown fences, no commentary — matching this schema exactly:
{
  "open_with": [ { "prompt": "string", "rationale": "string (one short line)" } ],   // 1 to 2 items
  "build_on": [ { "prompt": "string", "rationale": "string" } ],                      // 2 to 3 items
  "add_value_with": [ { "prompt": "string", "rationale": "string" } ],                // 1 to 2 items
  "tone_guidance": "string (one sentence on how this person communicates, based on notes)"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextBlock },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      if (aiRes.status === 429) return json({ error: "Rate limit exceeded, try again shortly." }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }, 402);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiRes.json();
    const text: string = aiJson.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback: try to extract JSON block
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    if (!parsed) {
      return json({ error: "Could not parse AI response", raw: text }, 500);
    }

    return json({
      empty: false,
      generated_at: new Date().toISOString(),
      ...parsed,
    });
  } catch (e) {
    console.error("generate-conversation-prompts error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
