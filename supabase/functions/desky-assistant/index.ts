// Desky AI Assistant — natural-language recruiting PA.
// Two modes:
//   POST { action: "chat", messages }
//     -> { reply, proposal?: { kind, summary, params }, draft?: string }
//   POST { action: "execute", proposal }
//     -> { ok: true, result: string } | { ok: false, error }
//
// Confirmation rule: mutations never run inside the chat step. The model
// calls propose_action with a plain-English one-liner and params; the client
// shows a Confirm button, then calls back with action:"execute".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 6;

const STAGES = [
  "Contact", "Screening", "Shortlist", "Submitted", "Client Review",
  "First Interview", "Second Interview", "Offer", "Placed", "Rejected",
];

const SYSTEM_PROMPT = `You are Desky, a smart recruiting PA sitting next to the recruiter inside their CRM.

VOICE
- Short, casual, direct. Like texting a smart assistant. No preamble, no "Certainly!", no system-notification tone.
- Two sentences max unless the recruiter asked a real question that needs more.

WHAT YOU DO
- Understand plain-English recruiting instructions and turn them into actions.
- Use search_candidates / search_jobs / search_clients to resolve names (fuzzy — recruiters won't use exact spellings).
- For anything that changes data, call the propose_action tool. Never mutate directly. The user will confirm before it runs.
- For draft-only outreach messages, call propose_action with kind="draft_message" and put the drafted body in params.body — the user can review and copy.

FUZZY MATCHING
- If a name matches exactly one record confidently, proceed with it.
- If multiple plausible matches, do NOT guess. Ask ONE short clarifying question, e.g. "Two Sarahs — Sarah Khan (Product Designer) or Sarah Lee (Backend Engineer)?".
- If nothing matches, say so plainly and offer the closest option.

STAGES (exact spelling)
${STAGES.join(", ")}

PROPOSALS — kinds and required params
- add_to_pipeline: { candidate_ids: string[], job_id: string, stage: string }
- move_stage: { candidate_id: string, job_id: string, stage: string }
- create_candidate: { first_name, last_name, email?, job_title?, current_employer?, linkedin_url?, location?, note? }
- add_note: { content: string, candidate_id? | job_id? | client_id? } (exactly one target)
- create_reminder: { title: string, due_date?: YYYY-MM-DD }
- flag_candidate: { candidate_id: string, reason?: string }
- draft_message: { candidate_id: string, purpose: string, body: string }  ← you write the body

ALWAYS put a one-line human summary in "summary" — e.g. "Add Maciej Nowak and Rafael Costa to First Interview on Senior Java Engineer at Nickel." That summary is what the recruiter confirms.

LIMITS
- If asked to do something outside the propose_action kinds above (e.g. actually send emails, book calendar), say plainly: "Can't send from here yet — I can draft it for you." Then draft it.
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_candidates",
      description: "Fuzzy search candidates by name / current title / current employer. Returns up to 8 matches with id, name, job_title, current_employer.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_jobs",
      description: "Fuzzy search jobs by title, prefers Active. Returns id, title, status, client_company.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          active_only: { type: "boolean" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Fuzzy search clients by company name.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_for_job",
      description: "List candidates currently on a job's pipeline, grouped by stage. Use for questions like 'who is at offer stage on X'.",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string" }, stage: { type: "string" } },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description: "Propose one data-changing action for the recruiter to confirm. Returning this ends your turn — do NOT also answer in content; the summary is what the user sees.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "add_to_pipeline", "move_stage", "create_candidate",
              "add_note", "create_reminder", "flag_candidate", "draft_message",
            ],
          },
          summary: { type: "string" },
          params: { type: "object" },
        },
        required: ["kind", "summary", "params"],
      },
    },
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function runTool(sb: any, userId: string, name: string, args: any) {
  try {
    if (name === "search_candidates") {
      const q = String(args.query || "").trim();
      if (!q) return { rows: [] };
      const { data } = await sb
        .from("candidates")
        .select("id,name,first_name,last_name,job_title,current_employer,email")
        .or(`name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,job_title.ilike.%${q}%,current_employer.ilike.%${q}%`)
        .limit(8);
      return { rows: data ?? [] };
    }
    if (name === "search_jobs") {
      let q = sb.from("jobs")
        .select("id,title,status,client_id,clients(company_name)")
        .ilike("title", `%${String(args.query || "")}%`)
        .limit(8);
      if (args.active_only !== false) q = q.eq("status", "Active");
      const { data } = await q;
      return {
        rows: (data ?? []).map((j: any) => ({
          id: j.id, title: j.title, status: j.status,
          client_company: j.clients?.company_name ?? null,
        })),
      };
    }
    if (name === "search_clients") {
      const { data } = await sb.from("clients")
        .select("id,company_name,status")
        .ilike("company_name", `%${String(args.query || "")}%`)
        .limit(8);
      return { rows: data ?? [] };
    }
    if (name === "get_pipeline_for_job") {
      let q = sb.from("candidate_jobs")
        .select("id,stage,candidate_id,candidates(name,job_title)")
        .eq("job_id", args.job_id);
      if (args.stage) q = q.eq("stage", args.stage);
      const { data } = await q;
      return { rows: data ?? [] };
    }
    return { error: `unknown tool ${name}` };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

async function executeProposal(sb: any, userId: string, apiKey: string, proposal: any): Promise<{ ok: boolean; result?: string; error?: string }> {
  const kind = proposal?.kind;
  const p = proposal?.params ?? {};
  try {
    if (kind === "add_to_pipeline") {
      const ids: string[] = Array.isArray(p.candidate_ids) ? p.candidate_ids : [];
      const stage = STAGES.includes(p.stage) ? p.stage : "Contact";
      if (!p.job_id || ids.length === 0) return { ok: false, error: "Missing job_id or candidate_ids" };
      // Skip candidates already on this job.
      const { data: existing } = await sb.from("candidate_jobs")
        .select("candidate_id").eq("job_id", p.job_id).in("candidate_id", ids);
      const already = new Set((existing ?? []).map((r: any) => r.candidate_id));
      const rows = ids.filter((id) => !already.has(id)).map((candidate_id) => ({
        candidate_id, job_id: p.job_id, stage, owner_user_id: userId,
      }));
      if (rows.length === 0) return { ok: true, result: "Already on the pipeline." };
      const { error } = await sb.from("candidate_jobs").insert(rows);
      if (error) throw error;
      const skipped = ids.length - rows.length;
      return { ok: true, result: `Added ${rows.length} to ${stage}${skipped ? ` (${skipped} already there)` : ""}.` };
    }
    if (kind === "move_stage") {
      const stage = STAGES.includes(p.stage) ? p.stage : null;
      if (!stage || !p.candidate_id || !p.job_id) return { ok: false, error: "Missing candidate_id, job_id or stage" };
      const { data, error } = await sb.from("candidate_jobs")
        .update({ stage }).eq("candidate_id", p.candidate_id).eq("job_id", p.job_id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) return { ok: false, error: "Candidate isn't on that job yet." };
      return { ok: true, result: `Moved to ${stage}.` };
    }
    if (kind === "create_candidate") {
      const first = String(p.first_name || "").trim();
      const last = String(p.last_name || "").trim();
      if (!first && !last) return { ok: false, error: "Need at least a name" };
      const { data, error } = await sb.from("candidates").insert({
        owner_user_id: userId,
        first_name: first, last_name: last,
        name: [first, last].filter(Boolean).join(" "),
        email: p.email ?? null,
        job_title: p.job_title ?? null,
        current_employer: p.current_employer ?? null,
        linkedin_url: p.linkedin_url ?? null,
        location: p.location ?? null,
        note: p.note ?? null,
        status: "Uncontacted",
      }).select("id,name").single();
      if (error) throw error;
      return { ok: true, result: `Created ${data.name}.` };
    }
    if (kind === "add_note") {
      const content = String(p.content || "").trim();
      if (!content) return { ok: false, error: "Note is empty" };
      const targets = [p.candidate_id, p.job_id, p.client_id].filter(Boolean).length;
      if (targets !== 1) return { ok: false, error: "Need exactly one target" };
      const { error } = await sb.from("notes").insert({
        owner_user_id: userId, content,
        candidate_id: p.candidate_id ?? null,
        job_id: p.job_id ?? null,
        client_id: p.client_id ?? null,
      });
      if (error) throw error;
      return { ok: true, result: "Note saved." };
    }
    if (kind === "create_reminder") {
      const title = String(p.title || "").trim();
      if (!title) return { ok: false, error: "Reminder needs a title" };
      const { data: existing } = await sb.from("todo_tasks")
        .select("position").order("position", { ascending: false }).limit(1);
      const pos = (existing?.[0] as any)?.position ?? -1;
      const { error } = await sb.from("todo_tasks").insert({
        title, due_date: p.due_date ?? null, priority: "medium",
        position: pos + 1, owner_user_id: userId, user_id: userId,
      } as any);
      if (error) throw error;
      return { ok: true, result: `Reminder set${p.due_date ? ` for ${p.due_date}` : ""}.` };
    }
    if (kind === "flag_candidate") {
      if (!p.candidate_id) return { ok: false, error: "Missing candidate_id" };
      const reason = p.reason ? ` — ${p.reason}` : "";
      const { error } = await sb.from("notes").insert({
        owner_user_id: userId,
        candidate_id: p.candidate_id,
        content: `🚩 Flagged for review${reason}`,
      });
      if (error) throw error;
      return { ok: true, result: "Flagged." };
    }
    if (kind === "draft_message") {
      // Draft-only: we don't send. The client will surface the body for review/copy.
      const body = String(p.body || "").trim();
      if (!body) return { ok: false, error: "No draft to save" };
      // Also stash as a candidate note so it's not lost.
      if (p.candidate_id) {
        await sb.from("notes").insert({
          owner_user_id: userId,
          candidate_id: p.candidate_id,
          content: `📝 Draft outreach (${p.purpose ?? "message"}):\n\n${body}`,
        });
      }
      return { ok: true, result: "Draft saved to the candidate's notes — copy it from there when ready." };
    }
    return { ok: false, error: `Unsupported action: ${kind}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !anonKey) {
      return json({ error: "Server misconfigured: missing Supabase env vars" }, 500);
    }
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ error: "Not authenticated — sign in and try again." }, 401);

    const body = await req.json();

    if (body.action === "execute") {
      const out = await executeProposal(sb, userId, apiKey, body.proposal);
      return json(out, out.ok ? 200 : 400);
    }

    // chat mode
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: convo, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!r.ok) {
        const text = await r.text();
        return json({ error: "AI gateway error", status: r.status, detail: text }, r.status === 429 || r.status === 402 ? r.status : 500);
      }
      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return json({ error: "no message" }, 500);

      if (msg.tool_calls?.length) {
        // Intercept propose_action — return proposal to client instead of running the tool.
        const propose = msg.tool_calls.find((tc: any) => tc.function?.name === "propose_action");
        if (propose) {
          let parsed: any = {};
          try { parsed = JSON.parse(propose.function.arguments || "{}"); } catch {}
          return json({
            reply: parsed.summary || "Ready to run this — confirm?",
            proposal: parsed,
          });
        }
        // Otherwise run the search/read tools and loop.
        convo.push(msg);
        const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const out = await runTool(sb, userId, tc.function.name, parsedArgs);
          return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 40000) };
        }));
        convo.push(...results);
        continue;
      }

      return json({ reply: String(msg.content ?? "").trim() });
    }
    return json({ error: "max steps reached" }, 500);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
