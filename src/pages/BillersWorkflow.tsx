import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, RefreshCw, Sparkles, Loader2, Phone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillersWorkflow, type BillerItem } from "@/hooks/use-billers-workflow";
import { useIsManager, useTeamMembers } from "@/hooks/use-team";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";

type SectionKey = "billing" | "cvs" | "pipeline" | "relationships" | "bd";

function SectionRow({
  item,
  onLogCall,
}: {
  item: BillerItem;
  onLogCall?: (item: BillerItem) => void;
}) {
  const nav = useNavigate();
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);
  return (
    <div className="w-full flex items-start gap-3 py-2.5 px-3 border-b border-border hover:bg-muted/30 transition-colors">
      <button
        onClick={() => item.href && nav(item.href)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
        {item.sub && <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>}
        {item.signal && <div className="text-xs text-amber-400 mt-0.5">{item.signal}</div>}
      </button>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        <div className="text-xs text-primary font-medium">→ {item.action}</div>
        {canLog && onLogCall && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); onLogCall(item); }}
          >
            <Phone className="h-3 w-3 mr-1" /> Log call
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({
  id, header, subtext, items, collapsed, onToggle, emptyMessage,
}: {
  id: SectionKey;
  header: string;
  subtext: string;
  items: BillerItem[];
  collapsed: boolean;
  onToggle: () => void;
  emptyMessage?: string;
}) {
  if (items.length === 0 && !emptyMessage) return null;
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30">
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold">{header} <span className="ml-1 text-xs text-muted-foreground">({items.length})</span></div>
          <div className="text-xs text-muted-foreground">{subtext}</div>
        </div>
      </button>
      {!collapsed && (
        <div>
          {items.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">{emptyMessage}</div>
          ) : items.map((it) => <SectionRow key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}

export default function BillersWorkflow() {
  const { user } = useAuth();
  const isManager = useIsManager();
  const { data: team = [] } = useTeamMembers();
  const qc = useQueryClient();
  const [viewUserId, setViewUserId] = useState<string | null>(null); // null = my desk
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    billing: false, cvs: false, pipeline: false, relationships: false, bd: false,
  });
  const [topLine, setTopLine] = useState<string>("");
  const [loadingLine, setLoadingLine] = useState(false);

  const { data, isLoading, refetch, isFetching } = useBillersWorkflow(viewUserId);

  const sections = useMemo(() => data, [data]);
  const allEmpty =
    sections &&
    sections.closestToBilling.length === 0 &&
    sections.chaseSubmissions.length === 0 &&
    sections.readyToSend.length === 0 &&
    sections.fillPipeline.length === 0 &&
    sections.protectRelationships.length === 0 &&
    sections.placedClients.length === 0 &&
    sections.placedCandidates.length === 0 &&
    sections.warmProspectsQuiet.length === 0;

  const viewName = viewUserId
    ? team.find((m) => m.member_user_id === viewUserId)?.name || "Consultant"
    : "My desk";

  // Fetch AI top line whenever sections change
  useEffect(() => {
    if (!sections || allEmpty) { setTopLine(""); return; }
    let cancelled = false;
    (async () => {
      setLoadingLine(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billers-top-action`;
        const compact = {
          closestToBilling: sections.closestToBilling.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal, a: s.action })),
          chaseSubmissions: sections.chaseSubmissions.slice(0, 6).map(s => ({ t: s.title, sub: s.sub })),
          readyToSend: sections.readyToSend.slice(0, 6).map(s => ({ t: s.title, sub: s.sub })),
          fillPipeline: sections.fillPipeline.slice(0, 6).map(s => ({ t: s.title, sub: s.sub, sig: s.signal })),
          protectRelationships: sections.protectRelationships.slice(0, 8).map(s => ({ t: s.title, sub: s.sub, sig: s.signal })),
          placedClients: sections.placedClients.slice(0, 6).map(s => ({ t: s.title, sub: s.sub })),
          placedCandidates: sections.placedCandidates.slice(0, 6).map(s => ({ t: s.title, sub: s.sub })),
          warmProspectsQuiet: sections.warmProspectsQuiet.slice(0, 6).map(s => ({ t: s.title, sub: s.sub, sig: s.signal })),
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Biller's Workflow</h1>
          <p className="text-sm text-muted-foreground">Where is the money — and what moves it closer right now?</p>
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
          <Button variant="ghost" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["billers-workflow"] }); }} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* AI top line */}
      <div className="border border-primary/30 bg-primary/5 rounded-lg px-4 py-3 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          {loadingLine ? (
            <span className="text-muted-foreground">Reading your desk…</span>
          ) : topLine ? (
            <span className="font-medium">{topLine}</span>
          ) : allEmpty ? (
            <span className="text-muted-foreground">Your desk is clear. Good time to build your bench or prospect for new roles.</span>
          ) : (
            <span className="text-muted-foreground">Scan the sections below — start at the top.</span>
          )}
        </div>
      </div>

      {allEmpty ? null : (
        <>
          <Section
            id="billing"
            header="💰 Closest to billing"
            subtext="Do these first. Money is close."
            items={sections!.closestToBilling}
            collapsed={collapsed.billing}
            onToggle={() => toggle("billing")}
          />

          {(sections!.chaseSubmissions.length > 0 || sections!.readyToSend.length >= 0) && (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <button onClick={() => toggle("cvs")} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30">
                {collapsed.cvs ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold">📤 Get CVs out</div>
                  <div className="text-xs text-muted-foreground">CVs working passively in the background while you do other things</div>
                </div>
              </button>
              {!collapsed.cvs && (
                <div>
                  {sections!.chaseSubmissions.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Chase existing submissions</div>
                      {sections!.chaseSubmissions.map((it) => <SectionRow key={it.id} item={it} />)}
                    </>
                  )}
                  <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Ready to send now</div>
                  {sections!.readyToSend.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">No candidates at shortlist stage. Move candidates forward to generate submissions.</div>
                  ) : sections!.readyToSend.map((it) => <SectionRow key={it.id} item={it} />)}
                </div>
              )}
            </div>
          )}

          <Section
            id="pipeline"
            header="🔍 Fill the pipeline"
            subtext="Roles that need more candidates to stay healthy"
            items={sections!.fillPipeline}
            collapsed={collapsed.pipeline}
            onToggle={() => toggle("pipeline")}
            emptyMessage="All pipelines look healthy."
          />

          <Section
            id="relationships"
            header="🤝 Protect relationships"
            subtext="The contacts that keep your desk healthy long term"
            items={sections!.protectRelationships}
            collapsed={collapsed.relationships}
            onToggle={() => toggle("relationships")}
          />

          {/* SECTION 5: BD Engine */}
          {(sections!.placedClients.length > 0 ||
            sections!.placedCandidates.length > 0 ||
            sections!.warmProspectsQuiet.length > 0 ||
            sections!.dailyBdTarget.length > 0) && (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <button onClick={() => toggle("bd")} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30">
                {collapsed.bd ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold">📞 BD Engine</div>
                  <div className="text-xs text-muted-foreground">Where tomorrow's billings come from. Pick up the phone.</div>
                </div>
              </button>
              {!collapsed.bd && (
                <div>
                  {sections!.dailyBdTarget.length > 0 && (
                    <div className="px-4 py-3 border-b border-border bg-primary/5">
                      <div className="text-[11px] uppercase tracking-wide text-primary font-semibold mb-1">
                        Your BD target for today — {sections!.dailyBdTarget.length} call{sections!.dailyBdTarget.length === 1 ? "" : "s"} before midday
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">Not emails. Not LinkedIn messages. Calls. Make these first — everything else can wait.</div>
                      {sections!.dailyBdTarget.map((it) => <SectionRow key={it.id} item={it} />)}
                    </div>
                  )}

                  {sections!.placedClients.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Placed clients — your warmest BD calls ({sections!.placedClients.length})
                      </div>
                      <div className="px-4 pb-1 text-xs text-muted-foreground italic">
                        You've placed at these companies but they haven't given you a role since.
                      </div>
                      {sections!.placedClients.map((it) => <SectionRow key={it.id} item={it} />)}
                    </>
                  )}

                  {sections!.placedCandidates.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Placed candidates — referral sources ({sections!.placedCandidates.length})
                      </div>
                      <div className="px-4 pb-1 text-xs text-muted-foreground italic">
                        Now settled in roles. They know others looking. Check in and ask.
                      </div>
                      {sections!.placedCandidates.map((it) => <SectionRow key={it.id} item={it} />)}
                    </>
                  )}

                  {sections!.warmProspectsQuiet.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Warm prospects gone quiet ({sections!.warmProspectsQuiet.length})
                      </div>
                      <div className="px-4 pb-1 text-xs text-muted-foreground italic">
                        Showed hiring interest but haven't been spoken to in 6+ weeks.
                      </div>
                      {sections!.warmProspectsQuiet.map((it) => <SectionRow key={it.id} item={it} />)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
