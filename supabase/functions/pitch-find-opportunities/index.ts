// Finds opportunities for a candidate across the existing DB.
// Returns three buckets: liveRoles, networkContacts, silverMedallists.
// Uses standard OpenAI-compatible chat completions (works for Gemini & Claude).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function ai(messages: any[], schemaHint = true) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(schemaHint ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { candidate_id, story, why_now } = await req.json();
    if (!candidate_id) return json({ error: "candidate_id required" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: candidate } = await sb.from("candidates").select("*").eq("id", candidate_id).maybeSingle();
    if (!candidate) return json({ error: "candidate not found" }, 404);

    const [{ data: jobs }, { data: clients }, { data: contacts }, { data: rejectedCJ }] = await Promise.all([
      sb.from("jobs").select("id,title,description,intake_summary,location,salary_min,salary_max,status,client_id,clients(company_name,sector)").eq("status", "Active").limit(100),
      sb.from("clients").select("id,company_name,sector,status,last_activity_date,contact_name,job_title").limit(200),
      sb.from("contacts").select("id,name,email,job_title,status,client_id,clients(company_name,sector)").limit(200),
      sb.from("candidate_jobs").select("job_id,stage,candidates(job_title,current_employer,sector)").in("stage", ["Rejected", "Not Suitable"]).limit(100),
    ]);

    const candidateBlock = {
      name: candidate.name,
      title: candidate.job_title,
      employer: candidate.current_employer,
      location: candidate.location,
      sector: candidate.sector,
      salary_expectation: candidate.salary_expectation,
      summary: candidate.summary,
      note: candidate.note,
      story,
      why_now,
    };

    const sys = `You are a recruitment matchmaker. Score how well a candidate fits each opportunity. Output strict JSON only.
Return: {
  "liveRoles": [{"job_id": "...", "score": 0-100, "reason": "<one specific sentence>"}],
  "networkClients": [{"client_id": "...", "score": 0-100, "reason": "..."}],
  "networkContacts": [{"contact_id": "...", "score": 0-100, "reason": "..."}],
  "silverMedallists": [{"job_id": "...", "score": 0-100, "reason": "..."}]
}
Rules:
- Only include items with score >= 55.
- Max 8 per array; sort by score desc.
- Reasons must be specific (mention sector, tech, stage, or signal) — never generic like "good fit".
- Live roles: match candidate experience to the JD. Silver-medallist: jobs where a similar candidate was rejected and this one might fit better.
- Network clients: companies that have hired similar profiles or are in matching sector. Weight by recency.
- Network contacts: people working at relevant companies in candidate's sector.`;

    const user = `Candidate:\n${JSON.stringify(candidateBlock, null, 2)}\n\nLive Jobs (${jobs?.length ?? 0}):\n${JSON.stringify(jobs ?? [])}\n\nClients (${clients?.length ?? 0}):\n${JSON.stringify(clients ?? [])}\n\nContacts (${contacts?.length ?? 0}):\n${JSON.stringify(contacts ?? [])}\n\nRejected on jobs (silver-medallist source):\n${JSON.stringify(rejectedCJ ?? [])}`;

    const result = await ai([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);

    // Hydrate ids → full records for the UI
    const jobsById = new Map((jobs ?? []).map((j: any) => [j.id, j]));
    const clientsById = new Map((clients ?? []).map((c: any) => [c.id, c]));
    const contactsById = new Map((contacts ?? []).map((c: any) => [c.id, c]));

    const liveRoles = (result.liveRoles ?? []).map((r: any) => ({ ...r, job: jobsById.get(r.job_id) })).filter((r: any) => r.job);
    const networkClients = (result.networkClients ?? []).map((r: any) => ({ ...r, client: clientsById.get(r.client_id) })).filter((r: any) => r.client);
    const networkContacts = (result.networkContacts ?? []).map((r: any) => ({ ...r, contact: contactsById.get(r.contact_id) })).filter((r: any) => r.contact);
    const silverMedallists = (result.silverMedallists ?? []).map((r: any) => ({ ...r, job: jobsById.get(r.job_id) })).filter((r: any) => r.job);

    return json({ liveRoles, networkClients, networkContacts, silverMedallists });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
