import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function DangerZoneSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const handleClear = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("clear_user_data" as any);
      if (error) throw error;
      toast.success("All data cleared");
      setOpen(false);
      setConfirm("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear data");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-medium text-destructive">Danger Zone</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Permanently remove all imported and added data from your account. Your profile, settings and preferences are kept.
      </p>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Clear all data
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirm(""); setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Clear all data</DialogTitle>
            <DialogDescription>
              This will permanently delete all candidates, clients, contacts, jobs, applications, notes, signals and activity from your account.
              <br /><br />
              <span className="text-destructive font-medium">This cannot be undone.</span>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
