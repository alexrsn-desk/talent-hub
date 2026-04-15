import { useState } from "react";
import { MoreHorizontal, Eye, PhoneCall, Star, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useUpdateCandidate, useDeleteCandidate, type Candidate } from "@/hooks/use-data";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { toast } from "sonner";
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

interface Props {
  candidate: Candidate;
  onViewProfile?: () => void;
  triggerClassName?: string;
}

export function CandidateContextMenu({ candidate, onViewProfile, triggerClassName }: Props) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();

  const isFlagged = candidate.priority_flag;

  const handleTogglePriority = () => {
    if (isFlagged) {
      updateCandidate.mutate({ id: candidate.id, priority_flag: false, priority_reason: null, priority_flagged_at: null, priority_followup_date: null } as any);
      toast.success("Priority flag removed");
    } else {
      updateCandidate.mutate({ id: candidate.id, priority_flag: true, priority_flagged_at: new Date().toISOString() } as any);
      toast.success("Flagged as priority");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={triggerClassName || "h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onViewProfile && (
            <DropdownMenuItem onClick={onViewProfile}>
              <Eye className="h-3.5 w-3.5 mr-2" /> View Profile
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setTouchpointOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5 mr-2" /> Log Touchpoint
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTogglePriority}>
            <Star className={`h-3.5 w-3.5 mr-2 ${isFlagged ? "fill-yellow-400 text-yellow-400" : ""}`} />
            {isFlagged ? "Remove Priority" : "Flag as Priority"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CandidateQuickEdit candidate={candidate} open={quickEditOpen} onOpenChange={setQuickEditOpen} />
      <LogTouchpointModal open={touchpointOpen} onOpenChange={setTouchpointOpen} entityType="candidate" entityId={candidate.id} entityName={candidate.name} />
      
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {candidate.name}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteCandidate.mutate(candidate.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
