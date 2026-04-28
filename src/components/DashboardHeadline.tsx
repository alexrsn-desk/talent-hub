import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, AlertTriangle, Star, Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTodayFollowUps, useOverdueFollowUps, useTodayInterviews, useCandidateJobs } from "@/hooks/use-data";

type FocusData = {
  greeting: string;
  bottom_line: string;
  red_flags?: { issue: string }[];
  amber_flags?: { issue: string }[];
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeadline() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: todayActions = [] } = useTodayFollowUps();
  const { data: overdueActions = [] } = useOverdueFollowUps();
  const { data: interviewCandidates = [] } = useTodayInterviews();
  const { data: allCandidateJobs = [] } = useCandidateJobs();

  const callsDue = todayActions.filter(a => a.activity_type === "Call").length;
  const offerStage = allCandidateJobs.filter(cj => cj.stage === "Offer" || cj.stage === "Awaiting Feedback");
  const interviewsToday = interviewCandidates.length;

  const fetchFocus = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("daily-focus");
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      setError(e?.message || "Could not load brief");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFocus();
  }, []);

  // Fallback summary when AI not available
  const fallbackSummary = (() => {
    const parts: string[] = [];
    if (overdueActions.length > 0) parts.push(`${overdueActions.length} overdue follow-up${overdueActions.length !== 1 ? "s" : ""}`);
    if (callsDue > 0) parts.push(`${callsDue} call${callsDue !== 1 ? "s" : ""} to make`);
    if (interviewsToday > 0) parts.push(`${interviewsToday} interview${interviewsToday !== 1 ? "s" : ""} today`);
    if (offerStage.length > 0) parts.push(`${offerStage.length} candidate${offerStage.length !== 1 ? "s" : ""} at offer stage`);
    if (parts.length === 0) return "A clear desk today — good time to source new candidates or open BD conversations.";
    return `You have ${parts.join(", ")}.`;
  })();

  const greetingLine = data?.greeting || getGreeting();
  const summaryLine = data?.bottom_line || fallbackSummary;

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Your morning brief</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mt-1 -mr-2"
          onClick={fetchFocus}
          disabled={loading}
          title="Refresh brief"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
        {greetingLine}
      </h1>

      <p className="text-base sm:text-lg text-foreground/90 leading-relaxed max-w-3xl">
        {loading && !data ? (
          <span className="text-muted-foreground">Reviewing your desk…</span>
        ) : (
          summaryLine
        )}
      </p>

      {error && !data && (
        <p className="text-xs text-muted-foreground mt-2">{error}</p>
      )}

      {/* Compact stats strip */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 pt-4 border-t border-primary/15 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <span className="font-medium text-foreground">{overdueActions.length}</span> overdue
        </span>
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">{callsDue}</span> calls due
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-medium text-foreground">{interviewsToday}</span> interviews
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-yellow-400" />
          <span className="font-medium text-foreground">{offerStage.length}</span> at offer
        </span>
      </div>
    </div>
  );
}
