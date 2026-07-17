// Desky AI Assistant — read-only search & retrieval.
// Write actions are intentionally disabled until the backend is rebuilt.
// POST { action: "chat", messages } -> { reply }

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

const WRITE_REFUSAL = "I can't do that just yet — but I can help you find what you need. Try asking me to search or retrieve information instead.";

const SYSTEM_PROMPT = `You are Desky, a smart recruiting PA inside the recruiter's CRM.

RIGHT NOW YOU ARE READ-ONLY. You can search and retrieve information. You cannot add, move, update, create, flag, remind, send, draft or change anything.

VOICE
- Short, casual, direct. Like texting a smart assistant. No preamble, no "Certainly!".
- Two sentences max unless the recruiter asked a real question that needs more.
- Plain English. Never expose technical or database errors — if a tool fails, just say you couldn't find that and suggest rephrasing.

WHAT YOU DO
- Answer questions about candidates, jobs, clients and pipeline state.
- Use the search / list tools to resolve fuzzy names and pull data. Recruiters won't spell exact names.
- If a name is ambiguous, ask ONE short clarifying question — don't guess.
- When listing candidates on a pipeline, show name, current title/employer if known, and the stage.

WRITE REQUESTS
If the recruiter asks you to do anything that would change data — add/move/update candidates, send or draft messages, create notes/reminders, flag records, update details — respond EXACTLY with:
"${WRITE_REFUSAL}"
Do not attempt it. Do not offer a workaround beyond that line.

STAGES (exact spelling): ${STAGES.join(", ")}
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_candidates",
      description: "Fuzzy search candidates by name / current title / current employer. Returns up to 12 matches.",
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
      description: "Fuzzy search jobs by title. Defaults to active only. Pass active_only:false to include all.",
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
      name: "list_active_jobs",
      description: "List all currently active jobs (status = Active). Use for 'what jobs are live' style questions.",
      parameters: { type: "object", properties: {} },
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
      description: "List candidates on a job's pipeline. Optional stage filter (e.g. 'Offer', 'Second Interview').",
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
      name: "find_candidate_pipeline",
      description: "Given a candidate_id, list every job/stage they currently sit on.",
      parameters: {
        type: "object",
        properties: { candidate_id: { type: "string" } },
        required: ["candidate_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "candidates_at_stage_global",
      description: "Find every candidate at a given stage across ALL jobs. Use for 'who's at final stage', 'who's at offer', etc. Final stage = Second Interview + Offer.",
      parameters: {
        type: "object",
        properties: { stage: { type: "string" }, stages: { type: "array", items: { type: "string" } } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "candidates_added_to_job_recently",
      description: "List candidates added to a specific job within the last N days (default 7).",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string" }, days: { type: "number" } },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_candidate_details",
      description: "Get a candidate's full details by id — name, contact, title, employer, notes, tags.",
      parameters: {
        type: "object",
        properties: { candidate_id: { type: "string" } },
        required: ["candidate_id"],
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

async function runTool(sb: any, _userId: string, name: string, args: any) {
  try {
    if (name === "search_candidates") {
      const q = String(args.query || "").trim();
      if (!q) return { rows: [] };
      const { data } = await sb
        .from("candidates")
        .select("id,name,first_name,last_name,job_title,current_employer,email,location")
        .or(`name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,job_title.ilike.%${q}%,current_employer.ilike.%${q}%`)
        .limit(12);
      return { rows: data ?? [] };
    }
    if (name === "search_jobs") {
      let q = sb.from("jobs")
        .select("id,title,status,client_id,clients(company_name)")
        .ilike("title", `%${String(args.query || "")}%`)
        .limit(12);
      if (args.active_only !== false) q = q.eq("status", "Active");
      const { data } = await q;
      return {
        rows: (data ?? []).map((j: any) => ({
          id: j.id, title: j.title, status: j.status,
          client_company: j.clients?.company_name ?? null,
        })),
      };
    }
    if (name === "list_active_jobs") {
      const { data } = await sb.from("jobs")
        .select("id,title,status,clients(company_name)")
        .eq("status", "Active")
        .order("created_at", { ascending: false })
        .limit(50);
      return {
        rows: (data ?? []).map((j: any) => ({
          id: j.id, title: j.title, client_company: j.clients?.company_name ?? null,
        })),
      };
    }
    if (name === "search_clients") {
      const { data } = await sb.from("clients")
        .select("id,company_name,status")
        .ilike("company_name", `%${String(args.query || "")}%`)
        .limit(12);
      return { rows: data ?? [] };
    }
    if (name === "get_pipeline_for_job") {
      let q = sb.from("candidate_jobs")
        .select("id,stage,candidate_id,created_at,candidates(name,job_title,current_employer)")
        .eq("job_id", args.job_id);
      if (args.stage) q = q.eq("stage", args.stage);
      const { data } = await q;
      return { rows: data ?? [] };
    }
    if (name === "find_candidate_pipeline") {
      const { data } = await sb.from("candidate_jobs")
        .select("id,stage,job_id,jobs(title,clients(company_name))")
        .eq("candidate_id", args.candidate_id);
      return {
        rows: (data ?? []).map((r: any) => ({
          stage: r.stage,
          job_id: r.job_id,
          job_title: r.jobs?.title ?? null,
          client_company: r.jobs?.clients?.company_name ?? null,
        })),
      };
    }
    if (name === "candidates_at_stage_global") {
      const stages: string[] = Array.isArray(args.stages) && args.stages.length
        ? args.stages
        : args.stage ? [args.stage] : [];
      if (!stages.length) return { rows: [] };
      const { data } = await sb.from("candidate_jobs")
        .select("stage,candidate_id,job_id,candidates(name,job_title),jobs(title,clients(company_name))")
        .in("stage", stages)
        .limit(100);
      return {
        rows: (data ?? []).map((r: any) => ({
          stage: r.stage,
          candidate_id: r.candidate_id,
          candidate_name: r.candidates?.name ?? null,
          job_title: r.jobs?.title ?? null,
          client_company: r.jobs?.clients?.company_name ?? null,
        })),
      };
    }
    if (name === "candidates_added_to_job_recently") {
      const days = Number(args.days) > 0 ? Number(args.days) : 7;
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { data } = await sb.from("candidate_jobs")
        .select("stage,candidate_id,created_at,candidates(name,job_title,current_employer)")
        .eq("job_id", args.job_id)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      return { rows: data ?? [] };
    }
    if (name === "get_candidate_details") {
      const { data } = await sb.from("candidates")
        .select("id,name,first_name,last_name,email,phone,job_title,current_employer,location,linkedin_url,note,status,salary_expectation,notice_period")
        .eq("id", args.candidate_id)
        .maybeSingle();
      return { row: data ?? null };
    }
    return { error: `unknown tool ${name}` };
  } catch (_e: any) {
    return { rows: [], error: "lookup_failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ reply: "Assistant isn't configured yet — try again shortly." }, 200);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !anonKey) {
      return json({ reply: "Assistant isn't configured yet — try again shortly." }, 200);
    }
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ error: "Not authenticated — sign in and try again." }, 401);

    const body = await req.json();

    // Write actions are disabled. Any legacy execute call gets the same refusal.
    if (body.action === "execute") {
      return json({ ok: false, error: WRITE_REFUSAL }, 200);
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: convo, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!r.ok) {
        return json({ reply: "I couldn't reach the assistant just now — try again in a moment." }, 200);
      }
      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return json({ reply: "I didn't catch that — try rephrasing?" }, 200);

      if (msg.tool_calls?.length) {
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
    return json({ reply: "That took too many steps — try asking it more directly?" }, 200);
  } catch (_e: any) {
    return json({ reply: "Something went sideways on my end — try that again?" }, 200);
  }
});
