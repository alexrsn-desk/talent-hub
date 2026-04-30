import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DNC_CHANNELS, DNC_REASONS, useClearDoNotContact, useSetDoNotContact, type EntityType } from "@/hooks/use-compliance";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  isCurrentlyDnc: boolean;
};

export function DoNotContactDialog({ open, onOpenChange, entityType, entityId, entityName, isCurrentlyDnc }: Props) {
  const [reason, setReason] = useState<string>(DNC_REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [channel, setChannel] = useState<string>(DNC_CHANNELS[0]);
  const [notes, setNotes] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const setDnc = useSetDoNotContact();
  const clearDnc = useClearDoNotContact();

  const reset = () => {
    setReason(DNC_REASONS[0]);
    setReasonOther("");
    setChannel(DNC_CHANNELS[0]);
    setNotes("");
    setConfirmClear(false);
  };

  const handleConfirm = async () => {
    try {
      await setDnc.mutateAsync({
        entityType,
        entityId,
        entityName,
        reason,
        reasonOther: reasonOther.trim() || null,
        channel,
        notes: notes.trim() || null,
      });
      toast.success("Do Not Contact applied");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  const handleClear = async () => {
    try {
      await clearDnc.mutateAsync({ entityType, entityId, entityName });
      toast.success("Do Not Contact removed");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        {isCurrentlyDnc ? (
          <>
            <DialogHeader>
              <DialogTitle>Remove Do Not Contact</DialogTitle>
              <DialogDescription>
                {entityName} is currently marked Do Not Contact. Removing this lifts all system-wide blocks.
                Only do this if the person has confirmed they wish to be contacted again.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={confirmClear} onChange={(e) => setConfirmClear(e.target.checked)} />
              <span>I confirm {entityName} has explicitly asked to be contactable again.</span>
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleClear} disabled={!confirmClear || clearDnc.isPending}>
                {clearDnc.isPending ? "Removing..." : "Remove Do Not Contact"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Mark as Do Not Contact</DialogTitle>
              <DialogDescription>
                Once applied, {entityName} will be blocked from sequences, check-ins and bulk outreach across Desky.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label>Reason *</Label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DNC_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {reason === "Other" && (
                <div>
                  <Label>Please specify</Label>
                  <Input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} />
                </div>
              )}

              <div>
                <Label>Date of request</Label>
                <Input value={new Date().toLocaleDateString()} disabled />
              </div>

              <div>
                <Label>How received *</Label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DNC_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={setDnc.isPending || (reason === "Other" && !reasonOther.trim())}
              >
                {setDnc.isPending ? "Saving..." : "Confirm Do Not Contact"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
