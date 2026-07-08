import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Sparkles, RefreshCw, Loader2, Search, ExternalLink, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Send, ListPlus,
} from "lucide-react";
import { useCreateCandidateJob } from "@/hooks/use-data";
import type { Job } from "@/hooks/use-data";
import { useFeatureLimit, useLogUsage } from "@/hooks/use-usage";
import { MultiCandidateSendDialog } from "@/components/MultiCandidateSendDialog";
import { useAuth } from "@/contexts/AuthContext";

interface MatchResult {
  candidate_id: string;
  candidate_name: string;
  job_title: string | null;
  current_employer: string | null;
  salary_current: number | null;
  availability: string | null;
  location: string | null;
  status: string;
  updated_at: string;
  last_note_date: string | null;
  score: number;
  tier: "strong" | "possible" | "consider";
  explanation: string;
  matching_tags: string[];
  concerns?: string;
  key_quote?: string;
}

interface MatchData {
  matches: MatchResult[];
  explanation: string;
  generated_at: string;
}

function recency(date: string | null) {
  if (!date) return { label: "Never contacted", color: "text-destructive" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 14) return { label: `${days}d ago`, color: "text-green-400" };
  if (days <= 56) return { label: `${Math.floor(days / 7)}w ago`, color: "text-yellow-400" };
  return { label: `${Math.floor(days / 7)}w ago`, color: "text-destructive" };
}

function scoreColor(score: number) {
  if (score >= 75) return { ring: "border-green-500/40 bg-green-500/10", text: "text-green-400", label: "Strong match" };
  if (score >= 50) return { ring: "border-yellow-500/40 bg-yellow-500/10", text: "text-yellow-400", label: "Good match" };
  return { ring: "border-border bg-muted/30", text: "text-muted-foreground", label: "Partial match" };
}

function salaryBadge(expectation: number | null, min: number | null, max: number | null) {
  if (!expectation) return { icon: "?", text: "Salary unknown", cls: "text-muted-foreground" };
  if (max && expectation <= max) return { icon: "✅", text: `£${expectation.toLocaleString()} — within range`, cls: "text-green-400" };
  if (max && expectation <= max * 1.15) return { icon: "⚠️", text: `£${expectation.toLocaleString()} — slightly above`, cls: "text-yellow-400" };
  return { icon: "⚠️", text: `£${expectation.toLocaleString()} — above range`, cls: "text-yellow-400" };
}

export function CandidateMatching({ job, autoRun = false }: { job: Job; autoRun?: boolean }) {
  const [data, setData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removedTop, setRemovedTop] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);

  const createCandidateJob = useCreateCandidateJob();
  const matchLimit = useFeatureLimit("candidate_match");
  const logUsage = useLogUsage();
  const { user } = useAuth();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [recruiterName, setRecruiterName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase.from("recruiter_profiles").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setRecruiterName(data?.display_name || ""));
  }, [user]);

  // Only auto-run when JD or intake summary is populated
  const hasBrief = Boolean((job as any).description?.trim() || (job as any).intake_summary?.trim());

  const runMatching = useCallback(async () => {
    if (!matchLimit.canUse) {
      toast.error("Monthly candidate matching limit reached");
      return;
    }
    setLoading(true);
    setError(null);
    logUsage.mutate({ featureType: "candidate_match", isGrace: matchLimit.graceGranted });
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("match-candidates", {
        body: { job_id: job.id },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
      // Pre-tick top 5 strong/possible
      const top5 = (result?.matches || []).slice(0, 5).map((m: MatchResult) => m.candidate_id);
      setSelected(new Set(top5));
      setRemovedTop(new Set());
    } catch (e: any) {
      setError(e.message || "Matching failed");
      toast.error(e.message || "Matching failed");
    } finally {
      setLoading(false);
    }
  }, [job.id, matchLimit.canUse, matchLimit.graceGranted]);

  // Auto-run when brief is present, and re-run when description changes
  const briefKey = `${(job as any).description || ""}::${(job as any).intake_summary || ""}`;
  useEffect(() => {
    if (autoRun && hasBrief && !loading) {
      runMatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefKey]);

  const sorted = useMemo(() => (data?.matches || []).slice().sort((a, b) => b.score - a.score), [data]);
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5, 20);
  const visibleRest = showMore ? rest : rest.slice(0, 0);
  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return sorted.filter(m =>
      m.candidate_name.toLowerCase().includes(q) ||
      m.job_title?.toLowerCase().includes(q) ||
      m.current_employer?.toLowerCase().includes(q)
    );
  }, [search, sorted]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);
  const noStrong = data && sorted.length > 0 && sorted[0].score < 30;
  const empty = data && sorted.length === 0;

  const addSelectedToPipeline = async (stage: string = "AI Suggested") => {
    if (selectedIds.length === 0) return;
    let ok = 0, dup = 0, fail = 0;
    const now = new Date().toISOString();
    for (const cid of selectedIds) {
      const m = sorted.find(x => x.candidate_id === cid);
      try {
        await createCandidateJob.mutateAsync({
          candidate_id: cid,
          job_id: job.id,
          stage,
          source: "ai",
          ai_suggested: true,
          ai_suggested_at: now,
          ai_suggested_score: m?.score ?? null,
          ai_suggested_reason: m?.explanation ?? null,
        });
        ok++;
      } catch (e: any) {
        if (e.message?.includes("duplicate")) dup++;
        else fail++;
      }
    }
    toast.success(`Added ${ok} to ${stage}${dup ? ` · ${dup} already in pipeline` : ""}${fail ? ` · ${fail} failed` : ""}`);
    setSelected(new Set());
  };


  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">AI Suggested</h3>
          {data?.generated_at && (
            <span className="text-xs text-muted-foreground">
              · {new Date(data.generated_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={data ? "outline" : "default"}
          onClick={runMatching}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           data ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Finding…" : data ? "Re-run" : "Find matching candidates"}
        </Button>
      </div>

      {!hasBrief && !data && !loading && (
        <p className="text-xs text-muted-foreground">
          Add a job description below to auto-match candidates from your database.
        </p>
      )}

      {data && sorted.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search suggested candidates…"
            className="pl-9 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">Finding your best candidates…</p>
        </div>
      )}

      {data && filtered ? (
        <div className="space-y-2">
          {filtered.map(m => (
            <Card key={m.candidate_id} match={m} job={job} checked={selected.has(m.candidate_id)} onToggle={() => toggleSelected(m.candidate_id)} />
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground">No matches for "{search}".</p>}
        </div>
      ) : data && sorted.length > 0 ? (
        <>
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary font-medium">
            AI suggested shortlist — review and send
          </div>
          <div className="space-y-2">
            {top5.map(m => (
              <Card key={m.candidate_id} match={m} job={job} checked={selected.has(m.candidate_id)} onToggle={() => toggleSelected(m.candidate_id)} />
            ))}
          </div>

          {rest.length > 0 && (
            <button
              onClick={() => setShowMore(v => !v)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showMore ? "Hide" : `Show ${rest.length} more matches`}
            </button>
          )}

          {showMore && (
            <div className="space-y-2">
              {rest.map(m => (
                <Card key={m.candidate_id} match={m} job={job} checked={selected.has(m.candidate_id)} onToggle={() => toggleSelected(m.candidate_id)} />
              ))}
            </div>
          )}

          {/* Shortlist actions */}
          <div className="sticky bottom-0 mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground mr-auto">
              {selectedIds.length} selected
            </span>
            <Button size="sm" variant="outline" disabled={!selectedIds.length} onClick={() => addSelectedToPipeline("AI Suggested")} className="gap-1">
              <ListPlus className="h-3.5 w-3.5" /> Add to AI Suggested
            </Button>

            <Button size="sm" disabled={!selectedIds.length} onClick={() => setSendDialogOpen(true)} className="gap-1">
              <Send className="h-3.5 w-3.5" /> Send to client
            </Button>
          </div>
        </>
      ) : null}

      {(noStrong || empty) && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm space-y-2">
          <p className="font-medium">No strong matches found in your current database for this role.</p>
          <p className="text-xs text-muted-foreground">Try expanding your search, or add candidates that fit this brief.</p>
          {data?.explanation && <p className="text-xs text-foreground/70">{data.explanation}</p>}
        </div>
      )}

      {sendDialogOpen && (
        <MultiCandidateSendDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          job={job}
          recruiterName={recruiterName}
          candidates={selectedIds
            .map((id) => sorted.find((m) => m.candidate_id === id))
            .filter(Boolean)
            .map((m: any) => ({
              id: m.candidate_id,
              name: m.candidate_name,
              job_title: m.job_title,
              current_employer: m.current_employer,
              availability: m.availability,
              salary_expectation: m.salary_current,
              email: null,
            }))}
        />
      )}
    </div>
  );
}

function Card({
  match, job, checked, onToggle,
}: {
  match: MatchResult; job: Job; checked: boolean; onToggle: () => void;
}) {
  const s = scoreColor(match.score);
  const r = recency(match.last_note_date || match.updated_at);
  const sal = salaryBadge(match.salary_current, job.salary_min, job.salary_max);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${s.ring}`}>
      <div className="flex items-start gap-3">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{match.candidate_name}</span>
            <Badge variant="outline" className={`${s.text} text-xs`}>{match.score}% · {s.label}</Badge>
            {match.status && <Badge variant="secondary" className="text-xs">{match.status}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {match.job_title || "No title"}{match.current_employer ? ` at ${match.current_employer}` : ""}
          </p>
        </div>
        <a href={`/candidates?id=${match.candidate_id}`} className="flex-shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
            <ExternalLink className="h-3 w-3" /> View
          </Button>
        </a>
      </div>

      <p className="text-xs text-foreground/80 leading-relaxed pl-7">
        {match.explanation}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pl-7">
        <span className={sal.cls}>{sal.icon} {sal.text}</span>
        {match.availability && <span className="text-muted-foreground">📅 {match.availability}</span>}
        <span className={`flex items-center gap-1 ${r.color}`}>
          <Clock className="h-3 w-3" /> {r.label}
        </span>
      </div>

      {match.key_quote && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2 ml-7">
          "{match.key_quote}"
        </p>
      )}
      {match.concerns && <p className="text-xs text-yellow-400 pl-7">⚠ {match.concerns}</p>}
    </div>
  );
}
