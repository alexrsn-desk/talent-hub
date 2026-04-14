import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowUp, ArrowDown, Minus, RefreshCw, Copy, Pencil, Check, X,
  TrendingUp, Brain, Target, Lightbulb, ChevronLeft, ChevronRight,
  FileText, Download, Loader2,
} from "lucide-react";

interface PerformanceStat {
  count: number;
  prevWeek: number;
  trend: "up" | "down" | "same";
}

interface WeeklySummary {
  performance: {
    calls: PerformanceStat;
    meetings: PerformanceStat;
    cvsSent: PerformanceStat;
    newJobs: PerformanceStat;
    placements: number;
    nearClose: number;
    weekHighlight: string;
  };
  marketIntel: {
    candidateThemes: string[];
    clientThemes: string[];
    hotSkills: string[];
    salaryInsights: string[];
  };
  pipeline: {
    movedForward: string[];
    goneQuiet: string[];
    mondayPriorities: string[];
  };
  contentSuggestions: {
    headline: string;
    insight: string;
    format: string;
  }[];
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <ArrowUp className="h-3.5 w-3.5 text-green-400" />;
  if (trend === "down") return <ArrowDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
};

function StatCard({ label, stat }: { label: string; stat: PerformanceStat }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{stat.count}</span>
        <TrendIcon trend={stat.trend} />
        <span className="text-xs text-muted-foreground">vs {stat.prevWeek}</span>
      </div>
    </div>
  );
}

function ContentSuggestionCard({
  suggestion,
}: {
  suggestion: { headline: string; insight: string; format: string };
}) {
  const [editing, setEditing] = useState(false);
  const [editedHeadline, setEditedHeadline] = useState(suggestion.headline);
  const [editedInsight, setEditedInsight] = useState(suggestion.insight);

  const copyToClipboard = () => {
    const text = `${editedHeadline}\n\n${editedInsight}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-primary font-medium bg-primary/10 px-2 py-0.5 rounded">
          {suggestion.format}
        </span>
        <div className="flex gap-1">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                setEditedHeadline(suggestion.headline);
                setEditedInsight(suggestion.insight);
                setEditing(false);
              }}>
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copyToClipboard}>
                <Copy className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <input
            className="w-full bg-background border border-border rounded px-2 py-1 text-sm font-semibold"
            value={editedHeadline}
            onChange={e => setEditedHeadline(e.target.value)}
          />
          <Textarea
            className="text-xs min-h-[60px]"
            value={editedInsight}
            onChange={e => setEditedInsight(e.target.value)}
          />
        </div>
      ) : (
        <>
          <h4 className="font-semibold text-sm mb-1">{editedHeadline}</h4>
          <p className="text-xs text-muted-foreground">{editedInsight}</p>
        </>
      )}
    </div>
  );
}

export default function WeeklyIntel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);

  const currentMonday = getMonday(new Date());
  const targetMonday = new Date(currentMonday);
  targetMonday.setDate(currentMonday.getDate() + weekOffset * 7);
  const targetFriday = new Date(targetMonday);
  targetFriday.setDate(targetMonday.getDate() + 4);

  const wsDate = targetMonday.toISOString().slice(0, 10);
  const weDate = targetFriday.toISOString().slice(0, 10);

  const { data: savedSummary, isLoading } = useQuery({
    queryKey: ["weekly-summary", wsDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("weekly_summaries" as any)
        .select("*")
        .eq("week_start", wsDate)
        .maybeSingle();
      return (data as unknown as { summary: WeeklySummary; week_start: string; week_end: string }) || null;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("weekly-summary", {
        body: { user_id: user?.id, week_end: targetFriday.toISOString() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Weekly summary generated");
      qc.invalidateQueries({ queryKey: ["weekly-summary", wsDate] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to generate summary"),
  });

  const summary: WeeklySummary | null = savedSummary?.summary as WeeklySummary | null;

  const copyFullSummary = () => {
    if (!summary) return;
    const text = `WEEKLY INTELLIGENCE SUMMARY — ${formatDateShort(wsDate)} to ${formatDateShort(weDate)}

PERFORMANCE
• Calls: ${summary.performance.calls.count} (prev: ${summary.performance.calls.prevWeek})
• Meetings: ${summary.performance.meetings.count} (prev: ${summary.performance.meetings.prevWeek})
• CVs Sent: ${summary.performance.cvsSent.count} (prev: ${summary.performance.cvsSent.prevWeek})
• New Jobs: ${summary.performance.newJobs.count} (prev: ${summary.performance.newJobs.prevWeek})
• Placements: ${summary.performance.placements}
• ${summary.performance.weekHighlight}

MARKET INTELLIGENCE
Candidate themes: ${summary.marketIntel.candidateThemes.join("; ")}
Client themes: ${summary.marketIntel.clientThemes.join("; ")}
Hot skills: ${summary.marketIntel.hotSkills.join(", ")}
Salary insights: ${summary.marketIntel.salaryInsights.join("; ")}

PIPELINE
Moved forward: ${summary.pipeline.movedForward.join("; ")}
Needs attention: ${summary.pipeline.goneQuiet.join("; ")}
Monday priorities: ${summary.pipeline.mondayPriorities.join("; ")}

CONTENT IDEAS
${summary.contentSuggestions.map((s, i) => `${i + 1}. [${s.format}] ${s.headline}\n   ${s.insight}`).join("\n")}`;

    navigator.clipboard.writeText(text);
    toast.success("Full summary copied to clipboard");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Weekly Intelligence</h1>
          <p className="text-xs text-muted-foreground">
            {formatDateShort(wsDate)} — {formatDateShort(weDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>
            This week
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} disabled={weekOffset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && !summary && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No summary for this week yet. Hit Generate to analyse your desk.
            </p>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Generate Summary
            </Button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <>
          {/* Performance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Performance Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Calls" stat={summary.performance.calls} />
                <StatCard label="Meetings" stat={summary.performance.meetings} />
                <StatCard label="CVs Sent" stat={summary.performance.cvsSent} />
                <StatCard label="New Jobs" stat={summary.performance.newJobs} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Placements</p>
                  <p className="text-2xl font-bold">{summary.performance.placements}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Near Close</p>
                  <p className="text-2xl font-bold">{summary.performance.nearClose}</p>
                </div>
              </div>
              {summary.performance.weekHighlight && (
                <p className="text-sm bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  💡 {summary.performance.weekHighlight}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Market Intelligence */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" /> Market Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.marketIntel.candidateThemes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Candidate Themes</p>
                  <ul className="space-y-1">
                    {summary.marketIntel.candidateThemes.map((t, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-1">•</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.marketIntel.clientThemes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Client Themes</p>
                  <ul className="space-y-1">
                    {summary.marketIntel.clientThemes.map((t, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-1">•</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.marketIntel.hotSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Hot Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.marketIntel.hotSkills.map((s, i) => (
                      <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {summary.marketIntel.salaryInsights.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Salary Insights</p>
                  <ul className="space-y-1">
                    {summary.marketIntel.salaryInsights.map((s, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-1">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Pipeline Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.pipeline.movedForward.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-400 mb-1.5">✅ Moved Forward</p>
                  <ul className="space-y-1">
                    {summary.pipeline.movedForward.map((t, i) => (
                      <li key={i} className="text-sm">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.pipeline.goneQuiet.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-orange-400 mb-1.5">⚠️ Gone Quiet</p>
                  <ul className="space-y-1">
                    {summary.pipeline.goneQuiet.map((t, i) => (
                      <li key={i} className="text-sm">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.pipeline.mondayPriorities.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-primary mb-1.5">🎯 Monday Priorities</p>
                  <ol className="space-y-1 list-decimal list-inside">
                    {summary.pipeline.mondayPriorities.map((t, i) => (
                      <li key={i} className="text-sm">{t}</li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content Suggestions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" /> Content Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.contentSuggestions.map((s, i) => (
                  <ContentSuggestionCard key={i} suggestion={s} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyFullSummary}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy Summary
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
