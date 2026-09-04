import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOverdueFollowUps, useTodayFollowUps } from "@/hooks/use-data";

type FocusData = {
  greeting?: string;
  bullets?: string[];
  bottom_line?: string;
  lead_action?: { prompt: string } | null;
  second_action?: { prompt: string } | null;
  positive_note?: string | null;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Status-only brief. Time-of-day greeting plus a maximum of three short
 * informational lines. No buttons, no links — anything actionable belongs
 * on the Actions page.
 */
export function DeskBrief() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: overdue = [] } = useOverdueFollowUps();
  const { data: today = [] } = useTodayFollowUps();

  const fetchFocus = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("daily-focus");
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFocus();
  }, []);

  const fallback = (() => {
    const lines: string[] = [];
    if (overdue.length > 0)
      lines.push(
        `${overdue.length} follow-up${overdue.length === 1 ? "" : "s"} slipped past their date — worth clearing first.`,
      );
    if (today.length > 0)
      lines.push(`${today.length} follow-up${today.length === 1 ? "" : "s"} are due today.`);
    if (lines.length === 0)
      lines.push("A clear desk — a good moment to build the bench or open new conversations.");
    return lines.slice(0, 3);
  })();

  const bullets = (data?.bullets && data.bullets.length > 0
    ? data.bullets
    : [data?.lead_action?.prompt || data?.bottom_line, data?.second_action?.prompt, data?.positive_note]
        .filter((b): b is string => !!b && b.trim().length > 0)
  ).slice(0, 3);

  const lines = bullets.length > 0 ? bullets : fallback;

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Brief</span>
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

      <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
        {data?.greeting || getGreeting()}
      </h1>

      {loading && !data ? (
        <p className="mt-3 text-sm text-muted-foreground">Reading your desk…</p>
      ) : (
        <ul className="mt-3 space-y-1.5 max-w-3xl">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground/90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
