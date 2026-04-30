import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useGdprDelete, type EntityType } from "@/hooks/use-compliance";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
};

export function RequestDeletionDialog({ open, onOpenChange, entityType, entityId, entityName }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const del = useGdprDelete();

  const handle = async () => {
    try {
      await del.mutateAsync({ entityType, entityId, entityName });
      toast.success("Personal data removed and logged");
      onOpenChange(false);
      setConfirmed(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirmed(false); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>GDPR Data Deletion Request</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{entityName}</span> has requested deletion of their personal data under GDPR.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
          <p>This will:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Delete all personal identifiers (name, email, phone, LinkedIn)</li>
            <li>Retain anonymised activity records for legitimate business purposes</li>
            <li>Log the deletion request with date and reason (required by GDPR)</li>
          </ul>
          <p className="font-medium text-destructive">This action cannot be undone.</p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I confirm a valid deletion request has been received.</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handle} disabled={!confirmed || del.isPending}>
            {del.isPending ? "Deleting..." : "Confirm deletion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
