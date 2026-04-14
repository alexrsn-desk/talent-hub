import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Slot = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
};

export function InterviewSlotPicker({
  candidateJobId,
  candidateName,
  onClose,
}: {
  candidateJobId: string;
  candidateName: string;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([{ date: "", startTime: "", endTime: "" }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addSlot = () => setSlots([...slots, { date: "", startTime: "", endTime: "" }]);

  const removeSlot = (idx: number) => setSlots(slots.filter((_, i) => i !== idx));

  const updateSlot = (idx: number, field: keyof Slot, value: string) => {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    const validSlots = slots.filter((s) => s.date && s.startTime && s.endTime);
    if (validSlots.length === 0) {
      toast.error("Add at least one valid time slot");
      return;
    }

    setSaving(true);
    try {
      // Delete existing slots for this candidate_job
      await supabase
        .from("interview_slots")
        .delete()
        .eq("candidate_job_id", candidateJobId);

      // Insert new slots
      const inserts = validSlots.map((s) => ({
        candidate_job_id: candidateJobId,
        start_time: new Date(`${s.date}T${s.startTime}`).toISOString(),
        end_time: new Date(`${s.date}T${s.endTime}`).toISOString(),
        status: "available",
      }));

      const { error } = await supabase.from("interview_slots").insert(inserts);
      if (error) throw error;

      toast.success(`${validSlots.length} slot${validSlots.length > 1 ? "s" : ""} saved — client can now pick a time`);
      setSaved(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Get tomorrow as min date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Schedule Interview — {candidateName}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Add available time slots. The client will pick their preferred time from the portal.
        </p>
      </div>

      {!saved ? (
        <>
          <div className="space-y-3">
            {slots.map((slot, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={slot.date}
                    min={minDate}
                    onChange={(e) => updateSlot(idx, "date", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(idx, "startTime", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(idx, "endTime", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                {slots.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSlot(idx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addSlot}>
              <Plus className="h-3 w-3 mr-1" /> Add Slot
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="ml-auto">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Save & Share with Client
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center py-4 space-y-2">
          <Badge className="bg-success/20 text-green-400">Slots shared</Badge>
          <p className="text-xs text-muted-foreground">
            The client can now see these time slots in their portal and lock in their preferred time.
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      )}
    </div>
  );
}
