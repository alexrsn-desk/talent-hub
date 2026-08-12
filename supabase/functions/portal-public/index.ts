// Token-gated public access layer for the Client & Candidate Portals.
// Anonymous visitors never query the portal_* tables directly — every read and
// write goes through this function, which validates the access token server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const STAGES = [
  "Application Submitted",
  "Reviewed",
  "First Interview",
  "Second Interview",
  "Offer",
  "Placed",
];
const INTERNAL_STAGES = ["Reviewed"];

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function signed(path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from("portal-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function str(v: unknown, max = 5000) {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body.action, 60);
    const token = str(body.token, 200);
    if (!action || !token) return json({ error: "action and token are required" }, 400);

    // ─── Client portal ────────────────────────────────────────────────
    if (action.startsWith("client_")) {
      const { data: portal } = await admin
        .from("portal_client_portals")
        .select("*")
        .eq("access_token", token)
        .maybeSingle();
      if (!portal) return json({ error: "Invalid or expired link" }, 404);

      const { data: job } = await admin
        .from("portal_jobs")
        .select("id,title,client_name,status,job_description_file,notify_candidate_on_interview,notify_candidate_on_reject")
        .eq("id", portal.job_id)
        .maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);

      switch (action) {
        case "client_get": {
          const [{ data: candidates }, { data: notes }, { data: stageContent }] = await Promise.all([
            admin.from("portal_candidates").select("id,name,email,cv_file,stage,rejected,created_at").eq("job_id", job.id).order("created_at"),
            admin.from("portal_job_notes").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
            admin.from("portal_job_stage_content").select("*").eq("job_id", job.id),
          ]);
          const ids = (candidates ?? []).map((c) => c.id);
          const [{ data: feedback }, { data: bookings }] = await Promise.all([
            ids.length
              ? admin.from("portal_feedback").select("*").in("candidate_id", ids).order("created_at", { ascending: false })
              : Promise.resolve({ data: [] as unknown[] }),
            ids.length
              ? admin.from("portal_interview_bookings").select("*").in("candidate_id", ids).order("created_at", { ascending: false })
              : Promise.resolve({ data: [] as unknown[] }),
          ]);
          const withCv = await Promise.all(
            (candidates ?? []).map(async (c) => ({ ...c, cv_url: await signed(c.cv_file) })),
          );
          return json({
            job: { ...job, job_description_url: await signed(job.job_description_file) },
            portal: {
              id: portal.id,
              client_email: portal.client_email,
              calendly_url: portal.calendly_url,
              availability_slots: portal.availability_slots,
            },
            stages: STAGES,
            candidates: withCv,
            notes: notes ?? [],
            stage_content: stageContent ?? [],
            feedback: feedback ?? [],
            bookings: bookings ?? [],
          });
        }

        case "client_set_email": {
          const email = str(body.email, 200);
          if (!email || !email.includes("@")) return json({ error: "A valid email is required" }, 400);
          await admin.from("portal_client_portals").update({ client_email: email }).eq("id", portal.id);
          return json({ ok: true });
        }

        case "client_move": {
          const candidateId = str(body.candidate_id, 60);
          const reject = body.reject === true;
          const toStage = str(body.to_stage, 60);
          if (!candidateId) return json({ error: "candidate_id is required" }, 400);
          if (!reject && !STAGES.includes(toStage)) return json({ error: "Unknown stage" }, 400);

          const { data: cand } = await admin
            .from("portal_candidates")
            .select("id,stage,rejected,job_id")
            .eq("id", candidateId)
            .maybeSingle();
          if (!cand || cand.job_id !== job.id) return json({ error: "Candidate not found" }, 404);

          const next = reject ? cand.stage : toStage;
          await admin
            .from("portal_candidates")
            .update({ stage: next, rejected: reject ? true : false })
            .eq("id", candidateId);
          await admin.from("portal_stage_history").insert({
            candidate_id: candidateId,
            from_stage: cand.stage,
            to_stage: reject ? "Rejected" : next,
            changed_by: portal.client_email || "client",
          });
          return json({ ok: true });
        }

        case "client_feedback": {
          const candidateId = str(body.candidate_id, 60);
          const stage = str(body.stage, 60);
          const comment = str(body.comment, 4000);
          const rating = Number.isFinite(body.rating) ? Math.min(5, Math.max(1, Number(body.rating))) : null;
          if (!candidateId || !comment) return json({ error: "candidate_id and comment are required" }, 400);
          if (!STAGES.includes(stage)) return json({ error: "Feedback must be tagged with a stage" }, 400);
          const { data: cand } = await admin.from("portal_candidates").select("id,job_id").eq("id", candidateId).maybeSingle();
          if (!cand || cand.job_id !== job.id) return json({ error: "Candidate not found" }, 404);
          await admin.from("portal_feedback").insert({
            candidate_id: candidateId,
            client_email: portal.client_email,
            stage,
            comment,
            rating,
          });
          return json({ ok: true });
        }

        case "client_note": {
          const noteText = str(body.note_text, 4000);
          if (!noteText) return json({ error: "note_text is required" }, 400);
          await admin.from("portal_job_notes").insert({
            job_id: job.id,
            author: portal.client_email || "client",
            note_text: noteText,
          });
          return json({ ok: true });
        }

        case "client_save_stage_content": {
          const stage = str(body.stage, 60);
          if (!STAGES.includes(stage)) return json({ error: "Unknown stage" }, 400);
          await admin.from("portal_job_stage_content").upsert(
            {
              job_id: job.id,
              stage,
              prep_content: str(body.prep_content, 8000),
              interview_details: str(body.interview_details, 8000),
            },
            { onConflict: "job_id,stage" },
          );
          return json({ ok: true });
        }

        case "client_save_scheduling": {
          const slots = Array.isArray(body.availability_slots)
            ? body.availability_slots.slice(0, 50).map((s: unknown) => str(s, 200)).filter(Boolean)
            : [];
          await admin
            .from("portal_client_portals")
            .update({ calendly_url: str(body.calendly_url, 500) || null, availability_slots: slots })
            .eq("id", portal.id);
          return json({ ok: true });
        }
      }
      return json({ error: "Unknown action" }, 400);
    }

    // ─── Candidate portal ─────────────────────────────────────────────
    if (action.startsWith("candidate_")) {
      const { data: cp } = await admin
        .from("portal_candidate_portals")
        .select("id,candidate_id")
        .eq("access_token", token)
        .maybeSingle();
      if (!cp) return json({ error: "Invalid or expired link" }, 404);

      const { data: cand } = await admin
        .from("portal_candidates")
        .select("id,name,stage,rejected,cv_file,job_id")
        .eq("id", cp.candidate_id)
        .maybeSingle();
      if (!cand) return json({ error: "Not found" }, 404);

      const { data: job } = await admin
        .from("portal_jobs")
        .select("id,title,client_name,job_description_file")
        .eq("id", cand.job_id)
        .maybeSingle();

      if (action === "candidate_get") {
        const reachedIndex = STAGES.indexOf(cand.stage);
        const [{ data: jobContent }, { data: overrides }, { data: clientPortal }, { data: bookings }] =
          await Promise.all([
            admin.from("portal_job_stage_content").select("stage,prep_content,interview_details").eq("job_id", cand.job_id),
            admin
              .from("portal_candidate_stage_overrides")
              .select("stage,prep_content,interview_details")
              .eq("candidate_id", cand.id),
            admin.from("portal_client_portals").select("calendly_url,availability_slots").eq("job_id", cand.job_id).maybeSingle(),
            admin.from("portal_interview_bookings").select("*").eq("candidate_id", cand.id).order("created_at", { ascending: false }),
          ]);

        // Progressive reveal: only stages the candidate has reached, never internal stages.
        const unlocked = STAGES.filter(
          (s, i) => i <= reachedIndex && !INTERNAL_STAGES.includes(s),
        ).map((s) => {
          const base = (jobContent ?? []).find((c) => c.stage === s);
          const over = (overrides ?? []).find((c) => c.stage === s);
          return {
            stage: s,
            prep_content: over?.prep_content || base?.prep_content || null,
            interview_details: over?.interview_details || base?.interview_details || null,
          };
        });

        return json({
          candidate: { name: cand.name, stage: cand.stage, rejected: cand.rejected },
          job: {
            title: job?.title ?? "",
            client_name: job?.client_name ?? "",
            job_description_url: await signed(job?.job_description_file ?? null),
          },
          progress: STAGES.filter((s) => !INTERNAL_STAGES.includes(s)),
          current_visible_stage: cand.stage,
          unlocked_content: unlocked,
          scheduling: {
            calendly_url: clientPortal?.calendly_url ?? null,
            availability_slots: clientPortal?.availability_slots ?? [],
          },
          bookings: bookings ?? [],
        });
      }

      if (action === "candidate_book") {
        const slot = str(body.slot_or_booking_ref, 300);
        if (!slot) return json({ error: "slot_or_booking_ref is required" }, 400);
        if (cand.rejected) return json({ error: "This process has closed" }, 400);
        await admin.from("portal_interview_bookings").insert({
          candidate_id: cand.id,
          slot_or_booking_ref: slot,
          status: "requested",
        });
        return json({ ok: true });
      }

      return json({ error: "Unknown action" }, 400);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("portal-public error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
