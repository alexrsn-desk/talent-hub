// Public webhook endpoint — receives records from Zapier / Make / Vincere etc.
// Auth: x-webhook-key header must match webhook_settings.secret_key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- helpers ----------
function splitName(full?: string): { first?: string; last?: string } {
  if (!full) return {};
  const trimmed = full.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

function parseSalary(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).toLowerCase().replace(/[£$,€\s]/g, "");
  const m = s.match(/^([\d.]+)\s*(k|m)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  if (m[2] === "k") n *= 1000;
  if (m[2] === "m") n *= 1_000_000;
  return Math.round(n);
}

function mapCandidateStatus(raw?: string): { status: string; priority: boolean } {
  const s = (raw || "").trim().toLowerCase();
  if (s === "hot") return { status: "Active", priority: true };
  if (s === "do not contact" || s === "dnc") return { status: "Do Not Contact", priority: false };
  if (s === "passive") return { status: "Passive", priority: false };
  if (s === "active") return { status: "Active", priority: false };
  return { status: "New", priority: false };
}

function mapJobStatus(raw?: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (["closed", "filled"].includes(s)) return "Filled";
  if (s === "on hold") return "On Hold";
  if (["open", "active"].includes(s)) return "Open";
  return "Open";
}

function mapJobType(raw?: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (s.startsWith("contract") || s === "temp") return "Contract";
  return "Perm";
}

const STAGE_MAP: Record<string, string> = {
  "new": "Longlist",
  "applied": "Longlist",
  "shortlisted": "Longlist",
  "longlist": "Longlist",
  "screening": "Screening",
  "sent": "Submitted",
  "submitted": "Submitted",
  "client review": "Client Review",
  "interview": "First Interview",
  "1st interview": "First Interview",
  "first interview": "First Interview",
  "2nd interview": "Second Interview",
  "second interview": "Second Interview",
  "offer": "Offer",
  "placed": "Placed",
  "rejected": "Rejected",
  "withdrawn": "Rejected",
};

function mapStage(raw?: string): { stage: string; defaulted: boolean; withdrawn: boolean } {
  const s = (raw || "").trim().toLowerCase();
  const stage = STAGE_MAP[s];
  return {
    stage: stage || "Longlist",
    defaulted: !stage,
    withdrawn: s === "withdrawn",
  };
}

function syncedNoteLabel(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `Synced from Vincere — ${d}`;
}

// Find owner user_id from x-webhook-key header
async function authenticate(req: Request): Promise<string | null> {
  const key = req.headers.get("x-webhook-key");
  if (!key) return null;
  const { data } = await supabase
    .from("webhook_settings")
    .select("user_id")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.user_id ?? null;
}

// Fuzzy company match — exact first, then case-insensitive contains
async function matchClient(name?: string): Promise<{ id?: string; confidence: "exact" | "fuzzy" | "none" }> {
  if (!name) return { confidence: "none" };
  const trimmed = name.trim();
  const { data: exact } = await supabase
    .from("clients")
    .select("id, company_name")
    .ilike("company_name", trimmed)
    .limit(1)
    .maybeSingle();
  if (exact) return { id: exact.id, confidence: "exact" };
  const { data: fuzzy } = await supabase
    .from("clients")
    .select("id, company_name")
    .ilike("company_name", `%${trimmed}%`)
    .limit(1)
    .maybeSingle();
  if (fuzzy) return { id: fuzzy.id, confidence: "fuzzy" };
  return { confidence: "none" };
}

async function createNote(opts: {
  candidate_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  content: string;
  runSignals: boolean;
}) {
  const noteContent = `[${syncedNoteLabel()}]\n\n${opts.content}`;
  const { data: note } = await supabase
    .from("notes")
    .insert({
      candidate_id: opts.candidate_id ?? null,
      client_id: opts.client_id ?? null,
      job_id: opts.job_id ?? null,
      content: noteContent,
      activity_type: "Note",
    })
    .select()
    .single();
  if (note && opts.runSignals) {
    // Fire-and-forget signal detection + insight extraction
    try {
      await Promise.allSettled([
        supabase.functions.invoke("detect-signals", { body: { note_id: note.id } }),
        supabase.functions.invoke("extract-insights", { body: { note_id: note.id } }),
      ]);
    } catch (_) { /* ignore */ }
  }
  return note;
}

async function logActivity(action: string, meta: Record<string, any>, ids: {
  candidate_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  candidate_job_id?: string | null;
  user_id?: string | null;
}) {
  await supabase.from("activity_log").insert({
    user_id: ids.user_id ?? null,
    action_type: action,
    candidate_id: ids.candidate_id ?? null,
    client_id: ids.client_id ?? null,
    job_id: ids.job_id ?? null,
    candidate_job_id: ids.candidate_job_id ?? null,
    metadata: meta,
  });
}

// ---------- entity processors ----------

async function processCandidate(data: any, action: string, settings: any, userId: string) {
  const names = (data.first_name || data.last_name)
    ? { first: data.first_name, last: data.last_name }
    : splitName(data.full_name || data.name);
  const fullName = [names.first, names.last].filter(Boolean).join(" ").trim() || data.name || "Unknown";
  const email = data.email || data.email_work || null;
  const { status, priority } = mapCandidateStatus(data.status);

  // Dedupe: email first, then name+employer
  let existing: any = null;
  if (email) {
    const { data: byEmail } = await supabase
      .from("candidates").select("*").ilike("email", email).limit(1).maybeSingle();
    existing = byEmail;
  }
  if (!existing && fullName && data.current_employer) {
    const { data: byName } = await supabase
      .from("candidates").select("*")
      .ilike("name", fullName).ilike("current_employer", data.current_employer)
      .limit(1).maybeSingle();
    existing = byName;
  }

  const fields: Record<string, any> = {
    name: fullName,
    first_name: names.first ?? null,
    last_name: names.last ?? null,
    job_title: data.job_title ?? null,
    current_employer: data.current_employer ?? null,
    email,
    phone: data.phone || data.phone_work || null,
    linkedin_url: data.linkedin_url ?? null,
    location: data.location ?? null,
    salary_current: parseSalary(data.current_salary ?? data.salary_current),
    salary_expectation: parseSalary(data.salary_expectation),
    notice_period: data.notice_period ?? null,
    availability: data.availability ?? null,
    status,
    source: data.source || "Webhook",
  };

  let recordId: string;
  let created = false;
  if (existing) {
    // Don't overwrite priority_flag, summary if already set
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "" && existing[k] !== v) update[k] = v;
    }
    if (priority && !existing.priority_flag) {
      update.priority_flag = true;
      update.priority_flagged_at = new Date().toISOString();
    }
    // Summary: only if empty
    if (data.summary && !existing.summary) update.summary = data.summary;

    if (Object.keys(update).length) {
      await supabase.from("candidates").update(update).eq("id", existing.id);
    }
    recordId = existing.id;
  } else {
    if (priority) {
      fields.priority_flag = true;
      fields.priority_flagged_at = new Date().toISOString();
    }
    if (data.summary) fields.summary = data.summary;
    const { data: ins, error } = await supabase.from("candidates").insert(fields).select().single();
    if (error || !ins) throw new Error(error?.message || "Candidate insert failed");
    recordId = ins.id;
    created = true;
  }

  if (data.notes) {
    await createNote({
      candidate_id: recordId,
      content: data.notes,
      runSignals: settings.run_signal_detection,
    });
  }

  if (settings.show_in_activity_feed) {
    await logActivity(
      created ? "candidate_created" : "candidate_updated",
      { source: "webhook", action },
      { candidate_id: recordId, user_id: userId },
    );
  }

  return { id: recordId, name: fullName, created };
}

async function processClient(data: any, action: string, settings: any, userId: string) {
  const companyName = data.company_name || data.name;
  if (!companyName) throw new Error("company_name required");

  const { data: existing } = await supabase
    .from("clients").select("*")
    .ilike("company_name", companyName).limit(1).maybeSingle();

  const fields: Record<string, any> = {
    company_name: companyName,
    website: data.website ?? null,
    phone: data.phone ?? null,
    location: data.location ?? null,
    sector: data.sector || data.industry || null,
    status: data.status || "Target",
    linkedin_url: data.linkedin_url ?? null,
  };

  let recordId: string;
  let created = false;
  if (existing) {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "" && existing[k] !== v) update[k] = v;
    }
    const brief = data.description || data.summary;
    if (brief && !existing.summary) update.summary = brief;
    if (Object.keys(update).length) {
      await supabase.from("clients").update(update).eq("id", existing.id);
    }
    recordId = existing.id;
  } else {
    const brief = data.description || data.summary;
    if (brief) fields.summary = brief;
    const { data: ins, error } = await supabase.from("clients").insert(fields).select().single();
    if (error || !ins) throw new Error(error?.message || "Client insert failed");
    recordId = ins.id;
    created = true;
  }

  if (data.notes) {
    await createNote({
      client_id: recordId,
      content: data.notes,
      runSignals: settings.run_signal_detection,
    });
  }

  if (settings.show_in_activity_feed) {
    await logActivity(
      created ? "client_created" : "client_updated",
      { source: "webhook", action },
      { client_id: recordId, user_id: userId },
    );
  }

  return { id: recordId, name: companyName, created };
}

async function processContact(data: any, action: string, settings: any, userId: string) {
  const names = (data.first_name || data.last_name)
    ? { first: data.first_name, last: data.last_name }
    : splitName(data.full_name || data.name);
  const fullName = [names.first, names.last].filter(Boolean).join(" ").trim() || data.name || "Unknown";
  const email = data.email || data.email_work || null;

  // Match company
  const match = await matchClient(data.company);
  let clientId = match.id;
  let flagged = false;

  if (!clientId) {
    if (settings.auto_create_clients && data.company) {
      const { data: newClient } = await supabase
        .from("clients").insert({ company_name: data.company, status: "Target" })
        .select().single();
      clientId = newClient?.id;
    } else {
      flagged = true;
    }
  } else if (match.confidence === "fuzzy") {
    flagged = true; // low-confidence fuzzy
  }

  if (!clientId) throw new Error("Contact requires a client_id (no company match and auto-create disabled)");

  // Dedupe
  let existing: any = null;
  if (email) {
    const { data: byEmail } = await supabase
      .from("contacts").select("*").ilike("email", email).limit(1).maybeSingle();
    existing = byEmail;
  }
  if (!existing) {
    const { data: byName } = await supabase
      .from("contacts").select("*")
      .ilike("name", fullName).eq("client_id", clientId)
      .limit(1).maybeSingle();
    existing = byName;
  }

  const fields: Record<string, any> = {
    client_id: clientId,
    name: fullName,
    first_name: names.first ?? null,
    last_name: names.last ?? null,
    job_title: data.job_title ?? null,
    email,
    personal_email: data.personal_email ?? null,
    phone: data.phone || data.phone_work || null,
    mobile_phone: data.mobile || data.phone_mobile || null,
    linkedin_url: data.linkedin_url ?? null,
    status: data.status || "Active",
  };

  let recordId: string;
  let created = false;
  if (existing) {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "" && existing[k] !== v) update[k] = v;
    }
    if (data.summary && !existing.summary) update.summary = data.summary;
    if (Object.keys(update).length) {
      await supabase.from("contacts").update(update).eq("id", existing.id);
    }
    recordId = existing.id;
  } else {
    if (data.summary) fields.summary = data.summary;
    const { data: ins, error } = await supabase.from("contacts").insert(fields).select().single();
    if (error || !ins) throw new Error(error?.message || "Contact insert failed");
    recordId = ins.id;
    created = true;
  }

  if (data.notes) {
    await createNote({
      client_id: clientId,
      content: data.notes,
      runSignals: settings.run_signal_detection,
    });
  }

  if (settings.show_in_activity_feed) {
    await logActivity(
      created ? "contact_created" : "contact_updated",
      { source: "webhook", action, flagged_for_review: flagged },
      { client_id: clientId, user_id: userId },
    );
  }

  return { id: recordId, name: fullName, created, flagged };
}

async function processJob(data: any, action: string, settings: any, userId: string) {
  const title = data.title;
  if (!title) throw new Error("title required");

  const match = await matchClient(data.company);
  let clientId = match.id;
  if (!clientId && settings.auto_create_clients && data.company) {
    const { data: newClient } = await supabase
      .from("clients").insert({ company_name: data.company, status: "Target" })
      .select().single();
    clientId = newClient?.id;
  }

  // Dedupe by title + client
  let existing: any = null;
  if (clientId) {
    const { data } = await supabase
      .from("jobs").select("*")
      .ilike("title", title).eq("client_id", clientId)
      .limit(1).maybeSingle();
    existing = data;
  }

  const fields: Record<string, any> = {
    title,
    client_id: clientId ?? null,
    status: mapJobStatus(data.status),
    salary_min: parseSalary(data.salary_from ?? data.salary_min),
    salary_max: parseSalary(data.salary_to ?? data.salary_max),
    location: data.location ?? null,
    job_type: mapJobType(data.job_type),
  };

  let recordId: string;
  let created = false;
  if (existing) {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "" && existing[k] !== v) update[k] = v;
    }
    if (Object.keys(update).length) {
      await supabase.from("jobs").update(update).eq("id", existing.id);
    }
    recordId = existing.id;
  } else {
    const { data: ins, error } = await supabase.from("jobs").insert(fields).select().single();
    if (error || !ins) throw new Error(error?.message || "Job insert failed");
    recordId = ins.id;
    created = true;
  }

  if (data.description || data.notes) {
    await createNote({
      job_id: recordId,
      content: data.description || data.notes,
      runSignals: settings.run_signal_detection,
    });
  }

  if (settings.show_in_activity_feed) {
    await logActivity(
      created ? "job_created" : "job_updated",
      { source: "webhook", action },
      { job_id: recordId, user_id: userId },
    );
  }

  return { id: recordId, name: title, created };
}

async function processApplication(data: any, action: string, settings: any, userId: string) {
  // Match candidate
  let candidateId: string | undefined;
  if (data.candidate_email) {
    const { data: c } = await supabase.from("candidates")
      .select("id, name").ilike("email", data.candidate_email).limit(1).maybeSingle();
    candidateId = c?.id;
  }
  if (!candidateId && data.candidate_name) {
    const { data: list } = await supabase.from("candidates")
      .select("id, name").ilike("name", data.candidate_name).limit(2);
    if (list && list.length === 1) candidateId = list[0].id;
    else if (list && list.length > 1) throw new Error(`Ambiguous candidate match for "${data.candidate_name}"`);
  }
  if (!candidateId) {
    // Create candidate first
    const created = await processCandidate(
      { full_name: data.candidate_name, email: data.candidate_email },
      "create", settings, userId,
    );
    candidateId = created.id;
  }

  // Match job by title (+ company if provided)
  let jobId: string | undefined;
  if (data.job_title) {
    let q = supabase.from("jobs").select("id, title, client_id").ilike("title", data.job_title);
    const list = await q.limit(5);
    let candidates = list.data || [];
    if (data.company && candidates.length > 1) {
      const cm = await matchClient(data.company);
      if (cm.id) candidates = candidates.filter(j => j.client_id === cm.id);
    }
    if (candidates.length >= 1) jobId = candidates[0].id;
  }
  if (!jobId) throw new Error(`No job matched for "${data.job_title}"`);

  const stageInfo = mapStage(data.stage);

  // Existing link?
  const { data: existing } = await supabase.from("candidate_jobs")
    .select("*").eq("candidate_id", candidateId).eq("job_id", jobId).maybeSingle();

  let cjId: string;
  let created = false;
  if (existing) {
    // Don't overwrite stage if changed in Desky — only update if action explicitly create+stage missing
    const update: Record<string, any> = {};
    if (data.application_date) update.created_at = new Date(data.application_date).toISOString();
    if (Object.keys(update).length) {
      await supabase.from("candidate_jobs").update(update).eq("id", existing.id);
    }
    cjId = existing.id;
  } else {
    const { data: ins, error } = await supabase.from("candidate_jobs").insert({
      candidate_id: candidateId,
      job_id: jobId,
      stage: stageInfo.stage,
      source: "webhook",
    }).select().single();
    if (error || !ins) throw new Error(error?.message || "Application insert failed");
    cjId = ins.id;
    created = true;
  }

  const noteParts: string[] = [];
  if (stageInfo.defaulted) noteParts.push(`Unknown stage "${data.stage}" defaulted to Longlist`);
  if (stageInfo.withdrawn) noteParts.push("Candidate withdrew");
  if (data.notes) noteParts.push(data.notes);
  if (noteParts.length) {
    await createNote({
      candidate_id: candidateId,
      job_id: jobId,
      content: noteParts.join("\n\n"),
      runSignals: settings.run_signal_detection,
    });
  }

  if (settings.show_in_activity_feed) {
    await logActivity(
      created ? "candidate_job_linked" : "stage_change",
      { source: "webhook", action, stage: stageInfo.stage, defaulted: stageInfo.defaulted },
      { candidate_id: candidateId, job_id: jobId, candidate_job_id: cjId, user_id: userId },
    );
  }

  return { id: cjId, name: `${data.candidate_name || ""} → ${data.job_title || ""}`.trim(), created };
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let entityType = "unknown";
  let action = "unknown";
  let userId: string | null = null;
  let payload: any = null;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    userId = await authenticate(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid or missing webhook key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    entityType = String(payload.entity_type || "").toLowerCase();
    action = String(payload.action || "create").toLowerCase();
    const data = payload.data || {};

    // Load settings
    const { data: settings } = await supabase
      .from("webhook_settings").select("*").eq("user_id", userId).maybeSingle();
    const effectiveSettings = settings || {
      auto_create_clients: true,
      run_signal_detection: true,
      show_in_activity_feed: true,
    };

    let result;
    switch (entityType) {
      case "candidate":
        result = await processCandidate(data, action, effectiveSettings, userId); break;
      case "contact":
        result = await processContact(data, action, effectiveSettings, userId); break;
      case "client":
      case "company":
        result = await processClient(data, action, effectiveSettings, userId); break;
      case "job":
        result = await processJob(data, action, effectiveSettings, userId); break;
      case "application":
        result = await processApplication(data, action, effectiveSettings, userId); break;
      default:
        throw new Error(`Unknown entity_type: ${entityType}`);
    }

    // Reset failure counter
    await supabase.from("webhook_settings")
      .update({ consecutive_failures: 0 }).eq("user_id", userId);

    await supabase.from("webhook_logs").insert({
      user_id: userId,
      entity_type: entityType,
      action: result.created ? "create" : "update",
      status: "success",
      record_id: result.id,
      record_name: result.name,
      processing_ms: Date.now() - startedAt,
      payload,
    });

    return new Response(JSON.stringify({
      success: true,
      entity_type: entityType,
      action: result.created ? "created" : "updated",
      record_id: result.id,
      record_name: result.name,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Webhook error:", err);
    if (userId) {
      await supabase.from("webhook_logs").insert({
        user_id: userId,
        entity_type: entityType,
        action,
        status: "error",
        error_message: err.message || String(err),
        processing_ms: Date.now() - startedAt,
        payload,
      });
      // Bump consecutive failure counter
      const { data: s } = await supabase.from("webhook_settings")
        .select("consecutive_failures").eq("user_id", userId).maybeSingle();
      await supabase.from("webhook_settings")
        .update({ consecutive_failures: (s?.consecutive_failures || 0) + 1 })
        .eq("user_id", userId);
    }
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
