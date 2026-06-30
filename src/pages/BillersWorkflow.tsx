import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Loader2, Phone, AlertTriangle, Zap, PartyPopper, Settings,
  MoreVertical, Check, Clock, CheckCircle2, Sparkles,
} from "lucide-react";
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
const toneBadge = (tone: BillerItem["tone"]) => {
  switch (tone) {
    case "red": return { dot: "🔴", label: "Critical" };
    case "amber": return { dot: "🟡", label: "Needs attention" };
    case "yellow": return { dot: "🟡", label: "Watch" };
    case "green": return { dot: "🟢", label: "Opportunity" };
  }
};

// ---- Subsection routing by item id prefix ----
type Sub = { key: string; label: string };
const CLOSE_SUBS: Sub[] = [
  { key: "imminent", label: "IMMINENT MONEY" },
  { key: "risk", label: "DEALS AT RISK" },
  { key: "gaps", label: "PIPELINE GAPS" },
];
const FEED_SUBS: Sub[] = [
  { key: "cvs", label: "GET CVS OUT" },
  { key: "reactivate", label: "REACTIVATE" },
  { key: "reengage", label: "RE-ENGAGE" },
  { key: "build", label: "BUILD" },
];

const subForClose = (id: string): string => {
  if (id.startsWith("cp-notice")) return "imminent";
  if (id.startsWith("cp-offercold") || id.startsWith("cp-co") || id.startsWith("cp-backup")) return "risk";
  return "gaps"; // cp-thin, cp-quiet, cp-livesilence
};
const subForFeed = (id: string): string => {
  if (id.startsWith("ftb-reply")) return "reengage";
  if (id.startsWith("ftb-silver") || id.startsWith("ftb-warm") || id.startsWith("ftb-ref")) return "reactivate";
  if (id.startsWith("ftb-pool")) return "cvs";
  return "build"; // ftb-bd and fallthrough
};

// ---- One card ----
function CockpitCard({
  item, index, onLogCall, onRefresh, onOpenGap,
}: {
  item: BillerItem;
  index: number;
  onLogCall: (it: BillerItem) => void;
  onRefresh: () => void;
  onOpenGap?: (it: BillerItem) => void;
}) {
  const nav = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);
  const accent = toneColor(item.tone);
  const badge = toneBadge(item.tone);

  const finish = (fn: () => void) => {
    setLeaving(true);
    setTimeout(() => { fn(); onRefresh(); }, 180);
  };
  const handleDone = () => finish(() => markItemDone(item.id));
  const handleSnooze = (days: 1 | 3 | 7) => finish(() => snoozeItem(item.id, days));

  const titleParts = item.title.split(" → ");
  const name = titleParts[0];
  const rest = titleParts.slice(1).join(" → ");

  return (
    <div
      className="relative rounded-lg mb-2 animate-fade-in transition-all duration-200"
      style={{
        background: COCKPIT.card,
        borderLeft: `3px solid ${accent}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        padding: "14px 16px",
        animationDelay: `${Math.min(index * 30, 240)}ms`,
        opacity: leaving ? 0 : undefined,
        transform: leaving ? "translateY(-6px)" : undefined,
      }}
    >
      {/* badge top right */}
      <div
        className="absolute top-2 right-3 text-[10px] font-semibold tracking-wide flex items-center gap-1"
        style={{ color: accent }}
      >
        <span aria-hidden>{badge.dot}</span>
        <span className="uppercase">{badge.label}</span>
      </div>

      <button
        onClick={() => { if (item.pipelineGap && onOpenGap) onOpenGap(item); else if (item.href) nav(item.href); }}
        className="block w-full text-left pr-24"
      >
        <div className="text-sm font-semibold leading-tight" style={{ color: COCKPIT.textPrimary }}>
          {name}
          {rest && (
            <span className="font-normal" style={{ color: COCKPIT.textMuted }}> → {rest}</span>
          )}
        </div>
        {item.sub && (
          <div className="text-xs mt-1" style={{ color: COCKPIT.textMuted }}>{item.sub}</div>
        )}
        {item.signal && (
          <div className="text-[13px] mt-1.5 leading-snug" style={{ color: COCKPIT.textPrimary }}>
            {item.signal}
          </div>
        )}
        <div className="text-[13px] font-semibold mt-2" style={{ color: accent }}>
          → {item.action}
        </div>
      </button>

      <div className="flex items-center justify-end gap-2 mt-3">
        {canLog && (
          <button
            onClick={(e) => { e.stopPropagation(); onLogCall(item); }}
            className="h-7 px-3 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            style={{ background: `${accent}33`, color: accent }}
          >
            <Phone className="h-3 w-3" /> Log call
          </button>
        )}
        <button
          onClick={handleDone}
          className="h-7 px-3 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
          style={{ background: `${accent}26`, color: accent }}
        >
          <Check className="h-3 w-3" /> Done
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 rounded-full inline-flex items-center justify-center"
              style={{ color: COCKPIT.textMuted }}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleSnooze(1)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSnooze(3)}><Clock className="h-3.5 w-3.5 mr-2" /> 3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSnooze(7)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 week</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDone}><Check className="h-3.5 w-3.5 mr-2" /> Mark done</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ---- Sub-section label ----
function SubLabel({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] font-semibold mt-4 mb-1.5"
      style={{ color: COCKPIT.textDim, letterSpacing: "0.1em" }}
    >
      {label}
    </div>
  );
}

// ---- Column ----
function Column({
  tone, icon, title, subtitle, items, emptyMessage, onLogCall, onRefresh, onOpenGap, subs, subRouter,
  topSlot,
}: {
  tone: "amber" | "green";
  icon: string;
  title: string;
  subtitle: string;
  items: BillerItem[];
  emptyMessage: { line1: string; line2?: string };
  onLogCall: (it: BillerItem) => void;
  onRefresh: () => void;
  onOpenGap?: (it: BillerItem) => void;
  subs: Sub[];
  subRouter: (id: string) => string;
  topSlot?: React.ReactNode;
}) {
  const accent = tone === "amber" ? COCKPIT.amber : COCKPIT.green;
  const tint = tone === "amber" ? "rgba(245, 166, 35, 0.15)" : "rgba(39, 174, 96, 0.15)";

  const grouped = useMemo(() => {
    const m = new Map<string, BillerItem[]>();
    for (const s of subs) m.set(s.key, []);
    for (const it of items) {
      const key = subRouter(it.id);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(it);
    }
    return m;
  }, [items, subs, subRouter]);

  const hasAny = items.length > 0 || !!topSlot;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div
        className="sticky top-0 z-10 px-4 py-4"
        style={{ background: tint, borderBottom: `2px solid ${accent}`, backdropFilter: "blur(6px)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none" aria-hidden>{icon}</span>
          <div className="text-[18px] font-bold" style={{ color: COCKPIT.textPrimary }}>{title}</div>
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: COCKPIT.textMuted }}>{subtitle}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ maxHeight: "calc(100vh - 220px)" }}>
        {topSlot}
        {!hasAny ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-6 w-6 mb-2" style={{ color: COCKPIT.green }} />
            <div className="text-sm font-medium" style={{ color: COCKPIT.green }}>{emptyMessage.line1}</div>
            {emptyMessage.line2 && (
              <div className="text-xs mt-1" style={{ color: COCKPIT.textMuted }}>{emptyMessage.line2}</div>
            )}
          </div>
        ) : (
          subs.map((s) => {
            const list = grouped.get(s.key) || [];
            if (list.length === 0) return null;
            return (
              <div key={s.key}>
                <SubLabel label={s.label} />
                {list.map((it, i) => (
                  <CockpitCard
                    key={it.id} item={it} index={i}
                    onLogCall={onLogCall} onRefresh={onRefresh} onOpenGap={onOpenGap}
                  />
                ))}
              </div>
            );
          })
        )}
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

  const { data, isLoading, refetch, isFetching } = useBillersWorkflow(viewUserId, thresholds);
  const sections = useMemo(() => data, [data]);

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

  // Top slot for Feed column: BD daily target block (kept on Feed side)
  const bdTargetSlot = sections.dailyBdTargets.length > 0 ? (
    <div
      className="rounded-lg mb-3 mt-3"
      style={{ background: "rgba(231, 76, 60, 0.08)", border: `1px solid ${COCKPIT.red}55` }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: `${COCKPIT.red}33` }}>
        <div className="text-sm font-bold" style={{ color: COCKPIT.red }}>
          ⚡ YOUR BD TARGET TODAY — 3 CALLS BEFORE MIDDAY
        </div>
        <div className="text-xs mt-0.5" style={{ color: COCKPIT.textMuted }}>
          Not emails. Not LinkedIn. Calls. Close LinkedIn — make these three first.
        </div>
      </div>
      <div className="px-2 py-2">
        {sections.dailyBdTargets.map((it, i) => (
          <CockpitCard key={it.id} item={it} index={i} onLogCall={setLogCallItem} onRefresh={refresh} />
        ))}
      </div>
    </div>
  ) : null;

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
              "Scan the cockpit below — protect what's in motion, then feed the beast."
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
                Pipeline just got thinner. Today is a sourcing day, not a celebration day. Feed the beast →
              </div>
            </div>
          </div>
        )}
        {sections.bdSilenceDays >= thresholds.bdInactivityDays && sections.bdSilenceDays < 9000 && !navinMode && (
          <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: "rgba(231,76,60,0.08)", border: `1px solid ${COCKPIT.red}66` }}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COCKPIT.red }} />
            <div className="text-sm">
              <div className="font-semibold" style={{ color: COCKPIT.red }}>No BD touchpoint logged in {sections.bdSilenceDays} days.</div>
              <div className="text-xs mt-0.5" style={{ color: COCKPIT.textMuted }}>Pipelines don't fill themselves. The BD calls are on the right — close LinkedIn and make them.</div>
            </div>
          </div>
        )}
      </div>

      {/* ============== COCKPIT GRID ============== */}
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
            className="grid gap-[4%] md:gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full" style={{ gridColumn: "1 / -1" }}>
              {!navinMode && (
                <Column
                  tone="amber"
                  icon="🛡️"
                  title="Close & Protect"
                  subtitle="Protect the money in motion"
                  items={sections.closeProtect}
                  emptyMessage={{ line1: "No active deals at risk", line2: "Now feed the beast →" }}
                  onLogCall={setLogCallItem}
                  onRefresh={refresh}
                  onOpenGap={setGapItem}
                  subs={CLOSE_SUBS}
                  subRouter={subForClose}
                />
              )}
              <div className={navinMode ? "md:col-span-2" : ""}>
                <Column
                  tone="green"
                  icon="⚔️"
                  title={sections.recentPlacement ? "Feed the Beast — don't stop now" : "Feed the Beast"}
                  subtitle="Drive next month's revenue"
                  items={sections.feedTheBeast}
                  emptyMessage={{ line1: "Pipeline looking healthy", line2: "Focus on closing what you have ←" }}
                  onLogCall={setLogCallItem}
                  onRefresh={refresh}
                  subs={FEED_SUBS}
                  subRouter={subForFeed}
                  topSlot={bdTargetSlot}
                />
              </div>
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
