import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

export function DangerZoneSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const reset = () => {
    setConfirm("");
    setDone(false);
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("clear_user_data" as any);
      if (error) throw error;
      qc.invalidateQueries();
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear data");
    } finally {
      setBusy(false);
    }
  };

  const handleGoToDesk = () => {
    setOpen(false);
    reset();
    navigate("/");
  };

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-medium text-destructive">Danger Zone</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Permanently remove all imported and added data from your account. Your profile, settings, templates and talent pool definitions are kept.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Clear all data
        </Button>
        <LinkedInConnectionCleanup />
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-lg">
          {!done ? (
            <>
              <DialogHeader>
                <DialogTitle>Clear all data</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      This will permanently delete all candidates, contacts, clients, jobs, applications, notes, signals, activity and placements from your account.
                    </p>
                    <p className="text-destructive font-medium">This cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Type DELETE to confirm:</label>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" autoFocus />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" onClick={handleClear} disabled={confirm !== "DELETE" || busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Confirm — clear everything
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <DialogTitle>All data cleared</DialogTitle>
                </div>
                <DialogDescription asChild>
                  <div className="space-y-1 pt-2">
                    <p>Your settings and templates have been kept.</p>
                    <p>Ready for a fresh start.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={handleGoToDesk}>Go to My Desk</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScanResult = {
  total: number;
  safeToDelete: number;
  withActivity: number;
  earliest: string | null;
  latest: string | null;
};

function LinkedInConnectionCleanup() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ deleted: number } | null>(null);

  const reset = () => {
    setScan(null);
    setConfirm("");
    setDone(null);
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      setScanning(true);
      try {
        const { data: cands, error } = await supabase
          .from("candidates")
          .select("id, created_at")
          .eq("source", "LinkedIn Connection");
        if (error) throw error;
        const ids = (cands ?? []).map((c: any) => c.id);
        if (ids.length === 0) {
          setScan({ total: 0, safeToDelete: 0, withActivity: 0, earliest: null, latest: null });
          return;
        }

        // Find candidates with any activity signal
        const active = new Set<string>();
        const chunk = <T,>(arr: T[], n: number) =>
          Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
        const chunks = chunk(ids, 500);
        for (const c of chunks) {
          const [notes, cjs, acts] = await Promise.all([
            supabase.from("notes").select("candidate_id").in("candidate_id", c),
            supabase.from("candidate_jobs").select("candidate_id").in("candidate_id", c),
            supabase.from("activity_log").select("candidate_id, action_type").in("candidate_id", c).neq("action_type", "candidate_created"),
          ]);
          (notes.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
          (cjs.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
          (acts.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
        }

        const dates = (cands ?? []).map((c: any) => c.created_at).filter(Boolean).sort();
        setScan({
          total: ids.length,
          withActivity: active.size,
          safeToDelete: ids.length - active.size,
          earliest: dates[0] ?? null,
          latest: dates[dates.length - 1] ?? null,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Scan failed");
        setOpen(false);
      } finally {
        setScanning(false);
      }
    })();
  }, [open]);

  const handleDelete = async () => {
    if (!scan) return;
    setBusy(true);
    try {
      // Re-fetch safe ids at delete time (still filter out any that gained activity since scan)
      const { data: cands, error } = await supabase
        .from("candidates")
        .select("id")
        .eq("source", "LinkedIn Connection");
      if (error) throw error;
      const allIds = (cands ?? []).map((c: any) => c.id);

      const active = new Set<string>();
      const chunk = <T,>(arr: T[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
      for (const c of chunk(allIds, 500)) {
        const [notes, cjs, acts] = await Promise.all([
          supabase.from("notes").select("candidate_id").in("candidate_id", c),
          supabase.from("candidate_jobs").select("candidate_id").in("candidate_id", c),
          supabase.from("activity_log").select("candidate_id, action_type").in("candidate_id", c).neq("action_type", "candidate_created"),
        ]);
        (notes.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
        (cjs.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
        (acts.data ?? []).forEach((r: any) => r.candidate_id && active.add(r.candidate_id));
      }
      const deletable = allIds.filter((id: string) => !active.has(id));

      // Best-effort cleanup of dependent rows that don't cascade
      for (const c of chunk(deletable, 500)) {
        await supabase.from("candidate_tags").delete().in("candidate_id", c);
        await supabase.from("candidate_talent_pools").delete().in("candidate_id", c);
        await supabase.from("activity_log").delete().in("candidate_id", c);
      }

      let deleted = 0;
      for (const c of chunk(deletable, 500)) {
        const { error: delErr, count } = await supabase
          .from("candidates")
          .delete({ count: "exact" })
          .in("id", c);
        if (delErr) throw delErr;
        deleted += count ?? c.length;
      }

      // Audit record
      await logActivity({
        action_type: "candidate_deleted",
        metadata: {
          bulk: true,
          reason: "linkedin_connection_cleanup",
          source_filter: "LinkedIn Connection",
          scanned_total: allIds.length,
          skipped_with_activity: active.size,
          deleted_count: deleted,
          initiated_at: new Date().toISOString(),
        },
      });

      qc.invalidateQueries();
      setDone({ deleted });
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/50 text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete LinkedIn Connection imports
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-lg">
          {done ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <DialogTitle>Cleanup complete</DialogTitle>
                </div>
                <DialogDescription asChild>
                  <div className="space-y-1 pt-2">
                    <p>Deleted <span className="font-medium text-foreground">{done.deleted.toLocaleString()}</span> candidates.</p>
                    <p className="text-xs text-muted-foreground">An audit record was written to your activity log.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete LinkedIn Connection imports</DialogTitle>
                <DialogDescription>
                  Remove candidate records imported with source <span className="font-mono text-foreground">"LinkedIn Connection"</span> that have no activity since being added.
                </DialogDescription>
              </DialogHeader>

              {scanning || !scan ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning your records…
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1.5">
                    <Row label="Total LinkedIn Connection records" value={scan.total.toLocaleString()} />
                    <Row label="Have activity (kept)" value={scan.withActivity.toLocaleString()} />
                    <Row
                      label="Safe to delete"
                      value={scan.safeToDelete.toLocaleString()}
                      strong
                    />
                    {scan.earliest && (
                      <Row
                        label="Imported between"
                        value={`${new Date(scan.earliest).toLocaleDateString()} – ${new Date(scan.latest!).toLocaleDateString()}`}
                      />
                    )}
                  </div>

                  {scan.safeToDelete === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing to delete.</p>
                  ) : (
                    <>
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                        <p className="font-medium flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" /> Final warning
                        </p>
                        <p className="text-destructive/90">
                          {scan.safeToDelete.toLocaleString()} candidate records will be permanently deleted. This cannot be undone. Any records with notes, pipeline entries, or logged calls are kept.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Type <span className="font-mono">DELETE</span> to confirm:</label>
                        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" autoFocus />
                      </div>
                    </>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                {scan && scan.safeToDelete > 0 && (
                  <Button variant="destructive" onClick={handleDelete} disabled={confirm !== "DELETE" || busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    Delete {scan.safeToDelete.toLocaleString()} records
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
