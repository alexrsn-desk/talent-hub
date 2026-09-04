// Job Launch — exposed as a reusable action that calls the EXISTING Job Launch
// edge functions with the caller's own token. Nothing is rebuilt here, and
// nothing is sent: run_job_launch is a "prepare" action that returns matches
// and drafts for review. Committing a launch stays behind job-launch-send.
import { type ActionCtx, type ActionDef, ActionError, audit, unwrap, uuid, z } from "./core.ts";

async function invoke(ctx: ActionCtx, fn: string, body: unknown) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    console.error(`[action-layer] ${fn} failed`, res.status, json?.error);
    throw new ActionError("job_launch_failed", `Job Launch step "${fn}" failed`, 502);
  }
  return json;
}

export const jobLaunchActions: ActionDef[] = [
  {
    name: "run_job_launch",
    kind: "write",
    description:
      "Run the existing Desky Job Launch workflow for a job: candidate matching plus generated LinkedIn post, personal outreach, LI DMs, campaign message and client email. Returns drafts for review — it never sends anything.",
    schema: z.object({
      job_id: uuid,
      launch_hook: z.string().max(2000).optional(),
      ideal_candidate_line: z.string().max(2000).optional(),
      similar_titles: z.array(z.string().max(120)).max(20).optional(),
      key_skills: z.array(z.string().max(80)).max(40).optional(),
      max_known: z.number().int().min(0).max(50).optional(),
      max_li: z.number().int().min(0).max(50).optional(),
      generate_messages: z.boolean().optional(),
    }),
    preview: async (i, ctx) => {
      const job = unwrap(
        await ctx.db.from("jobs").select("id, title, status").eq("id", i.job_id).maybeSingle(),
        "run_job_launch",
      );
      return { affected: [job], summary: `Prepare a Job Launch for "${job.title}" (no messages will be sent)` };
    },
    handler: async (i, ctx) => {
      const job = unwrap(
        await ctx.db.from("jobs")
          .select("id, title, launch_hook, ideal_candidate_line, similar_titles, key_skills")
          .eq("id", i.job_id).maybeSingle(),
        "run_job_launch",
      );

      const shared = {
        job_id: i.job_id,
        launch_hook: i.launch_hook ?? job.launch_hook ?? undefined,
        ideal_candidate_line: i.ideal_candidate_line ?? job.ideal_candidate_line ?? undefined,
        similar_titles: i.similar_titles ?? job.similar_titles ?? [],
        key_skills: i.key_skills ?? job.key_skills ?? [],
      };

      const matches = await invoke(ctx, "job-launch-match-candidates", shared);
      // deno-lint-ignore no-explicit-any
      const pick = (list: any[] | undefined, max: number) => (list ?? []).slice(0, max).map((c: any) => c.id ?? c.candidate_id).filter(Boolean);
      const known = pick(matches.known ?? matches.spoken_to ?? matches.personal, i.max_known ?? 15);
      const li = pick(matches.li ?? matches.li_connections ?? matches.wider, i.max_li ?? 15);

      let generated = null;
      if (i.generate_messages !== false) {
        generated = await invoke(ctx, "job-launch-generate", {
          ...shared,
          known_candidate_ids: known,
          li_candidate_ids: li,
        });
      }

      await audit(ctx, "job_launch_prepared", {
        job_id: i.job_id,
        metadata: { known_count: known.length, li_count: li.length, generated: !!generated },
      });

      return {
        job: { id: job.id, title: job.title },
        matches,
        selected: { known_candidate_ids: known, li_candidate_ids: li },
        drafts: generated,
        sent: false,
        note: "Drafts only. Committing the launch and logging outreach stays with the Job Launch UI / job-launch-send.",
      };
    },
  },
];
