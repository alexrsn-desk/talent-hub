import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Sparkles, RefreshCw, Loader2, Search, UserPlus, Phone,
  ExternalLink, Clock, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useCreateCandidateJob } from "@/hooks/use-data";
import type { Job } from "@/hooks/use-data";

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

function getContactRecency(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never contacted", color: "text-destructive" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 14) return { label: `${days}d ago`, color: "text-green-400" };
  if (days <= 56) return { label: `${Math.floor(days / 7)}w ago`, color: "text-yellow-400" };
  return { label: `${Math.floor(days / 7)}w ago`, color: "text-destructive" };
}

const tierConfig = {
  strong: { label: "Strong Match", bg: "bg-green-500/10 border-green-500/30", dot: "bg-green-500", badge: "bg-green-500/20 text-green-400" },
  possible: { label: "Possible Match", bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500", badge: "bg-yellow-500/20 text-yellow-400" },
  consider: { label: "Worth Considering", bg: "bg-muted/30 border-border", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

export function CandidateMatching({ job, autoRun = false }: { job: Job; autoRun?: boolean }) {
  const [data, setData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({
    strong: true, possible: true, consider: false,
  });
  const createCandidateJob = useCreateCandidateJob();

  const runMatching = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("match-candidates", {
        body: { job_id: job.id },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      setError(e.message || "Matching failed");
      toast.error(e.message || "Matching failed");
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    if (autoRun && !data && !loading) {
      runMatching();
    }
  }, [autoRun, data, loading, runMatching]);

  const handleAddToLonglist = async (candidateId: string, candidateName: string) => {
    try {
      await createCandidateJob.mutateAsync({
        candidate_id: candidateId,
        job_id: job.id,
        stage: "Longlist",
      });
      toast.success(`${candidateName} added to longlist`);
    } catch (e: any) {
      if (e.message?.includes("duplicate")) {
        toast.info(`${candidateName} is already linked to this job`);
      } else {
        toast.error("Failed to add to longlist");
      }
    }
  };

  const timeAgo = data?.generated_at
    ? getTimeAgo(data.generated_at)
    : null;

  const tiers: ("strong" | "possible" | "consider")[] = ["strong", "possible", "consider"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">AI Candidate Matching</h3>
          {timeAgo && (
            <span className="text-xs text-muted-foreground">
              Matched {timeAgo} —{" "}
              <button onClick={runMatching} className="text-primary hover:underline">
                refresh?
              </button>
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
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : data ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? "Matching…" : data ? "Refresh" : "Find Matching Candidates"}
        </Button>
      </div>

      {/* Manual search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search candidates manually…"
          className="pl-9 h-8 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Analysing your candidate database…</p>
          <p className="text-xs">This usually takes 10-20 seconds</p>
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {tiers.map((tier) => {
            const matches = data.matches.filter((m) => m.tier === tier);
            if (matches.length === 0) return null;
            const config = tierConfig[tier];
            const expanded = expandedTiers[tier];

            return (
              <div key={tier} className={`rounded-lg border ${config.bg}`}>
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5"
                  onClick={() =>
                    setExpandedTiers((prev) => ({ ...prev, [tier]: !prev[tier] }))
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${config.dot}`} />
                    <span className="text-sm font-medium">{config.label}</span>
                    <Badge variant="secondary" className={`${config.badge} text-xs`}>
                      {matches.length}
                    </Badge>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {expanded && (
                  <div className="px-4 pb-3 space-y-3">
                    {matches.map((m) => (
                      <CandidateMatchCard
                        key={m.candidate_id}
                        match={m}
                        tier={tier}
                        onAddToLonglist={() =>
                          handleAddToLonglist(m.candidate_id, m.candidate_name)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* AI Explanation */}
          {data.explanation && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">AI Analysis</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {data.explanation}
              </p>
            </div>
          )}

          {data.matches.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No matching candidates found. Try adding more candidates or adjusting the job requirements.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateMatchCard({
  match,
  tier,
  onAddToLonglist,
}: {
  match: MatchResult;
  tier: string;
  onAddToLonglist: () => void;
}) {
  const recency = getContactRecency(match.last_note_date || match.updated_at);
  const staleWarning =
    match.last_note_date &&
    Date.now() - new Date(match.last_note_date).getTime() > 30 * 86400000;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{match.candidate_name}</span>
            <Badge variant="secondary" className="text-xs">
              {match.score}/100
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {match.job_title || "No title"}{" "}
            {match.current_employer ? `at ${match.current_employer}` : ""}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={onAddToLonglist}>
            <UserPlus className="h-3 w-3" /> Longlist
          </Button>
          <a href={`/candidates?id=${match.candidate_id}`}>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <ExternalLink className="h-3 w-3" /> View
            </Button>
          </a>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {match.salary_current && (
          <span>£{match.salary_current.toLocaleString()}</span>
        )}
        {match.location && <span>{match.location}</span>}
        {match.availability && <span>{match.availability}</span>}
        <span className={`flex items-center gap-1 ${recency.color}`}>
          <Clock className="h-3 w-3" /> {recency.label}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {match.matching_tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs py-0">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Explanation */}
      <p className="text-xs text-foreground/70 leading-relaxed">
        {match.explanation}
      </p>

      {/* Key quote */}
      {match.key_quote && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
          "{match.key_quote}"
        </p>
      )}

      {/* Concerns */}
      {match.concerns && (
        <p className="text-xs text-yellow-400">⚠ {match.concerns}</p>
      )}

      {/* Stale warning */}
      {staleWarning && tier === "strong" && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span>
            Last spoken {recency.label} — re-warm before submitting
          </span>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(isoDate: string): string {
  const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
