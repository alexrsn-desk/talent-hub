import { useState } from "react";
import { Star, Phone, Mail, PhoneCall, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useUpdateCandidate, type Candidate } from "@/hooks/use-data";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PriorityFlagButton({
  candidate,
  size = "default",
}: {
  candidate: Candidate;
  size?: "default" | "sm" | "xs";
}) {
  const updateCandidate = useUpdateCandidate();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(
    () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isFlagged = !!(candidate as any).priority_flag;

  const handleFlag = () => {
    if (isFlagged) {
      setConfirmRemove(true);
      return;
    }
    setShowForm(true);
  };

  const handleSave = () => {
    updateCandidate.mutate({
      id: candidate.id,
      priority_flag: true,
      priority_reason: reason || null,
      priority_flagged_at: new Date().toISOString(),
      priority_followup_date: followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
    } as any);
    setShowForm(false);
    setReason("");
    toast.success("Flagged as priority");
  };

  const handleRemove = () => {
    updateCandidate.mutate({
      id: candidate.id,
      priority_flag: false,
      priority_reason: null,
      priority_flagged_at: null,
      priority_followup_date: null,
    } as any);
    setConfirmRemove(false);
    toast.success("Priority flag removed");
  };

  const iconSize = size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "xs" ? "h-5 w-5" : size === "sm" ? "h-6 w-6" : "h-8 w-8";

  return (
    <>
      <Popover open={showForm} onOpenChange={setShowForm}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => { e.stopPropagation(); handleFlag(); }}
            className={cn(
              "inline-flex items-center justify-center rounded transition-colors",
              btnSize,
              isFlagged
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-muted-foreground hover:text-yellow-400"
            )}
            title={isFlagged ? "Remove priority flag" : "Flag as priority"}
          >
            <Star className={cn(iconSize, isFlagged && "fill-yellow-400")} />
          </button>
        </PopoverTrigger>
        {!isFlagged && (
          <PopoverContent className="w-64 p-3 space-y-3" align="start" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground">Flag as Priority</p>
            <Input
              placeholder="Why priority? (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-xs"
            />
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Follow up by</p>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start">
                    {followUpDate ? format(followUpDate, "dd MMM yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={(d) => { setFollowUpDate(d); setCalendarOpen(false); }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button size="sm" className="w-full h-8 text-xs" onClick={handleSave}>
              Save
            </Button>
          </PopoverContent>
        )}
      </Popover>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove priority flag?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {candidate.name} from your priority list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Gold star icon for display purposes (no interaction)
export function PriorityStarIcon({ className }: { className?: string }) {
  return <Star className={cn("h-3 w-3 text-yellow-400 fill-yellow-400", className)} />;
}

// Dashboard priority candidates section
export function PriorityCandidatesSection({ candidates }: { candidates: Candidate[] }) {
  const updateCandidate = useUpdateCandidate();
  const priorityCandidates = candidates.filter((c: any) => c.priority_flag);

  if (priorityCandidates.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getFollowUpStatus = (c: any) => {
    if (!c.priority_followup_date) return "none";
    const d = new Date(c.priority_followup_date);
    d.setHours(0, 0, 0, 0);
    if (d < today) return "overdue";
    if (d.getTime() === today.getTime()) return "today";
    return "upcoming";
  };

  const getDaysSinceFlagged = (c: any) => {
    if (!c.priority_flagged_at) return 0;
    return Math.floor((Date.now() - new Date(c.priority_flagged_at).getTime()) / (1000 * 60 * 60 * 24));
  };

  const sorted = [...priorityCandidates].sort((a: any, b: any) => {
    const statusOrder = { overdue: 0, today: 1, upcoming: 2, none: 3 };
    const aStatus = getFollowUpStatus(a);
    const bStatus = getFollowUpStatus(b);
    return (statusOrder[aStatus] || 3) - (statusOrder[bStatus] || 3);
  });

  const followUpColor: Record<string, string> = {
    overdue: "text-destructive",
    today: "text-amber-400",
    upcoming: "text-green-400",
    none: "text-amber-400",
  };

  return (
    <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
        <h2 className="text-sm font-medium text-yellow-400">Priority Candidates ({sorted.length})</h2>
      </div>
      <div className="space-y-2">
        {sorted.map((c: any) => {
          const status = getFollowUpStatus(c);
          const days = getDaysSinceFlagged(c);
          return (
            <div key={c.id} className="flex items-start gap-3 rounded-md bg-card px-3 py-2 border border-border">
              <Star className="h-3.5 w-3.5 mt-0.5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{c.name}</span>
                  {c.job_title && <span className="text-muted-foreground">· {c.job_title}</span>}
                  {c.current_employer && <span className="text-muted-foreground">at {c.current_employer}</span>}
                </div>
                {c.priority_reason && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">"{c.priority_reason}"</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-[11px]">
                  <span className="text-muted-foreground">Flagged {days}d ago</span>
                  {c.priority_followup_date ? (
                    <span className={followUpColor[status]}>
                      {status === "overdue" && "Overdue: "}
                      {status === "today" && "Today: "}
                      {status === "upcoming" && "Follow up: "}
                      {new Date(c.priority_followup_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  ) : (
                    <span className="text-amber-400">No follow up set · <button className="underline hover:text-amber-300" onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      updateCandidate.mutate({ id: c.id, priority_followup_date: format(tomorrow, "yyyy-MM-dd") } as any);
                      toast.success("Follow-up set for tomorrow");
                    }}>Set one now</button></span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {c.phone && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={`tel:${c.phone}`}><Phone className="h-3 w-3" /></a>
                  </Button>
                )}
                {c.email && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={`mailto:${c.email}`}><Mail className="h-3 w-3" /></a>
                  </Button>
                )}
                <PriorityFlagButton candidate={c} size="xs" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
