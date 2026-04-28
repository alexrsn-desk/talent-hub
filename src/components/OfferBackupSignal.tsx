import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { CandidateJob, Job } from "@/hooks/use-data";

// Stages excluded from "active backup" counts
const REJECTED_LIKE = ["Rejected", "Withdrawn"];

const COUNTER_OFFER_PHRASES = [
  "counter offer",
  "counter-offer",
  "counteroffer",
  "might stay",
  "manager asked",
  "reviewing",
  "reconsidering",
];

export type OfferBackupStatus = "red" | "amber" | "green";

export interface OfferBackupCounts {
  shortlist: number;
  screening: number;
  longlist: number;
  submitted: number;
  total: number;
}

export function computeBackupStatus(counts: OfferBackupCounts): OfferBackupStatus {
  if (counts.shortlist >= 1 || counts.submitted >= 1) return "green";
  if (counts.screening >= 1) return "amber";
  return "red";
}

export function computeBackupCounts(
  candidateJobs: CandidateJob[],
  jobId: string,
  excludeCandidateJobId: string,
): OfferBackupCounts {
  const cjs = candidateJobs.filter(
    (cj) =>
      cj.job_id === jobId &&
      cj.id !== excludeCandidateJobId &&
      !REJECTED_LIKE.includes(cj.stage),
  );
  const countAt = (s: string) => cjs.filter((cj) => cj.stage === s).length;
  return {
    shortlist: countAt("Shortlist"),
    screening: countAt("Screening"),
    longlist: countAt("Longlist"),
    submitted: countAt("Submitted"),
    total: cjs.length,
  };
}

function dismissKey(cjId: string) {
  return `offer-backup-dismissed:${cjId}`;
}

export function isDismissed(cjId: string, stageChangedAt?: string | null) {
  try {
    const raw = localStorage.getItem(dismissKey(cjId));
    if (!raw) return false;
    if (!stageChangedAt) return true;
    return raw === stageChangedAt;
  } catch {
    return false;
  }
}

function dismiss(cjId: string, stageChangedAt?: string | null) {
  try {
    localStorage.setItem(dismissKey(cjId), stageChangedAt || "1");
  } catch {
    // ignore
  }
}

function useCounterOfferRisk(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["counter-offer-risk", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("content,transcript,created_at")
        .eq("candidate_id", candidateId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const hay = (data || [])
        .map((n) => `${n.content || ""} ${n.transcript || ""}`)
        .join(" \n ")
        .toLowerCase();
      const matched = COUNTER_OFFER_PHRASES.find((p) => hay.includes(p));
      return { atRisk: !!matched, phrase: matched };
    },
  });
}

interface Props {
  job: Job;
  offerCandidateJob: CandidateJob;
  candidateJobs: CandidateJob[];
  onViewPipeline?: () => void;
  onFindBackups?: () => void;
  compact?: boolean;
}

export function OfferBackupSignal({
  job,
  offerCandidateJob,
  candidateJobs,
  onViewPipeline,
  onFindBackups,
  compact,
}: Props) {
  const counts = useMemo(
    () => computeBackupCounts(candidateJobs, job.id, offerCandidateJob.id),
    [candidateJobs, job.id, offerCandidateJob.id],
  );
  const status = computeBackupStatus(counts);
  const counter = useCounterOfferRisk(offerCandidateJob.candidate_id);
  const counterRisk = counter.data?.atRisk ?? false;

  const [dismissed, setDismissed] = useState(() =>
    isDismissed(offerCandidateJob.id, offerCandidateJob.stage_changed_at),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Re-check dismissal when stage_changed_at updates (signal naturally re-shows)
  useEffect(() => {
    setDismissed(isDismissed(offerCandidateJob.id, offerCandidateJob.stage_changed_at));
  }, [offerCandidateJob.id, offerCandidateJob.stage_changed_at]);

  if (dismissed) return null;

  const candidateName = offerCandidateJob.candidates?.name || "Candidate";
  const jobTitle = job.title;
  const clientName = (job as any).clients?.company_name || "client";

  const palette: Record<OfferBackupStatus, { ring: string; bg: string; text: string; icon: any; label: string }> = {
    red: {
      ring: "border-red-500/50",
      bg: "bg-red-500/10",
      text: "text-red-300",
      icon: ShieldX,
      label: "No backup",
    },
    amber: {
      ring: "border-amber-500/50",
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      icon: ShieldAlert,
      label: "Thin backup",
    },
    green: {
      ring: "border-emerald-500/40",
      bg: "bg-emerald-500/5",
      text: "text-emerald-300",
      icon: ShieldCheck,
      label: "Backup ready",
    },
  };

  const effective: OfferBackupStatus = counterRisk ? "red" : status;
  const tone = palette[effective];
  const Icon = tone.icon;

  const recommendation =
    status === "red"
      ? "You have no backup candidates ready. If this offer falls through you are starting from scratch on this role. Add a backup candidate to Screening or Shortlist now."
      : status === "amber"
      ? "You have a candidate at Screening but nothing confirmed for the shortlist. Worth progressing your screening candidate in case this offer falls."
      : "You have a backup on the shortlist. Good position — keep them warm until the offer is accepted.";

  const handleDismiss = () => {
    if (effective === "green") {
      dismiss(offerCandidateJob.id, offerCandidateJob.stage_changed_at);
      setDismissed(true);
    } else {
      setConfirmOpen(true);
    }
  };

  const confirmDismiss = () => {
    dismiss(offerCandidateJob.id, offerCandidateJob.stage_changed_at);
    setDismissed(true);
    setConfirmOpen(false);
  };

  // Compact green variant — less prominent
  if (compact || (effective === "green" && !counterRisk)) {
    return (
      <div className={`rounded-md border ${tone.ring} ${tone.bg} px-3 py-2 flex items-center gap-2 text-xs`}>
        <Icon className={`h-3.5 w-3.5 ${tone.text}`} />
        <span className={tone.text}>
          <span className="font-medium">{candidateName}</span> at Offer — backup ready ({counts.shortlist + counts.submitted} on shortlist/submitted).
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onViewPipeline && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onViewPipeline}>
              View pipeline
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleDismiss}
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-lg border-2 ${tone.ring} ${tone.bg} p-4 space-y-3`}>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-background/60 p-2">
            <Icon className={`h-5 w-5 ${tone.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-semibold ${tone.text}`}>
                🚨 OFFER STAGE — BACKUP CHECK
              </h3>
              <Badge variant="outline" className={`text-[10px] ${tone.text} ${tone.ring}`}>
                {tone.label}
              </Badge>
            </div>
            <p className="text-sm mt-1">
              <span className="font-medium">{candidateName}</span> is at offer stage for{" "}
              <span className="font-medium">{jobTitle}</span> at{" "}
              <span className="font-medium">{clientName}</span>. Do you have a backup candidate
              ready if this falls through?
            </p>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDismiss} title="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Shortlist", n: counts.shortlist },
            { label: "Screening", n: counts.screening },
            { label: "Longlist", n: counts.longlist },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-md border border-border bg-background/50 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
              <div className={`text-lg font-semibold ${row.n === 0 ? "text-muted-foreground" : ""}`}>
                {row.n}
              </div>
            </div>
          ))}
        </div>

        <p className={`text-sm ${tone.text}`}>{recommendation}</p>

        {counterRisk && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-2.5">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-300">
              ⚠️ Counter offer risk detected in notes
              {counter.data?.phrase ? ` ("${counter.data.phrase}")` : ""}. This candidate may not
              accept. Having a backup is even more important.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          {onViewPipeline && (
            <Button size="sm" variant="outline" onClick={onViewPipeline} className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> View pipeline
            </Button>
          )}
          {onFindBackups && (
            <Button size="sm" onClick={onFindBackups} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Find backups
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleDismiss} className="ml-auto">
            Dismiss
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              You currently have no strong backup for this role. If the offer falls through you
              will need to start from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep signal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDismiss}>Yes — dismiss</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
