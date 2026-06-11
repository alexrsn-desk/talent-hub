import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, RefreshCw, Sparkles, Loader2, Phone, AlertTriangle, Shield, Swords, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillersWorkflow, type BillerItem } from "@/hooks/use-billers-workflow";
import { useIsManager, useTeamMembers } from "@/hooks/use-team";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";

type SectionKey = "close" | "feed";

function SectionRow({
  item,
  onLogCall,
}: {
  item: BillerItem;
  onLogCall?: (item: BillerItem) => void;
}) {
  const nav = useNavigate();
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);
  const borderClass = item.tone === "amber"
    ? "border-l-4 border-l-amber-500"
    : "border-l-4 border-l-emerald-500";
  const signalClass = item.tone === "amber" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`w-full flex items-start gap-3 py-3 px-3 border-b border-border hover:bg-muted/30 transition-colors ${borderClass}`}>
      <button
        onClick={() => item.href && nav(item.href)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium text-foreground">{item.title}</div>
        {item.sub && <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>}
        {item.signal && <div className={`text-xs mt-0.5 ${signalClass}`}>{item.signal}</div>}
        <div className="text-xs text-primary font-medium mt-1">→ {item.action}</div>
      </button>
      {canLog && onLogCall && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs shrink-0 mt-0.5"
          onClick={(e) => { e.stopPropagation(); onLogCall(item); }}
        >
          <Phone className="h-3 w-3 mr-1" /> Log call
        </Button>
      )}
    </div>
  );
}

function SectionShell({
  tone, icon, header, subheader, items, collapsed, onToggle, emptyMessage, onLogCall,
}: {
  tone: "amber" | "green";
  icon: React.ReactNode;
  header: string;
  subheader: string;
  items: BillerItem[];
  collapsed: boolean;
  onToggle: () => void;
  emptyMessage: string;
  onLogCall: (item: BillerItem) => void;
}) {
  const headerClass = tone === "amber"
    ? "border-amber-500/30 bg-amber-500/5"
    : "border-emerald-500/30 bg-emerald-500/5";
  const iconClass = tone === "amber" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`border rounded-lg overflow-hidden ${headerClass}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <div className={iconClass}>{icon}</div>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold flex items-center gap-2">
            {header}
            <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
          </div>
          <div className="text-xs text-muted-foreground">{subheader}</div>
        </div>
      </button>
      {!collapsed && (
        <div className="bg-card">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">{emptyMessage}</div>
          ) : items.map((it) => <SectionRow key={it.id} item={it} onLogCall={onLogCall} />)}
        </div>
      )}
    </div>
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

  const { data, isLoading, refetch, isFetching } = useBillersWorkflow(viewUserId);
  const sections = useMemo(() => data, [data]);

  const closeEmpty = !sections || sections.closeProtect.length === 0;
  const feedEmpty = !sections || sections.feedTheBeast.length === 0;
  const allEmpty = closeEmpty && feedEmpty;

  const viewName = viewUserId
    ? team.find((m) => m.member_user_id === viewUserId)?.name || "Consultant"
    : "My desk";

  // Pick the single highest priority action across both sections
  const topAction = useMemo<BillerItem | null>(() => {
    if (!sections) return null;
    const all = [...sections.closeProtect, ...sections.feedTheBeast];
    if (all.length === 0) return null;
    return all.sort((a, b) => b.urgency - a.urgency)[0];
  }, [sections]);

  // AI top line generation
  useEffect(() => {
    if (!sections || allEmpty) { setTopLine(""); return; }
    let cancelled = false;
    (async () => {
      setLoadingLine(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billers-top-action`;
        const compact = {
          closeProtect: sections.closeProtect.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal, a: s.action })),
          feedTheBeast: sections.feedTheBeast.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal, a: s.action })),
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
      } finally {
        if (!cancelled) setLoadingLine(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sections, allEmpty]);

  const toggle = (k: SectionKey) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sections) return null;

  // Navin mode: pipeline empty — Feed the Beast takes over
  const navinMode = sections.navinMode;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Biller's Workflow</h1>
          <p className="text-sm text-muted-foreground">Protect money in motion · drive next month's revenue now</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && team.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">{viewName} ▾</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewUserId(null)}>My desk</DropdownMenuItem>
                {team.filter(m => m.active && m.member_user_id).map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => setViewUserId(m.member_user_id)}>{m.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["billers-workflow-v2"] }); }} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Anti-placement euphoria banner */}
      {sections.recentPlacement && (
        <div className="border border-emerald-500/40 bg-emerald-500/5 rounded-lg px-4 py-3 flex items-start gap-3">
          <PartyPopper className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-emerald-300">
              Placement confirmed — {sections.recentPlacement.name} at {sections.recentPlacement.company}. Well done.
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Your pipeline just got thinner. Today is not a day to celebrate — it's a day to feed the beast.
              Focus on the green section below.
            </div>
          </div>
        </div>
      )}

      {/* Navin scenario banner */}
      {navinMode && (
        <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-lg px-4 py-3 flex items-start gap-3">
          <Swords className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-emerald-300">Your pipeline is empty. This is a BD week — not a sourcing week.</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Nothing to protect. Everything below is future money. Make calls before midday — nothing else matters today.
            </div>
          </div>
        </div>
      )}

      {/* BD silence callout */}
      {sections.bdSilenceDays >= 3 && sections.bdSilenceDays < 9000 && !navinMode && (
        <div className="border border-red-500/40 bg-red-500/5 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-red-300">
              No BD touchpoint logged in {sections.bdSilenceDays} days.
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Pipeline will reflect this in 4–6 weeks. Today that changes — the green section below is your fix.
            </div>
          </div>
        </div>
      )}

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
          ) : allEmpty ? (
            <span className="text-muted-foreground">Your desk is in good shape. Use this time to build your bench and prospect for new roles.</span>
          ) : topAction ? (
            <>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Your most important action today</div>
              <span className="font-medium">{topAction.action} — {topAction.title}</span>
            </>
          ) : null}
        </div>
      </div>

      {allEmpty ? (
        <div className="border border-border rounded-lg bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Your desk is in good shape. Use this time to build your bench and prospect for new roles.
        </div>
      ) : (
        <>
          {/* Section 1 — Close & Protect (hidden in Navin mode) */}
          {!navinMode && (
            <SectionShell
              tone="amber"
              icon={<Shield className="h-4 w-4" />}
              header="Close & Protect"
              subheader="Protect the money in motion"
              items={sections.closeProtect}
              collapsed={collapsed.close}
              onToggle={() => toggle("close")}
              emptyMessage="No active deals at risk. Good position — now feed the beast."
              onLogCall={setLogCallItem}
            />
          )}

          {/* Section 2 — Feed the Beast */}
          <SectionShell
            tone="green"
            icon={<Swords className="h-4 w-4" />}
            header="Feed the Beast"
            subheader="Drive next month's revenue now"
            items={sections.feedTheBeast}
            collapsed={collapsed.feed}
            onToggle={() => toggle("feed")}
            emptyMessage="Pipeline looks healthy. Focus on closing active deals."
            onLogCall={setLogCallItem}
          />
        </>
      )}

      {/* Log call modal */}
      {logCallItem && logCallItem.logEntityType && logCallItem.logEntityId && logCallItem.logEntityName && (
        <LogTouchpointModal
          open={!!logCallItem}
          onOpenChange={(o) => { if (!o) setLogCallItem(null); }}
          entityType={logCallItem.logEntityType}
          entityId={logCallItem.logEntityId}
          entityName={logCallItem.logEntityName}
        />
      )}
    </div>
  );
}
