import { useState, useEffect } from "react";
import { format, isToday, isThisWeek, isPast, parseISO } from "date-fns";
import { CalendarIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ReengageColour = "future" | "thisWeek" | "overdue" | "none";

export function getReengageColour(date: string | null | undefined): ReengageColour {
  if (!date) return "none";
  const d = parseISO(date);
  if (isPast(d) && !isToday(d)) return "overdue";
  if (isToday(d) || isThisWeek(d, { weekStartsOn: 1 })) return "thisWeek";
  return "future";
}

const colourClass: Record<ReengageColour, string> = {
  future: "bg-green-500/15 text-green-500 border border-green-500/30",
  thisWeek: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
  overdue: "bg-red-500/15 text-red-500 border border-red-500/30",
  none: "",
};

export function formatReengageDate(date: string): string {
  const d = parseISO(date);
  const now = new Date();
  // If more than 30 days away, show "MMM yyyy", else "d MMM"
  const daysOut = Math.abs((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOut > 60) return format(d, "MMM yyyy");
  return format(d, "d MMM");
}

/** Compact badge to show next to a status badge */
export function ReengageBadge({ date }: { date: string | null | undefined }) {
  if (!date) return null;
  const colour = getReengageColour(date);
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal", colourClass[colour])}>
      {formatReengageDate(date)}
    </Badge>
  );
}

interface InlineEditorProps {
  date: string | null | undefined;
  reason: string | null | undefined;
  onSave: (date: string | null, reason: string | null) => Promise<void> | void;
  className?: string;
  /** If true, the editor opens immediately on mount (used right after status change) */
  autoOpen?: boolean;
}

/**
 * Inline editor that expands in place — date picker + reason text.
 * Used after a candidate is set to Hold or contact set to Cold.
 */
export function ReengageInlineEditor({ date, reason, onSave, className, autoOpen }: InlineEditorProps) {
  const [open, setOpen] = useState(!!autoOpen);
  const [localDate, setLocalDate] = useState<Date | undefined>(date ? parseISO(date) : undefined);
  const [localReason, setLocalReason] = useState(reason || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalDate(date ? parseISO(date) : undefined);
    setLocalReason(reason || "");
  }, [date, reason]);

  const handleSave = async () => {
    setSaving(true);
    const dateStr = localDate ? format(localDate, "yyyy-MM-dd") : null;
    await onSave(dateStr, localReason.trim() || null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleClear = async () => {
    setLocalDate(undefined);
    setLocalReason("");
    await onSave(null, null);
  };

  return (
    <div className={cn("rounded-md border border-border bg-muted/20 p-3 space-y-2", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Re-engage date:</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <CalendarIcon className="h-3 w-3" />
              {localDate ? format(localDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={localDate}
              onSelect={(d) => { setLocalDate(d); setOpen(false); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        {localDate && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={handleClear}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div>
        <Input
          value={localReason}
          onChange={(e) => setLocalReason(e.target.value)}
          placeholder="Reason (optional) — e.g. 'Said get back in touch in March'"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saving}>
          <Check className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
        </Button>
        {saved && <span className="text-xs text-green-500">Saved ✓</span>}
      </div>
    </div>
  );
}
