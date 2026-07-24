import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Loader2, Phone, AlertTriangle, Zap, PartyPopper, Settings,
  MoreVertical, Check, Clock, CheckCircle2, Sparkles, ChevronDown, Quote,
} from "lucide-react";
import { FlowPipe } from "@/components/FlowPipe";
import { Button } from "@/components/ui/button";
import {
  useBillersWorkflow, snoozeItem, markItemDone, loadThresholds, saveThresholds,
  type BillerItem, type BillerThresholds, DEFAULT_THRESHOLDS,
} from "@/hooks/use-billers-workflow";
import { useIsManager, useTeamMembers } from "@/hooks/use-team";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PipelineGapDialog } from "@/components/PipelineGapDialog";
import { WeeklyStandards } from "@/components/WeeklyStandards";
import { useWeeklyStandards, daysElapsedInWeek } from "@/hooks/use-weekly-standards";

// ---- Cockpit palette (intentionally hard-coded — this page has its own visual identity) ----
const COCKPIT = {
  bg: "#0F1724",
  panel: "#1A2332",
  card: "#1E2A3A",
  cardHover: "#243446",
  textPrimary: "#F3F6FB",
  textMuted: "#9AA4B2",
  textDim: "#6B7280",
  amber: "#F5A623",
  green: "#27AE60",
  red: "#E74C3C",
  blue: "#3B82F6",
};

const toneColor = (tone: BillerItem["tone"]) => {
  switch (tone) {
    case "red": return COCKPIT.red;
    case "amber": return COCKPIT.amber;
    case "yellow": return COCKPIT.amber;
    case "green": return COCKPIT.green;
  }
};

const sectionTag = (item: BillerItem): { icon: string; label: string; color: string } => {
  if (item.kind === "grouped") return { icon: "◆", label: "Pattern", color: COCKPIT.textMuted };
  if (item.kind === "conversation") return { icon: "💬", label: "From call", color: COCKPIT.blue };
  if (item.kind === "derived") return { icon: "✨", label: "Derived", color: COCKPIT.blue };
  if (item.section === "close") return { icon: "🛡️", label: "Protect", color: COCKPIT.amber };
  return { icon: "⚔️", label: "New business", color: COCKPIT.green };
};

// ---- One row (spreadsheet-style, expandable) ----
function BillerRow({
  item, index, expanded, onToggle, onLogCall, onRefresh, onOpenGap,
}: {
  item: BillerItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onLogCall: (it: BillerItem) => void;
  onRefresh: () => void;
  onOpenGap?: (it: BillerItem) => void;
}) {
  const nav = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);
  const accent = toneColor(item.tone);
  const tag = sectionTag(item);

  const finish = (fn: () => void) => {
    setLeaving(true);
    setTimeout(() => { fn(); onRefresh(); }, 160);
  };
  const handleDone = (e: React.MouseEvent) => { e.stopPropagation(); finish(() => markItemDone(item.id)); };
  const handleSnooze = (days: 1 | 3 | 7) => finish(() => snoozeItem(item.id, days));

  const openLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.pipelineGap && onOpenGap) onOpenGap(item);
    else if (item.href) nav(item.href);
  };

  const reason = item.signal || item.sub || "";

  return (
    <div
      className="animate-fade-in"
      style={{
        opacity: leaving ? 0 : undefined,
        transform: leaving ? "translateY(-4px)" : undefined,
        transition: "opacity 160ms, transform 160ms",
        animationDelay: `${Math.min(index * 20, 200)}ms`,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onToggle(); } }}
        className="group flex items-center gap-3 px-3 cursor-pointer transition-colors"
        style={{
          minHeight: 40,
          background: expanded ? COCKPIT.card : "transparent",
          borderLeft: `2px solid ${expanded ? accent : "transparent"}`,
        }}
      >
        {/* urgency dot */}
        <span
          className="shrink-0 rounded-full"
          style={{ width: 8, height: 8, background: accent, boxShadow: `0 0 0 2px ${accent}22` }}
          title={item.tone}
          aria-hidden
        />
        {/* section tag */}
        <span
          className="shrink-0 text-[10px] font-medium uppercase tracking-wide inline-flex items-center gap-1"
          style={{ color: tag.color, minWidth: 90 }}
        >
          <span aria-hidden>{tag.icon}</span>{tag.label}
        </span>
        {/* headline */}
        <span
          className="flex-1 min-w-0 truncate text-[13px] font-medium"
          style={{ color: COCKPIT.textPrimary }}
        >
          {item.title}
        </span>
        {/* reason (hidden on narrow) */}
        <span
          className="hidden md:inline text-[12px] truncate max-w-[38%]"
          style={{ color: COCKPIT.textMuted }}
        >
          {reason}
        </span>
        {/* actions */}
        <div className="shrink-0 flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
          {canLog && (
            <button
              onClick={(e) => { e.stopPropagation(); onLogCall(item); }}
              className="text-[11px] inline-flex items-center gap-1 hover:underline"
              style={{ color: accent }}
              title="Log call"
            >
              <Phone className="h-3 w-3" /> Log
            </button>
          )}
          <button
            onClick={handleDone}
            className="text-[11px] inline-flex items-center gap-1 hover:underline"
            style={{ color: COCKPIT.textMuted }}
            title="Mark done"
          >
            <Check className="h-3 w-3" /> Done
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-5 inline-flex items-center justify-center"
                style={{ color: COCKPIT.textDim }}
                aria-label="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.href && (
                <>
                  <DropdownMenuItem onClick={openLink}>Open</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleSnooze(1)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 day</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(3)}><Clock className="h-3.5 w-3.5 mr-2" /> 3 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(7)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* expanded detail */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: expanded ? (item.children ? 520 : 320) : 0, background: COCKPIT.card }}
      >
        <div className="px-6 pb-3 pt-1 space-y-1.5" style={{ borderLeft: `2px solid ${accent}` }}>
          {item.sub && item.sub !== reason && !item.children && (
            <div className="text-[12px]" style={{ color: COCKPIT.textMuted }}>{item.sub}</div>
          )}
          {item.signal && item.sub && item.signal !== reason && item.kind !== "conversation" && (
            <div className="text-[12px]" style={{ color: COCKPIT.textMuted }}>{item.signal}</div>
          )}
          {item.kind === "conversation" && item.sourceQuote && (
            <div
              className="text-[12px] italic px-2 py-1.5 rounded"
              style={{ background: "rgba(59,130,246,0.08)", borderLeft: `2px solid ${COCKPIT.blue}`, color: COCKPIT.textPrimary }}
            >
              "{item.sourceQuote}"
              {item.sourceLabel && (
                <div className="not-italic text-[10px] mt-1 uppercase tracking-wide" style={{ color: COCKPIT.textDim }}>
                  {item.sourceLabel}
                </div>
              )}
            </div>
          )}
          <div className="text-[12px] font-medium" style={{ color: accent }}>→ {item.action}</div>

          {item.children && item.children.length > 0 && (
            <div className="mt-2 rounded overflow-hidden max-h-[340px] overflow-y-auto" style={{ background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: COCKPIT.textDim, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {item.children.length} individual items
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {item.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (child.pipelineGap && onOpenGap) onOpenGap(child);
                      else if (child.href) nav(child.href);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-white/5 transition-colors flex items-start gap-2"
                  >
                    <span
                      className="mt-1.5 shrink-0 rounded-full"
                      style={{ width: 5, height: 5, background: toneColor(child.tone) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] truncate" style={{ color: COCKPIT.textPrimary }}>{child.title}</div>
                      {(child.sub || child.signal) && (
                        <div className="text-[11px] truncate" style={{ color: COCKPIT.textMuted }}>{child.sub || child.signal}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {(item.href || item.pipelineGap) && !item.children && (
              <button onClick={openLink} className="text-[11px] font-medium hover:underline" style={{ color: COCKPIT.blue }}>
                Open →
              </button>
            )}
            {(item.id.startsWith("ftb-bd") || item.id.startsWith("ftb-ref") || item.id.startsWith("ftb-warm") || item.id.startsWith("ftb-silver") || item.id === "group-ftb-bd" || item.id === "group-ftb-ref" || item.id === "group-ftb-warm" || item.id === "group-ftb-silver") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const isBd = item.id.startsWith("ftb-bd") || item.id === "group-ftb-bd";
                  const isRef = item.id.startsWith("ftb-ref") || item.id === "group-ftb-ref";
                  const isWarm = item.id.startsWith("ftb-warm") || item.id === "group-ftb-warm";
                  const group = isBd ? "past_clients" : isRef ? "placed_candidates" : isWarm ? "warm_prospects" : "";
                  nav(`/reactivation${group ? `?group=${group}` : ""}`);
                }}
                className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline"
                style={{ color: COCKPIT.blue }}
              >
                <Sparkles className="h-3 w-3" /> Campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ---- Thresholds dialog (unchanged logic) ----
function ThresholdsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [t, setT] = useState<BillerThresholds>(loadThresholds());
  useEffect(() => { if (open) setT(loadThresholds()); }, [open]);
  const numField = (key: keyof BillerThresholds, label: string, hint?: string) => (
    <div className="grid grid-cols-3 items-center gap-3">
      <Label className="col-span-2 text-sm">{label} {hint && <span className="text-xs text-muted-foreground">({hint})</span>}</Label>
      <Input type="number" min={0} value={t[key]} onChange={(e) => setT({ ...t, [key]: parseInt(e.target.value || "0", 10) })} className="h-9" />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Biller's Workflow Settings</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pipeline thresholds</div>
          {numField("critical", "Critical (red) — fewer than X candidates", "default 1")}
          {numField("warning", "Warning (amber) — fewer than X candidates", "default 2")}
          {numField("caution", "Caution (yellow) — fewer than X candidates", "default 3")}
          <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Activity alerts</div>
          {numField("bdInactivityDays", "BD inactivity alert (days)", "default 3")}
          {numField("offerColdDays", "Offer going cold (days)", "default 4")}
          {numField("clientSilenceDays", "Client silence on submission (days)", "default 7")}
          <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Reactivation windows</div>
          {numField("placedClientDays", "Placed client reactivation (days)", "default 60")}
          {numField("placedCandidateDays", "Placed candidate referral (days)", "default 90")}
          {numField("warmProspectDays", "Warm prospect gone quiet (days)", "default 42")}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setT(DEFAULT_THRESHOLDS); }}>Reset</Button>
          <Button onClick={() => { saveThresholds(t); onSaved(); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillersWorkflow() {
  const isManager = useIsManager();
  const { data: team = [] } = useTeamMembers();
  const qc = useQueryClient();
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [topLine, setTopLine] = useState<string>("");
  const [loadingLine, setLoadingLine] = useState(false);
  const [logCallItem, setLogCallItem] = useState<BillerItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholds, setThresholds] = useState<BillerThresholds>(loadThresholds());
  const [gapItem, setGapItem] = useState<BillerItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const sections = useMemo(() => data, [data]);

  const { data: standardsData } = useWeeklyStandards(1);
  const standardsSignals = useMemo<BillerItem[]>(() => {
    if (!standardsData) return [];
    const daysIn = daysElapsedInWeek();
    if (daysIn < 1.5) return [];
    const items: BillerItem[] = [];
    for (const plate of standardsData.plates) {
      for (const it of plate.items) {
        if (!it.behindPace) continue;
        if (it.target.unit === "percent") continue;
        const gap = Math.max(1, Math.ceil(it.expectedByNow - it.actual));
        items.push({
          id: `weekly:${it.target.key}`,
          title: `Weekly standard behind pace — ${it.target.label}`,
          sub: `${plate.label} · ${it.actual}/${it.target.target_value} this week (need ~${gap} more to catch up)`,
          signal: it.criticallyBehind ? "Slipping — well below pace with the week half gone" : "Behind pace for this week",
          action: it.target.tracking_mode === "manual" ? "Log the ones you've done + do a few more today" : "Take action to catch up",
          urgency: it.criticallyBehind ? 78 : 62,
          tone: it.criticallyBehind ? "red" : "amber",
          section: plate.category === "bd" || plate.category === "marketing" ? "feed" : "close",
          kind: "derived",
          sourceLabel: "Weekly standards",
        });
      }
    }
    return items;
  }, [standardsData]);

  const allItems = useMemo(() => {
    const merged = [...(sections?.closeProtect || []), ...(sections?.feedTheBeast || []), ...standardsSignals];
    return merged.sort((a, b) => b.urgency - a.urgency);
  }, [sections, standardsSignals]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["billers-workflow-v3"] }); refetch(); };

  const closeEmpty = !sections || sections.closeProtect.length === 0;
  const feedEmpty = !sections || (sections.feedTheBeast.length === 0 && sections.dailyBdTargets.length === 0);
  const allEmpty = closeEmpty && feedEmpty;

  const viewName = viewUserId ? team.find((m) => m.member_user_id === viewUserId)?.name || "Consultant" : "My desk";

  useEffect(() => {
    if (!sections || allEmpty) { setTopLine(""); return; }
    let cancelled = false;
    (async () => {
      setLoadingLine(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billers-top-action`;
        const compact = {
          closeProtect: sections.closeProtect.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal, a: s.action, tone: s.tone })),
          feedTheBeast: sections.feedTheBeast.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal, a: s.action })),
          dailyBdTargets: sections.dailyBdTargets.map(s => ({ name: s.title, sub: s.sub })),
          recentPlacement: sections.recentPlacement,
          navinMode: sections.navinMode,
          bdSilenceDays: sections.bdSilenceDays,
        };
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ sections: compact }),
        });
        const j = await resp.json();
        if (!cancelled) setTopLine(j.line || "");
      } catch {
        if (!cancelled) setTopLine("");
      } finally { if (!cancelled) setLoadingLine(false); }
    })();
    return () => { cancelled = true; };
  }, [sections, allEmpty]);

  if (isLoading) {
    return (
      <div className="fixed inset-0" style={{ background: COCKPIT.bg, marginLeft: "var(--sidebar-width, 0)" }}>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: COCKPIT.blue }} />
        </div>
      </div>
    );
  }
  if (!sections) return null;

  const navinMode = sections.navinMode;




  return (
    <div
      className="min-h-screen w-full"
      style={{ background: COCKPIT.bg, color: COCKPIT.textPrimary }}
    >
      {/* ============== COACH BANNER ============== */}
      <div
        className="w-full px-6 py-5 flex items-start gap-4"
        style={{ background: COCKPIT.panel, borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ background: `${COCKPIT.blue}22` }}
        >
          <Zap className="h-5 w-5" style={{ color: COCKPIT.blue }} fill={COCKPIT.blue} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: COCKPIT.textDim }}>
            Your most important action today
          </div>
          <div className="text-[16px] md:text-[17px] leading-snug font-medium mt-1" style={{ color: COCKPIT.textPrimary }}>
            {loadingLine ? (
              <span style={{ color: COCKPIT.textMuted }}>Reading your desk…</span>
            ) : topLine ? (
              topLine
            ) : navinMode ? (
              "Your pipeline is empty. This is a BD week. Make three calls before midday. That is the only thing that matters today."
            ) : sections.recentPlacement ? (
              "Placement confirmed — well done. Your pipeline just got thinner. Now feed the beast."
            ) : allEmpty ? (
              "Your desk is in good shape. Use this time to build your bench and prospect new roles."
            ) : (
              "Ranked below by what moves revenue today. Work top-down."
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {isManager && team.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 px-3 rounded-md text-[12px] font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", color: COCKPIT.textPrimary }}
                >
                  {viewName} ▾
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewUserId(null)}>My desk</DropdownMenuItem>
                {team.filter(m => m.active && m.member_user_id).map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => setViewUserId(m.member_user_id)}>{m.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="h-9 w-9 rounded-md inline-flex items-center justify-center hover:bg-white/5"
            style={{ color: COCKPIT.textMuted }}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={refresh}
            disabled={isFetching}
            className="h-9 w-9 rounded-md inline-flex items-center justify-center hover:bg-white/5"
            style={{ color: COCKPIT.textMuted }}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ============== WEEKLY STANDARDS PLATES ============== */}
      <WeeklyStandards />

      {/* ============== STATE BANNERS ============== */}
      <div className="px-6 pt-4 space-y-2">
        {sections.recentPlacement && (
          <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: "rgba(39,174,96,0.08)", border: `1px solid ${COCKPIT.green}55` }}>
            <PartyPopper className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COCKPIT.green }} />
            <div className="text-sm">
              <div className="font-semibold" style={{ color: COCKPIT.green }}>
                Placement confirmed — {sections.recentPlacement.name} at {sections.recentPlacement.company}.
              </div>
              <div className="text-xs mt-0.5" style={{ color: COCKPIT.textMuted }}>
                Pipeline just got thinner. Today is a sourcing day, not a celebration day.
              </div>
            </div>
          </div>
        )}
        {sections.bdSilenceDays >= thresholds.bdInactivityDays && sections.bdSilenceDays < 9000 && !navinMode && (
          <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: "rgba(231,76,60,0.08)", border: `1px solid ${COCKPIT.red}66` }}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COCKPIT.red }} />
            <div className="text-sm">
              <div className="font-semibold" style={{ color: COCKPIT.red }}>No BD touchpoint logged in {sections.bdSilenceDays} days.</div>
              <div className="text-xs mt-0.5" style={{ color: COCKPIT.textMuted }}>Pipelines don't fill themselves — close LinkedIn and make calls.</div>
            </div>
          </div>
        )}
        {sections.dailyBdTargets.length > 0 && (
          <div className="rounded-lg" style={{ background: "rgba(231, 76, 60, 0.06)", border: `1px solid ${COCKPIT.red}44` }}>
            <div className="px-4 py-2 flex items-baseline gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: COCKPIT.red }}>
                ⚡ BD target today
              </span>
              <span className="text-[11px]" style={{ color: COCKPIT.textMuted }}>
                Three calls before midday — close LinkedIn.
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${COCKPIT.red}22` }}>
              {sections.dailyBdTargets.map((it, i) => (
                <BillerRow
                  key={it.id} item={it} index={i}
                  expanded={expandedId === it.id}
                  onToggle={() => setExpandedId((p) => p === it.id ? null : it.id)}
                  onLogCall={setLogCallItem} onRefresh={refresh}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ============== UNIFIED RANKED LIST ============== */}
      <div className="px-6 py-4">
        {allEmpty ? (
          <div
            className="rounded-xl px-6 py-16 text-center"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3" style={{ color: COCKPIT.green }} />
            <div className="text-lg font-semibold" style={{ color: COCKPIT.textPrimary }}>
              Your desk is clear today.
            </div>
            <div className="text-sm mt-1" style={{ color: COCKPIT.textMuted }}>
              Good time to build your bench.
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div
              className="px-3 py-2 flex items-baseline gap-3"
              style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COCKPIT.textPrimary }}>
                Today, ranked
              </div>
              <div className="text-[11px]" style={{ color: COCKPIT.textDim }}>
                {allItems.length} action{allItems.length === 1 ? "" : "s"} · protect what's in motion, then drive new business
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {allItems.map((it, i) => (
                <BillerRow
                  key={it.id} item={it} index={i}
                  expanded={expandedId === it.id}
                  onToggle={() => setExpandedId((p) => p === it.id ? null : it.id)}
                  onLogCall={setLogCallItem} onRefresh={refresh}
                  onOpenGap={setGapItem}
                />
              ))}
            </div>
          </div>
        )}
      </div>


      {/* ============== DIALOGS ============== */}
      {logCallItem && logCallItem.logEntityType && logCallItem.logEntityId && logCallItem.logEntityName && (
        <LogTouchpointModal
          open={!!logCallItem}
          onOpenChange={(o) => {
            if (!o) {
              const id = logCallItem.id;
              setLogCallItem(null);
              markItemDone(id);
              refresh();
            }
          }}
          entityType={logCallItem.logEntityType}
          entityId={logCallItem.logEntityId}
          entityName={logCallItem.logEntityName}
        />
      )}

      <PipelineGapDialog
        open={!!gapItem}
        onOpenChange={(o) => { if (!o) setGapItem(null); }}
        data={gapItem?.pipelineGap || null}
      />

      <ThresholdsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => { setThresholds(loadThresholds()); refresh(); }}
      />
    </div>
  );
}
