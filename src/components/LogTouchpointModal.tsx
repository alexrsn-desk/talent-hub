import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateNote } from "@/hooks/use-data";

const TOUCHPOINT_TYPES = ["Call", "Email", "LinkedIn Message", "Meeting", "Text Message", "WhatsApp"] as const;
const OUTCOMES = ["Left Voicemail", "Spoke", "No Answer", "Replied", "No Reply", "Meeting Booked"] as const;

interface LogTouchpointModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "candidate" | "client";
  entityId: string;
  entityName: string;
}

export function LogTouchpointModal({ open, onOpenChange, entityType, entityId, entityName }: LogTouchpointModalProps) {
  const createNote = useCreateNote();
  const [type, setType] = useState<string>("Call");
  const [outcome, setOutcome] = useState<string>("Spoke");
  const [content, setContent] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const handleSubmit = async () => {
    if (!content.trim()) return;
    const payload: any = {
      content: content.trim(),
      activity_type: type,
      outcome,
      follow_up_date: followUpDate || null,
    };
    if (entityType === "candidate") payload.candidate_id = entityId;
    if (entityType === "client") payload.client_id = entityId;
    await createNote.mutateAsync(payload);
    setContent("");
    setFollowUpDate("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Touchpoint — {entityName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOUCHPOINT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              placeholder="Quick summary of the interaction..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] resize-none"
              rows={3}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Follow-up date (optional)</Label>
            <Input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!content.trim() || createNote.isPending}
          >
            {createNote.isPending ? "Saving..." : "Log Touchpoint"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
