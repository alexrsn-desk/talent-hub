import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useJobs, useCandidateJobs, type Job, type CandidateJob, type Note } from "@/hooks/use-data";
import { computePlacementScore, type PlacementScore } from "@/lib/placement-score";

type ScoreHistoryRow = {
  job_id: string;
  score: number;
  snapshot_date: string;
};

// Fetch most recent + 7-day-old score per job in two queries.
function useScoreHistory(jobIds: string[]) {
  return useQuery({
    queryKey: ["job-score-history", jobIds.sort().join(",")],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_score_history" as any)
        .select("job_id, score, snapshot_date")
        .in("job_id", jobIds)
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as ScoreHistoryRow[]) || [];
    },
  });
}

// Fetch all client notes for the jobs' clients in one query.
function useClientNotesForJobs(jobs: Job[]) {
  const clientIds = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.client_id).filter(Boolean) as string[])),
    [jobs],
  );
  return useQuery({
    queryKey: ["notes-by-clients", clientIds.sort().join(",")],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, client_id, candidate_id, job_id, content, activity_type, outcome, follow_up_date, duration, transcript, created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as Note[]) || [];
    },
  });
}

export function usePlacementScores() {
  const qc = useQueryClient();
  const { data: jobs = [] } = useJobs();
  const activeJobs = useMemo(
    () => jobs.filter((j) => ["Open", "On Hold"].includes(j.status)),
    [jobs],
  );
  const jobIds = useMemo(() => activeJobs.map((j) => j.id), [activeJobs]);

  const { data: candidateJobs = [] } = useCandidateJobs();
  const { data: clientNotes = [] } = useClientNotesForJobs(activeJobs);
  const { data: history = [] } = useScoreHistory(jobIds);

  // Build previous-score map (~7 days ago, fallback to oldest available)
  const previousScoreByJob = useMemo(() => {
    const map = new Map<string, number>();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    for (const jid of jobIds) {
      const rows = history.filter((h) => h.job_id === jid);
      if (rows.length === 0) continue;
      const target =
        rows.find((r) => new Date(r.snapshot_date) <= sevenDaysAgo) || rows[rows.length - 1];
      if (target) map.set(jid, target.score);
    }
    return map;
  }, [history, jobIds]);

  const scores = useMemo(() => {
    const map = new Map<string, PlacementScore>();
    for (const job of activeJobs) {
      const ps = computePlacementScore({
        job,
        candidateJobs: candidateJobs as CandidateJob[],
        clientNotes,
        previousScore: previousScoreByJob.get(job.id) ?? null,
      });
      map.set(job.id, ps);
    }
    return map;
  }, [activeJobs, candidateJobs, clientNotes, previousScoreByJob]);

  // Persist today's snapshot once per job per day (best-effort, fire and forget)
  useEffect(() => {
    if (activeJobs.length === 0 || scores.size === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = activeJobs
        .map((j) => {
          const s = scores.get(j.id);
          if (!s) return null;
          return {
            job_id: j.id,
            owner_user_id: user?.id ?? null,
            score: s.score,
            snapshot_date: today,
            positives: s.positives,
            negatives: s.negatives,
          };
        })
        .filter(Boolean) as any[];
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("job_score_history" as any)
        .upsert(rows, { onConflict: "job_id,snapshot_date" });
      if (!error) qc.invalidateQueries({ queryKey: ["job-score-history"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores.size, activeJobs.length]);

  return scores;
}

export function usePlacementScoreFor(jobId: string | undefined) {
  const all = usePlacementScores();
  return jobId ? all.get(jobId) : undefined;
}
