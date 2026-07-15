// Ask Desky — conversational AI over the recruiter's desk data.
// Uses standard OpenAI-compatible chat completions + tool calling
// (works with Gemini and Claude via Lovable AI Gateway).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 6;

const SYSTEM_PROMPT = `You are "Ask Desky", a data assistant embedded in a recruitment CRM.
The recruiter can ask you anything about their desk. You have tools to query their live database.

RULES:
- Use tools to answer any question about candidates, jobs, clients, contacts, notes, placements, or activity. Never invent data.
- Prefer specific filters (job title, sector, location, salary range) over broad queries.
- When returning lists of candidates or contacts, keep the summary tight and ALWAYS include the ids in a fenced JSON block at the end like:
  \`\`\`json
  {"kind":"candidate_list","items":[{"id":"...","name":"...","title":"...","employer":"...","location":"...","salary":65000}]}
  \`\`\`
  The UI renders these as compact cards.
- For salary surveys, market reports, or content pieces: use tools to gather data first, then produce clean markdown with clear section headers, bullet points, and numbers. Include the recruiter's name at the top when generating a report. End with the "indicative only" disclaimer.
- Do NOT include GDPR-deleted candidates or contacts marked Do Not Contact in outreach suggestions.
- Remember context within the conversation — follow-ups like "which of those are in London" should filter the previous result.
- Keep responses concise. Recruiters skim.
- Use markdown for readability (bold, bullets, small headers).`;

// ---- tool definitions (OpenAI-compatible JSON schema) ----
const TOOLS = [
  {
    type: "function",
    function: {
      name: "query_candidates",
      description: "Search candidates. Combine any filters. Returns id, name, current job title, current employer, location, sector, salary expectation, availability, status, note excerpt, skills.",
      parameters: {
        type: "object",
        properties: {
          job_title_contains: { type: "string" },
          employer_contains: { type: "string" },
          location_contains: { type: "string" },
          sector_contains: { type: "string" },
          skills_contains: { type: "string", description: "text to search inside skills / motivations / sector_preference / notes / summary" },
          status: { type: "string" },
          salary_min: { type: "number" },
          salary_max: { type: "number" },
          not_contacted_days: { type: "number", description: "only include candidates with no activity for at least N days" },
          limit: { type: "number", description: "default 50, max 200" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_jobs",
      description: "Search jobs / roles the recruiter is working on.",
      parameters: {
        type: "object",
        properties: {
          title_contains: { type: "string" },
          client_contains: { type: "string" },
          status: { type: "string", description: "e.g. Active, On Hold, Filled, Closed" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_clients",
      description: "Search clients / companies.",
      parameters: {
        type: "object",
        properties: {
          company_contains: { type: "string" },
          sector_contains: { type: "string" },
          status: { type: "string" },
          not_contacted_days: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Search individual contacts at client companies.",
      parameters: {
        type: "object",
        properties: {
          name_contains: { type: "string" },
          company_contains: { type: "string" },
          not_contacted_days: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_notes",
      description: "Search call notes / transcripts by keyword. Returns note excerpts with linked candidate / client / job.",
      parameters: {
        type: "object",
        properties: {
          contains: { type: "string" },
          candidate_id: { type: "string" },
          client_id: { type: "string" },
          job_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["contains"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_placements",
      description: "Fetch placements (deals done). Use for fee, time-to-fill, and history questions.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          since_date: { type: "string", description: "ISO date" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_candidates",
      description: "Group and count/average candidates. e.g. average salary by seniority. Returns a breakdown array.",
      parameters: {
        type: "object",
        properties: {
          group_by: { type: "string", enum: ["job_title", "current_employer", "location", "sector", "status", "availability"] },
          job_title_contains: { type: "string" },
          location_contains: { type: "string" },
          sector_contains: { type: "string" },
          metric: { type: "string", enum: ["count", "avg_salary", "salary_range"] },
        },
        required: ["group_by", "metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recruiter_profile",
      description: "Fetch the recruiter's own profile (name, agency) for report headers.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---- tool executors ----
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function runTool(sb: any, userId: string, name: string, args: any): Promise<any> {
  const cap = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
  const own = (q: any) => q.eq("owner_user_id", userId);

  try {
    if (name === "query_candidates") {
      let q = sb
        .from("candidates")
        .select("id,name,first_name,last_name,current_job_title,job_title,current_employer,location,sector,skills,motivations,sector_preference,salary_expectation,availability,notice_period,status,note,summary,do_not_contact,gdpr_deleted,updated_at")
        .eq("do_not_contact", false)
        .eq("gdpr_deleted", false)
        .limit(cap);
      q = own(q);
      if (args.job_title_contains) q = q.or(`current_job_title.ilike.%${args.job_title_contains}%,job_title.ilike.%${args.job_title_contains}%`);
      if (args.employer_contains) q = q.ilike("current_employer", `%${args.employer_contains}%`);
      if (args.location_contains) q = q.ilike("location", `%${args.location_contains}%`);
      if (args.sector_contains) q = q.or(`sector.ilike.%${args.sector_contains}%,sector_preference.ilike.%${args.sector_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      if (typeof args.salary_min === "number") q = q.gte("salary_expectation", args.salary_min);
      if (typeof args.salary_max === "number") q = q.lte("salary_expectation", args.salary_max);
      if (args.skills_contains) {
        const s = args.skills_contains;
        q = q.or(`skills.ilike.%${s}%,motivations.ilike.%${s}%,note.ilike.%${s}%,summary.ilike.%${s}%,sector_preference.ilike.%${s}%`);
      }
      if (typeof args.not_contacted_days === "number") q = q.lt("updated_at", daysAgoIso(args.not_contacted_days));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, candidates: data };
    }

    if (name === "query_jobs") {
      let q = sb.from("jobs").select("id,title,status,location,salary_min,salary_max,job_type,fee_type,fee_value,date_opened,description,clients(id,company_name)").limit(cap);
      q = own(q);
      if (args.title_contains) q = q.ilike("title", `%${args.title_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) return { error: error.message };
      let jobs = data || [];
      if (args.client_contains) {
        const c = args.client_contains.toLowerCase();
        jobs = jobs.filter((j: any) => j.clients?.company_name?.toLowerCase().includes(c));
      }
      return { count: jobs.length, jobs };
    }

    if (name === "query_clients") {
      let q = sb.from("clients").select("id,company_name,contact_name,sector,status,last_activity_date,next_action,next_action_due_date").limit(cap);
      q = own(q);
      if (args.company_contains) q = q.ilike("company_name", `%${args.company_contains}%`);
      if (args.sector_contains) q = q.ilike("sector", `%${args.sector_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      if (typeof args.not_contacted_days === "number") {
        q = q.or(`last_activity_date.lt.${daysAgoIso(args.not_contacted_days).split("T")[0]},last_activity_date.is.null`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, clients: data };
    }

    if (name === "query_contacts") {
      let q = sb.from("contacts").select("id,name,first_name,last_name,job_title,email,phone,linkedin_url,do_not_contact,last_contacted_at,client_id,clients:client_id(company_name)").eq("do_not_contact", false).limit(cap);
      q = own(q);
      if (args.name_contains) q = q.ilike("name", `%${args.name_contains}%`);
      if (typeof args.not_contacted_days === "number") {
        q = q.or(`last_contacted_at.lt.${daysAgoIso(args.not_contacted_days)},last_contacted_at.is.null`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      let contacts = data || [];
      if (args.company_contains) {
        const c = args.company_contains.toLowerCase();
        contacts = contacts.filter((x: any) => x.clients?.company_name?.toLowerCase().includes(c));
      }
      return { count: contacts.length, contacts };
    }

    if (name === "query_notes") {
      let q = sb.from("notes").select("id,candidate_id,client_id,job_id,content,activity_type,outcome,follow_up_date,created_at,candidates(name),clients(company_name)").ilike("content", `%${args.contains}%`).order("created_at", { ascending: false }).limit(cap);
      q = own(q);
      if (args.candidate_id) q = q.eq("candidate_id", args.candidate_id);
      if (args.client_id) q = q.eq("client_id", args.client_id);
      if (args.job_id) q = q.eq("job_id", args.job_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, notes: data };
    }

    if (name === "query_placements") {
      let q = sb.from("placements").select("id,candidate_name_snapshot,client_name_snapshot,job_title_snapshot,fee_amount,fee_percentage,salary_placed_at,start_date,offer_accepted_date,status,invoice_status").limit(cap);
      q = own(q);
      if (args.status) q = q.eq("status", args.status);
      if (args.since_date) q = q.gte("offer_accepted_date", args.since_date);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, placements: data };
    }

    if (name === "aggregate_candidates") {
      let q = sb.from("candidates").select("current_job_title,job_title,current_employer,location,sector,status,availability,salary_expectation").eq("do_not_contact", false).eq("gdpr_deleted", false).limit(2000);
      q = own(q);
      if (args.job_title_contains) q = q.or(`current_job_title.ilike.%${args.job_title_contains}%,job_title.ilike.%${args.job_title_contains}%`);
      if (args.location_contains) q = q.ilike("location", `%${args.location_contains}%`);
      if (args.sector_contains) q = q.ilike("sector", `%${args.sector_contains}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = data || [];
      const key = (r: any) => {
        if (args.group_by === "job_title") return r.current_job_title || r.job_title || "Unknown";
        return r[args.group_by] || "Unknown";
      };
      const buckets: Record<string, number[]> = {};
      for (const r of rows) {
        const k = key(r);
        if (!buckets[k]) buckets[k] = [];
        if (r.salary_expectation) buckets[k].push(Number(r.salary_expectation));
        else buckets[k].push(NaN);
      }
      const breakdown = Object.entries(buckets).map(([k, arr]) => {
        const nums = arr.filter((n) => !isNaN(n));
        const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
        const min = nums.length ? Math.min(...nums) : null;
        const max = nums.length ? Math.max(...nums) : null;
        return { group: k, count: arr.length, avg_salary: avg, salary_min: min, salary_max: max };
      }).sort((a, b) => b.count - a.count);
      return { total: rows.length, breakdown };
    }

    if (name === "get_recruiter_profile") {
      const { data } = await sb.from("recruiter_profiles").select("display_name,agency_name,brand_color").eq("user_id", userId).maybeSingle();
      return { profile: data };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

// ---- main handler ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const { messages, conversation_id } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Persist the latest user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    let convoId = conversation_id as string | null;
    if (!convoId) {
      const title = String(lastUser?.content || "New conversation").slice(0, 80);
      const { data: created } = await admin.from("ask_desky_conversations").insert({ owner_user_id: userId, title }).select("id").single();
      convoId = created?.id ?? null;
    }
    if (convoId && lastUser) {
      await admin.from("ask_desky_messages").insert({ conversation_id: convoId, owner_user_id: userId, role: "user", content: String(lastUser.content ?? "") });
      await admin.from("ask_desky_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId);
    }

    // Working conversation for the model
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    // Tool-calling loop (non-streaming; we stream the final answer)
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: convo, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!r.ok) {
        const text = await r.text();
        return new Response(JSON.stringify({ error: "AI gateway error", status: r.status, detail: text }), {
          status: r.status === 429 || r.status === 402 ? r.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ error: "no message" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (msg.tool_calls?.length) {
        convo.push(msg);
        const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const out = await runTool(admin, userId, tc.function.name, parsedArgs);
          return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 60000) };
        }));
        convo.push(...results);
        continue;
      }

      // Final content — persist and return
      const finalText = String(msg.content ?? "");
      if (convoId) {
        await admin.from("ask_desky_messages").insert({ conversation_id: convoId, owner_user_id: userId, role: "assistant", content: finalText });
      }
      return new Response(JSON.stringify({ content: finalText, conversation_id: convoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "max steps reached", conversation_id: convoId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
