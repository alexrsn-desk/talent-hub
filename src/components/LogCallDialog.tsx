import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useLogCall } from "@/hooks/use-judgement";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function LogCallDialog({
  candidateId,
  open,
  onOpenChange,
  trigger,
}: {
  candidateId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [date, setDate] = useState(today());
  const [duration, setDuration] = useState("");
  const [content, setContent] = useState("");
  const logCall = useLogCall();

  const save = async () => {
    if (!content.trim()) {
      toast.error("Add what you discussed first");
      return;
    }
    try {
      const res: any = await logCall.mutateAsync({
        candidate_id: candidateId,
        content: content.trim(),
        call_date: new Date(`${date}T12:00:00`).toISOString(),
        duration_minutes: duration ? parseInt(duration) : null,
        source: "manual",
      });
      toast.success(
        `Call logged — ${res?.claims_extracted ?? 0} impact claim${res?.claims_extracted === 1 ? "" : "s"} extracted`,
      );
      setContent("");
      setDuration("");
      setDate(today());
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not log the call");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-primary" /> Log a call
          </DialogTitle>
          <DialogDescription>
            Paste a transcript from anywhere, or type up notes from memory. Desky extracts impact claims and
            refreshes the judgement profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Call date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Duration (mins, optional)</Label>
              <Input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-9"
                placeholder="30"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">What did you discuss?</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="Paste the transcript, or write up what they said — projects, outcomes, motivations, dealbreakers."
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={logCall.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={logCall.isPending} className="gap-1.5">
            {logCall.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {logCall.isPending ? "Analysing…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
