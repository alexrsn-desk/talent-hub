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
