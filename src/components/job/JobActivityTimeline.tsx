import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRightLeft, FileText, Rocket, UserPlus, UserMinus, Pencil, Phone,
  CalendarClock, Send, Activity as ActivityIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type Entry = {
  id: string;
  at: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  stage_change: ArrowRightLeft,
  note_created: FileText,
  touchpoint_logged: Phone,
  candidate_job_linked: UserPlus,
  candidate_job_unlinked: UserMinus,
  job_created: Rocket,
  job_updated: Pencil,
  interview_scheduled: CalendarClock,
  cv_sent: Send,
};

function describe(row: any, names: Record<string, string>): string {
  const m = row.metadata ?? {};
  const who = names[row.candidate_id] || m.candidate_name || m.name || "A candidate";
  switch (row.action_type) {
    case "stage_change":
      return `${who} moved${m.stage_from ?? m.from ? ` from ${m.stage_from ?? m.from}` : ""}${m.stage_to ?? m.to ? ` to ${m.stage_to ?? m.to}` : ""}`;
    case "candidate_job_linked":
      return `${who} added to the pipeline${m.stage ? ` at ${m.stage}` : ""}`;
    case "candidate_job_unlinked":
      return `${who} removed from the pipeline`;
    case "note_created":
      return "Note added";
    case "touchpoint_logged":
      return `Touchpoint logged${m.medium ? ` (${m.medium})` : ""}`;
    case "interview_scheduled":
      return row.candidate_id || m.candidate_name ? `Interview scheduled with ${who}` : "Interview scheduled";
    case "cv_sent":
      return row.candidate_id || m.candidate_name ? `CV sent for ${who}` : "CV sent";
    case "job_created":
      return "Job created";
    case "job_updated":
      return m.closed
        ? `Job marked ${m.status}${m.reason ? ` — ${m.reason}` : ""}`
        : `Job updated${m.fields ? ` — ${(m.fields as string[]).join(", ")}` : ""}`;
    default:
      return String(row.action_type).replace(/_/g, " ");
  }
}

export function JobActivityTimeline({ jobId }: { jobId: string }) {
  const q = useQuery({
    queryKey: ["job-activity-timeline", jobId],
    queryFn: async () => {
      const [log, notes, launches] = await Promise.all([
        supabase.from("activity_log").select("id, action_type, metadata, candidate_id, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(150),
        supabase.from("notes").select("id, content, activity_type, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(100),
        supabase.from("job_launches").select("id, launched_at, known_count, li_count").eq("job_id", jobId).order("launched_at", { ascending: false }),
      ]);

      const candidateIds = [...new Set(((log.data ?? []) as any[]).map((r) => r.candidate_id).filter(Boolean))];
      const names: Record<string, string> = {};
      if (candidateIds.length) {
        const { data: cands } = await supabase.from("candidates").select("id, name").in("id", candidateIds);
        for (const c of (cands ?? []) as any[]) names[c.id] = c.name;
      }

      const entries: Entry[] = [];

      for (const r of (log.data ?? []) as any[]) {
        if (r.action_type === "note_created") continue; // notes come from the notes feed below
        entries.push({ id: `log-${r.id}`, at: r.created_at, icon: ICONS[r.action_type] ?? ActivityIcon, text: describe(r, names) });
      }

      for (const n of (notes.data ?? []) as any[]) {
        const label = n.activity_type && n.activity_type !== "Note" ? `${n.activity_type} logged` : "Note added";
        const snippet = (n.content || "").replace(/\s+/g, " ").slice(0, 120);
        entries.push({
          id: `note-${n.id}`,
          at: n.created_at,
          icon: n.activity_type && n.activity_type !== "Note" ? Phone : FileText,
          text: `${label}${snippet ? ` — ${snippet}${(n.content || "").length > 120 ? "…" : ""}` : ""}`,
        });
      }

      for (const l of (launches.data ?? []) as any[]) {
        entries.push({
          id: `launch-${l.id}`,
          at: l.launched_at,
          icon: Rocket,
          text: `Search launched — ${l.known_count ?? 0} personal message(s), ${l.li_count ?? 0} LI DM(s)`,
        });
      }

      return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });

  const entries = q.data ?? [];

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium mb-3">Activity timeline</h2>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened on this job yet.</p>
      ) : (
        <ul className="space-y-0">
          {entries.map((e) => {
            const Icon = e.icon;
            return (
              <li key={e.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm">{e.text}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground text-right">
                  {format(new Date(e.at), "d MMM")}
                  <br />
                  {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
