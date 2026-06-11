import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronRight, RefreshCw, Sparkles, Loader2, Phone, AlertTriangle,
  Shield, Swords, PartyPopper, Settings, MoreVertical, Check, Clock,
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

type SectionKey = "close" | "feed";

const toneBorder = (tone: BillerItem["tone"]) => {
  switch (tone) {
    case "red": return "border-l-4 border-l-red-500";
    case "amber": return "border-l-4 border-l-amber-500";
    case "yellow": return "border-l-4 border-l-yellow-500";
    case "green": return "border-l-4 border-l-emerald-500";
  }
};
const toneSignal = (tone: BillerItem["tone"]) => {
  switch (tone) {
    case "red": return "text-red-400";
    case "amber": return "text-amber-400";
    case "yellow": return "text-yellow-400";
    case "green": return "text-emerald-400";
  }
};

function SectionRow({ item, onLogCall, onRefresh, onOpenGap }: { item: BillerItem; onLogCall: (it: BillerItem) => void; onRefresh: () => void; onOpenGap?: (it: BillerItem) => void }) {
  const nav = useNavigate();
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);

  const handleDone = () => { markItemDone(item.id); onRefresh(); };
  const handleSnooze = (days: 1 | 3 | 7) => { snoozeItem(item.id, days); onRefresh(); };

  return (
    <div className={`w-full flex items-start gap-3 py-3 px-3 border-b border-border hover:bg-muted/30 transition-colors ${toneBorder(item.tone)}`}>
      <button onClick={() => { if (item.pipelineGap && onOpenGap) onOpenGap(item); else if (item.href) nav(item.href); }} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-foreground">{item.title}</div>
        {item.sub && <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>}
        {item.signal && <div className={`text-xs mt-0.5 ${toneSignal(item.tone)}`}>{item.signal}</div>}
        <div className="text-xs text-primary font-medium mt-1">→ {item.action}</div>
      </button>
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {canLog && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onLogCall(item); }}>
            <Phone className="h-3 w-3 mr-1" /> Log
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDone}><Check className="h-3.5 w-3.5 mr-2" /> Mark done</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleSnooze(1)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSnooze(3)}><Clock className="h-3.5 w-3.5 mr-2" /> 3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSnooze(7)}><Clock className="h-3.5 w-3.5 mr-2" /> 1 week</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SectionShell({
  tone, icon, header, subheader, items, collapsed, onToggle, emptyMessage, onLogCall, onRefresh, onOpenGap,
}: {
  tone: "amber" | "green";
  icon: React.ReactNode;
  header: string;
  subheader: string;
  items: BillerItem[];
  collapsed: boolean;
  onToggle: () => void;
  emptyMessage: string;
  onLogCall: (it: BillerItem) => void;
  onRefresh: () => void;
  onOpenGap?: (it: BillerItem) => void;
}) {
  const headerClass = tone === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5";
  const iconClass = tone === "amber" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`border rounded-lg overflow-hidden ${headerClass}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <div className={iconClass}>{icon}</div>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold flex items-center gap-2">
            {header}<span className="text-xs text-muted-foreground font-normal">({items.length})</span>
          </div>
          <div className="text-xs text-muted-foreground">{subheader}</div>
        </div>
      </button>
      {!collapsed && (
        <div className="bg-card">
          {items.length === 0
            ? <div className="px-4 py-6 text-sm text-muted-foreground text-center">{emptyMessage}</div>
            : items.map((it) => <SectionRow key={it.id} item={it} onLogCall={onLogCall} onRefresh={onRefresh} onOpenGap={onOpenGap} />)}
        </div>
      )}
    </div>
  );
}

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
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({ close: false, feed: false });
  const [topLine, setTopLine] = useState<string>("");
  const [loadingLine, setLoadingLine] = useState(false);
  const [logCallItem, setLogCallItem] = useState<BillerItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholds, setThresholds] = useState<BillerThresholds>(loadThresholds());

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

  const toggle = (k: SectionKey) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!sections) return null;

  const navinMode = sections.navinMode;
  const feedHeader = sections.recentPlacement ? "⚔️ Feed the Beast — don't stop now" : "⚔️ Feed the Beast";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Biller's Workflow</h1>
          <p className="text-sm text-muted-foreground">Where is the money — and what do I do right now to protect it and grow it?</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && team.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">{viewName} ▾</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewUserId(null)}>My desk</DropdownMenuItem>
                {team.filter(m => m.active && m.member_user_id).map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => setViewUserId(m.member_user_id)}>{m.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Coach one-liner */}
      <div className="border border-primary/30 bg-primary/5 rounded-lg px-4 py-3 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          {loadingLine ? (
            <span className="text-muted-foreground">Reading your desk…</span>
          ) : topLine ? (
            <>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Your most important action today</div>
              <span className="font-medium">{topLine}</span>
            </>
          ) : navinMode ? (
            <span className="font-medium">Your pipeline is empty. This is a BD week. Make three calls before midday. That is the only thing that matters today.</span>
          ) : sections.recentPlacement ? (
            <span className="font-medium">Placement confirmed — well done. Your pipeline just got thinner. Now feed the beast.</span>
          ) : allEmpty ? (
            <span className="text-muted-foreground">Your desk is in good shape. Use this time to build your bench and prospect new roles.</span>
          ) : null}
        </div>
      </div>

      {/* Anti-placement euphoria banner */}
      {sections.recentPlacement && (
        <div className="border border-emerald-500/40 bg-emerald-500/5 rounded-lg px-4 py-3 flex items-start gap-3">
          <PartyPopper className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-emerald-300">
              Placement confirmed — {sections.recentPlacement.name} at {sections.recentPlacement.company}.
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Pipeline just got thinner. Today is a sourcing day, not a celebration day. Feed the beast ↓
            </div>
          </div>
        </div>
      )}

      {/* BD silence */}
      {sections.bdSilenceDays >= thresholds.bdInactivityDays && sections.bdSilenceDays < 9000 && !navinMode && (
        <div className="border border-red-500/40 bg-red-500/5 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-red-300">No BD touchpoint logged in {sections.bdSilenceDays} days.</div>
            <div className="text-xs text-muted-foreground mt-0.5">Pipelines don't fill themselves. The BD calls are below — close LinkedIn and make them.</div>
          </div>
        </div>
      )}

      {/* Daily BD target block — sits at top of Feed when present */}
      {sections.dailyBdTargets.length > 0 && (
        <div className="border border-red-500/40 bg-red-500/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/30">
            <div className="text-sm font-semibold text-red-300">YOUR BD TARGET TODAY — 3 calls before midday</div>
            <div className="text-xs text-muted-foreground mt-0.5">Not emails. Not LinkedIn. Calls. Close LinkedIn — make these three first.</div>
          </div>
          <div className="bg-card">
            {sections.dailyBdTargets.map((it) => <SectionRow key={it.id} item={it} onLogCall={setLogCallItem} onRefresh={refresh} />)}
          </div>
        </div>
      )}

      {allEmpty ? (
        <div className="border border-border rounded-lg bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Your desk is in good shape. Use this time to build your bench and prospect for new roles.
        </div>
      ) : (
        <>
          {!navinMode && (
            <SectionShell
              tone="amber"
              icon={<Shield className="h-4 w-4" />}
              header="🛡️ Close & Protect"
              subheader="Protect the money in motion"
              items={sections.closeProtect}
              collapsed={collapsed.close}
              onToggle={() => toggle("close")}
              emptyMessage="No active deals at risk. Good position — now feed the beast ↓"
              onLogCall={setLogCallItem}
              onRefresh={refresh}
            />
          )}

          <SectionShell
            tone="green"
            icon={<Swords className="h-4 w-4" />}
            header={feedHeader}
            subheader="Drive next month's revenue now"
            items={sections.feedTheBeast}
            collapsed={collapsed.feed}
            onToggle={() => toggle("feed")}
            emptyMessage="Pipeline is well fed. Focus on closing what you have ↑"
            onLogCall={setLogCallItem}
            onRefresh={refresh}
          />
        </>
      )}

      {logCallItem && logCallItem.logEntityType && logCallItem.logEntityId && logCallItem.logEntityName && (
        <LogTouchpointModal
          open={!!logCallItem}
          onOpenChange={(o) => {
            if (!o) {
              // hide item for the rest of the day after logging
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

      <ThresholdsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => { setThresholds(loadThresholds()); refresh(); }}
      />
    </div>
  );
}
