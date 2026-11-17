import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SyncState = {
  status: string;
  entity: string | null;
  counts: Record<string, number | string | null>;
  last_error: string | null;
  finished_at: string | null;
};

const LABELS: Record<string, string> = {
  clients: "companies", contacts: "contacts", candidates: "candidates", vacancies: "jobs",
  applications: "pipeline entries", placements: "placements", notes: "notes", meetings: "calls & meetings",
};

async function call(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("spott-sync", { body: { action, ...extra } });
  if (error) {
    const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    throw new Error(details);
  }
  return data as { state: SyncState | null; done?: boolean };
}

export function SpottSyncSection() {
  const [state, setState] = useState<SyncState | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    call("status").then((d) => setState(d.state)).catch(() => {});
    return () => { stop.current = true; };
  }, []);

  const loop = useCallback(async () => {
    setRunning(true);
    try {
      while (!stop.current) {
        const d = await call("step");
        setState(d.state);
        if (d.done) break;
      }
    } catch (e) {
      toast.error(`Spott sync stopped: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }, []);

  const start = async () => {
    try {
      const d = state?.status === "error" ? await call("resume") : await call("start");
      setState(d.state);
      await loop();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const c = state?.counts ?? {};
  const n = (k: string) => Number(c[k] ?? 0);

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Spott</h2>
          <p className="text-xs text-muted-foreground">
            Brings in candidates, companies, contacts, jobs, pipelines, placements, notes and call transcripts. Spott wins when records differ.
          </p>
        </div>
        <Button size="sm" onClick={start} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {running ? "Syncing…" : state?.status === "error" ? "Resume sync" : "Sync from Spott"}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        {running && state?.entity && <p>Working on {LABELS[state.entity] ?? state.entity}…</p>}
        {!running && state?.finished_at && state.status === "done" && (
          <p>Last synced {formatDistanceToNow(new Date(state.finished_at), { addSuffix: true })}.</p>
        )}
        {state?.last_error && <p className="text-destructive">Last sync stopped: {state.last_error}</p>}
        {state && (
          <p>
            This run: {n("candidates_created") + n("candidates_updated")} candidates · {n("clients_created") + n("clients_updated")} companies ·{" "}
            {n("contacts_created") + n("contacts_updated")} contacts · {n("jobs_created") + n("jobs_updated")} jobs ·{" "}
            {n("applications_created") + n("applications_updated")} pipeline entries · {n("notes_created") + n("notes_updated")} notes ·{" "}
            {n("transcripts_created")} new transcripts
          </p>
        )}
      </div>
    </div>
  );
}
