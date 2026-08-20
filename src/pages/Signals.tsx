import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Radar, Bell, X, ExternalLink, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDeskySignals,
  useMonitoredCount,
  useRunSignalsScan,
  useUpdateDeskySignalStatus,
  SIGNAL_TYPE_LABELS,
  type DeskySignal,
} from "@/hooks/use-desky-signals";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";

const HIGH_PRIORITY_THRESHOLD = 60;

type PersonInfo = { id: string; name: string; title: string | null };

function usePeopleForSignals(signals: DeskySignal[]) {
  const candIds = signals.filter((s) => s.person_type === "candidate" && s.person_id).map((s) => s.person_id!);
  const contactIds = signals.filter((s) => s.person_type === "contact" && s.person_id).map((s) => s.person_id!);
  const key = [...new Set([...candIds, ...contactIds])].sort().join(",");

  return useQuery({
    queryKey: ["signal-people", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const db = supabase as any;
      const map: Record<string, PersonInfo> = {};
      if (candIds.length) {
        const { data } = await db.from("candidates").select("id, name, job_title").in("id", [...new Set(candIds)]);
        (data || []).forEach((c: any) => {
          map["candidate:" + c.id] = { id: c.id, name: c.name || "Unnamed", title: c.job_title };
        });
      }
      if (contactIds.length) {
        const { data } = await db.from("contacts").select("id, name, job_title").in("id", [...new Set(contactIds)]);
        (data || []).forEach((c: any) => {
          map["contact:" + c.id] = { id: c.id, name: c.name || "Unnamed", title: c.job_title };
        });
      }
      return map;
    },
  });
}

export default function Signals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: signals = [], isLoading } = useDeskySignals();
  const { data: monitored = 0 } = useMonitoredCount();
  const scan = useRunSignalsScan();
  const updateStatus = useUpdateDeskySignalStatus();
  const { data: people = {} } = usePeopleForSignals(signals);
  const [touchpoint, setTouchpoint] = useState<{ id: string; name: string } | null>(null);
  const scanned = useRef(false);

  // Refresh scores / generate signals once per visit.
  useEffect(() => {
    if (scanned.current || !user) return;
    scanned.current = true;
    scan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const newCount = signals.filter((s) => s.status === "new").length;
  const { high, other } = useMemo(
    () => ({
      high: signals.filter((s) => s.opportunity_score >= HIGH_PRIORITY_THRESHOLD),
      other: signals.filter((s) => s.opportunity_score < HIGH_PRIORITY_THRESHOLD),
    }),
    [signals]
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = (user?.user_metadata?.full_name || user?.email || "").split(/[ @]/)[0];

  const person = (s: DeskySignal): PersonInfo | undefined =>
    s.person_id ? (people as Record<string, PersonInfo>)[`${s.person_type}:${s.person_id}`] : undefined;

  const openProfile = (s: DeskySignal) => {
    const p = person(s);
    if (!p) return;
    if (s.person_type === "candidate") navigate(`/candidates?id=${p.id}`);
    else navigate(`/contacts?id=${p.id}`);
  };

  const contactNow = (s: DeskySignal) => {
    const p = person(s);
    updateStatus.mutate({ id: s.id, status: "actioned" });
    if (s.person_type === "candidate" && p) setTouchpoint({ id: p.id, name: p.name });
    else openProfile(s);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {newCount} opportunit{newCount === 1 ? "y" : "ies"} detected
        </p>
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Radar className="h-3.5 w-3.5 text-primary" />
          <span>Desky is monitoring your {monitored} most valuable relationships.</span>
          <button
            onClick={() => navigate("/settings#signals")}
            className="text-primary hover:underline underline-offset-2"
          >
            View monitoring criteria
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs ml-auto"
            onClick={() => scan.mutate(undefined, {
              onSuccess: (r) => toast.success(`Scan complete — ${r?.created ?? 0} new signal(s)`),
              onError: (e: any) => toast.error(e.message || "Scan failed"),
            })}
            disabled={scan.isPending}
          >
            {scan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Rescan
          </Button>
        </div>
      </header>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : signals.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          No signals right now. Desky will surface opportunities as your relationships change.
        </div>
      ) : (
        <>
          {high.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                High priority
              </h2>
              {high.map((s) => {
                const p = person(s);
                return (
                  <div key={s.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p?.title || "No title on record"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {SIGNAL_TYPE_LABELS[s.signal_type] || s.signal_type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Relationship score {s.relationship_score} · detected{" "}
                      {new Date(s.detected_at).toLocaleDateString()}
                    </p>
                    <div className="rounded-md bg-muted/30 p-2.5 space-y-1">
                      <p className="text-xs font-medium text-foreground">Why now</p>
                      <p className="text-xs text-muted-foreground">{s.reason_for_recommendation}</p>
                      {s.suggested_action && (
                        <p className="text-xs text-foreground">{s.suggested_action}</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => openProfile(s)}>
                        <ExternalLink className="h-3 w-3" /> View
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => contactNow(s)}>
                        <Phone className="h-3 w-3" /> Contact
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => updateStatus.mutate({ id: s.id, status: "dismissed" })}
                      >
                        <X className="h-3 w-3" /> Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {other.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Other signals
              </h2>
              {other.map((s) => {
                const p = person(s);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
                  >
                    <Bell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium shrink-0">{p?.name || "Unknown"}</span>
                    <span className="text-muted-foreground shrink-0">
                      {SIGNAL_TYPE_LABELS[s.signal_type] || s.signal_type}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">
                      {s.reason_for_recommendation}
                    </span>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openProfile(s)}
                    >
                      View
                    </button>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => updateStatus.mutate({ id: s.id, status: "dismissed" })}
                    >
                      Dismiss
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {touchpoint && (
        <LogTouchpointModal
          open={!!touchpoint}
          onOpenChange={(o) => !o && setTouchpoint(null)}
          entityType="candidate"
          entityId={touchpoint.id}
          entityName={touchpoint.name}
        />
      )}
    </div>
  );
}
