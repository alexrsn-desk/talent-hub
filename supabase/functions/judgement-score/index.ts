import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, callTool, gatherEvidence, evidenceToPrompt } from "../_shared/judgement.ts";

function findDealbreaker(dealbreakers: string[], haystack: string): string | null {
  const h = haystack.toLowerCase();
  for (const d of dealbreakers) {
    const term = d.trim().toLowerCase();
    if (term.length >= 3 && h.includes(term)) return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body?.job_id;
    const candidateIds: string[] = Array.isArray(body?.candidate_ids) ? body.candidate_ids.slice(0, 12) : [];
    if (!jobId || candidateIds.length === 0) {
      return json({ error: "job_id and candidate_ids are required" }, 400);
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("*, clients(company_name, sector, location)")
      .eq("id", jobId).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);

    const jobHaystack = [
      job.title, (job as any).description, (job as any).additional_context,
      (job as any).intake_summary, job.clients?.company_name, job.clients?.sector,
    ].filter(Boolean).join(" ");

    const jobBlock = `JOB: ${job.title} at ${job.clients?.company_name || "unknown client"}
Sector: ${job.clients?.sector || "?"} | Location: ${job.location || "?"} | Type: ${job.job_type}
Job spec / description: ${((job as any).description || "not provided").slice(0, 4000)}
Intake brief: ${((job as any).intake_summary || "not captured").slice(0, 2000)}
WHAT THE CLIENT ACTUALLY NEEDS BEYOND THE JD: ${(job as any).additional_context || "not captured"}`;

    const results: any[] = [];

    for (const candidateId of candidateIds) {
      const e = await gatherEvidence(supabase, candidateId);
      if (!e) continue;

      const dealbreakers = e.tags["deal_breakers"] || [];
      const hit = findDealbreaker(dealbreakers, jobHaystack);

      let row: any;
      if (hit) {
        row = {
          candidate_id: candidateId, job_id: jobId, user_id: user.id,
          score: null, reasoning: null, evidence_level: "dealbreaker", dealbreaker: hit,
          generated_at: new Date().toISOString(),
        };
      } else {
        const hasCalls = e.transcripts.length > 0;
        const hasSpecific = e.claims.some((c: any) => c.specificity !== "low");
        if (!hasCalls || (!hasSpecific && e.claims.length === 0)) {
          row = {
            candidate_id: candidateId, job_id: jobId, user_id: user.id,
            score: null, reasoning: null,
            evidence_level: hasCalls ? "thin" : "none", dealbreaker: null,
            generated_at: new Date().toISOString(),
          };
        } else {
          const { data: j } = await supabase
            .from("candidate_judgements").select("summary").eq("candidate_id", candidateId).maybeSingle();

          const system = `You assess whether a candidate would GENUINELY SUCCEED in one specific role — not whether their CV keywords match the job description.
Consider explicitly:
- Have they demonstrated the specific hard part of THIS role before?
- Does their motivation align with what this role genuinely offers?
- Does their company history suggest a comparable environment, culture and stage?
- Is the evidence specific and credible, or vague?
Low-specificity or absent evidence must pull the score down and be named in the reasoning. Never fabricate confidence.
Return a judgement score 0-100 and 2-3 sentences connecting the evidence to the role's actual needs.`;

          const user_prompt = `${jobBlock}

JUDGEMENT PROFILE for ${e.candidate.name}: ${j?.summary || "not yet generated"}

${evidenceToPrompt(e)}`;

          const out = await callTool(apiKey, system, user_prompt, {
            name: "return_judgement_score",
            description: "Return the per-role judgement score",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number" },
                reasoning: { type: "string" },
                evidence_level: { type: "string", enum: ["strong", "moderate", "thin"] },
              },
              required: ["score", "reasoning"],
            },
          });

          row = {
            candidate_id: candidateId, job_id: jobId, user_id: user.id,
            score: Math.max(0, Math.min(100, Math.round(Number(out.score) || 0))),
            reasoning: out.reasoning || null,
            evidence_level: hasSpecific ? (out.evidence_level || "moderate") : "thin",
            dealbreaker: null,
            generated_at: new Date().toISOString(),
          };
        }
      }

      await supabase.from("candidate_job_judgements").upsert(row, { onConflict: "candidate_id,job_id" });
      results.push(row);
    }

    return json({ judgements: results });
  } catch (e: any) {
    console.error("judgement-score error", e);
    return json({ error: e?.message || "Unknown error" }, e?.status || 500);
  }
});
