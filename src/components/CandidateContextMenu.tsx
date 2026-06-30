import { useState } from "react";
import { MoreHorizontal, Eye, Trash2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { useDeleteCandidate, type Candidate } from "@/hooks/use-data";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCandidate = useDeleteCandidate();
  const navigate = useNavigate();


  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={triggerClassName || "h-[44px] w-[44px] min-w-[44px] min-h-[44px] text-[#9CA3AF] hover:text-foreground transition-colors"} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onViewProfile && (
            <DropdownMenuItem onClick={onViewProfile}>
              <Eye className="h-3.5 w-3.5 mr-2" /> View Profile
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate(`/candidates/${candidate.id}/pitch`)}>
            <Sparkles className="h-3.5 w-3.5 mr-2" /> Find opportunities
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>

      </DropdownMenu>
      
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
