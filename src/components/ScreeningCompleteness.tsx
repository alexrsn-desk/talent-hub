import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import {
  FRAMEWORK_SECTIONS,
  sectionsCompleteCount,
  completenessColor,
} from "@/lib/screening-framework";
import { useScreeningFramework } from "@/hooks/use-screening-framework";
import { ScreeningFrameworkChecklist } from "@/components/ScreeningFrameworkChecklist";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  candidateId: string;
}

export function ScreeningCompleteness({ candidateId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useScreeningFramework(candidateId);
  const c = sectionsCompleteCount(items.map((i) => ({ item_key: i.item_key, value: i.value })));
  const color = completenessColor(c.complete);

  return (
    <>
      <div className={cn("rounded-lg border px-3 py-2 flex items-center justify-between gap-3", color)}>
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Screening completeness: {c.complete} of {c.total} sections</p>
            {c.missingSections.length > 0 ? (
              <p className="text-[11px] opacity-80 truncate">
                Missing: {c.missingSections.map((id) => FRAMEWORK_SECTIONS.find(s => s.id === id)?.title).join(" · ")}
              </p>
            ) : (
              <p className="text-[11px] opacity-80">All nine sections covered</p>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setOpen(true)}>
          Open <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Screening Framework</DialogTitle>
          </DialogHeader>
          <ScreeningFrameworkChecklist candidateId={candidateId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Lightweight pill version for headers / compact rows
export function ScreeningCompletenessBadge({ candidateId }: Props) {
  const { data: items = [] } = useScreeningFramework(candidateId);
  const c = sectionsCompleteCount(items.map((i) => ({ item_key: i.item_key, value: i.value })));
  const color = completenessColor(c.complete);
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", color)}>
      <ClipboardCheck className="h-3 w-3" />
      {c.complete}/{c.total}
    </Badge>
  );
}
