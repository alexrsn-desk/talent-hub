// Job Launch — single AI call that returns all five launch outputs:
// per-known-candidate personal messages, per-LI-connection DMs,
// a LinkedIn post, a campaign outreach message (subject + body),
// and a client confirmation email (subject + body).
// Vendor-neutral: uses the Lovable AI Gateway and standard chat-completions JSON mode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const { job_id, known_candidate_ids = [], li_candidate_ids = [], launch_hook, ideal_candidate_line, model } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const [{ data: job }, { data: profile }] = await Promise.all([
      sb.from("jobs").select("title, description, intake_summary, location, salary_min, salary_max, job_type, clients(company_name, contact_name)").eq("id", job_id).single(),
      sb.from("recruiter_profiles").select("display_name, linkedin_post_template, personal_candidate_template, li_connection_template, campaign_outreach_template, client_confirmation_template").eq("user_id", user.id).maybeSingle(),
    ]);

    const allIds = [...known_candidate_ids, ...li_candidate_ids];
    const { data: cands = [] } = allIds.length
      ? await sb.from("candidates").select("id, name, first_name, job_title, current_employer, summary, note, salary_expectation").in("id", allIds)
      : { data: [] };
    const { data: notes = [] } = allIds.length
      ? await sb.from("notes").select("candidate_id, content, activity_type, created_at").in("candidate_id", allIds).order("created_at", { ascending: false }).limit(120)
      : { data: [] };

    const notesBy: Record<string, string[]> = {};
    for (const n of notes as any[]) {
      if (!n.candidate_id) continue;
      (notesBy[n.candidate_id] ||= []).push(`[${n.activity_type}] ${String(n.content).slice(0, 250)}`);
    }
    const candById = new Map((cands as any[]).map((c) => [c.id, c]));

    function candBlock(id: string) {
      const c = candById.get(id);
      if (!c) return `id:${id} (not found)`;
      return `id:${id} | ${c.first_name || c.name} | ${c.job_title || "?"} @ ${c.current_employer || "?"} | summary: ${(c.summary || c.note || "—").slice(0, 220)} | recent notes: ${(notesBy[id] || []).slice(0, 3).join(" ~~ ") || "none"}`;
    }

    const knownBlock = known_candidate_ids.map(candBlock).join("\n");
    const liBlock = li_candidate_ids.map(candBlock).join("\n");

    const clientName = (job as any)?.clients?.company_name || "the client";
    const clientContact = (job as any)?.clients?.contact_name || "there";
    const recruiterName = (profile as any)?.display_name || "the recruiter";

    const styleHints = `RECRUITER STYLE TEMPLATES (mirror tone/length where present, ignore where empty):
LinkedIn post style:
${(profile as any)?.linkedin_post_template || "(none — default to genuine, expert-led, no buzzwords, no hashtag spam)"}
Personal candidate message style:
${(profile as any)?.personal_candidate_template || "(none — default to warm, 3-4 sentences, references something specific)"}
LI connection DM style:
${(profile as any)?.li_connection_template || "(none — default to under 300 chars, soft ask, no hard sell)"}
Campaign outreach style:
${(profile as any)?.campaign_outreach_template || "(none — default to short, lead with what's interesting, soft CTA)"}
Client confirmation style:
${(profile as any)?.client_confirmation_template || "(none — default to confident, organised, professional UK English)"}`;

    const system = `You write five recruitment launch outputs as a single JSON response. Return ONLY this JSON:
{
  "personal_messages": [{"candidate_id":"<id>","subject":"<subject>","body":"<message>"}],
  "li_messages":       [{"candidate_id":"<id>","body":"<<=300 char LI DM>"}],
  "linkedin_post":     "<full post>",
  "campaign":          {"subject":"<subject>","body":"<message with {first_name} {current_company} placeholders>"},
  "client_email":      {"subject":"<subject>","body":"<email to client confirming the brief>"}
}

CRITICAL RULES (non-negotiable):
- ALWAYS lead with what's interesting about the role. Never lead with "are you looking?".
- Use first names only. Never full names. No "Dear".
- Personal messages: warm, 3–4 sentences max, reference something specific from notes/profile.
- LI messages: under 300 chars, soft, "Happy to share more if relevant" style.
- LinkedIn post: lead with the genuine interesting angle, expert tone, subtle CTA, NO "exciting opportunity" cliches, no excessive hashtags.
- Campaign: short enough to read in 20 seconds, includes {first_name} {current_company} placeholders, soft CTA.
- Client email: confirms understanding, outlines approach, asks for interview availability + feedback turnaround + expected timeline.
- Plain professional UK English. No emojis. No markdown headings inside message bodies.`;

    const userPrompt = `JOB: ${job?.title} at ${clientName}
Location: ${job?.location || "—"} · ${job?.job_type || ""} · £${job?.salary_min || "?"}–£${job?.salary_max || "?"}
JD: ${(job as any)?.description?.slice(0, 2500) || "—"}
Intake brief: ${(job as any)?.intake_summary?.slice(0, 1500) || "—"}
WHAT MAKES IT INTERESTING: ${launch_hook || "—"}
IDEAL CANDIDATE: ${ideal_candidate_line || "—"}
RECRUITER: ${recruiterName}
CLIENT CONTACT: ${clientContact}

KNOWN CANDIDATES (write personal warm messages for each, one per id):
${knownBlock || "(none)"}

LI CONNECTIONS (write short LI DM for each, one per id):
${liBlock || "(none)"}

${styleHints}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.6,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `AI error ${resp.status}`, detail: t }, resp.status);
    }
    const data = await resp.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }

    return json({
      personal_messages: parsed.personal_messages || [],
      li_messages: parsed.li_messages || [],
      linkedin_post: parsed.linkedin_post || "",
      campaign: parsed.campaign || { subject: "", body: "" },
      client_email: parsed.client_email || { subject: "", body: "" },
    });
  } catch (e: any) {
    return json({ error: e?.message || "unknown" }, 500);
  }
});
