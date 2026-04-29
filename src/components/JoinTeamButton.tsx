import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useJoinTeam } from "@/hooks/use-team";

/** Small button that lets a user join an existing team using an invite code. */
export function JoinTeamButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const join = useJoinTeam();

  const handleJoin = async () => {
    try {
      await join.mutateAsync(code);
      toast.success("Joined team");
      setOpen(false);
      setCode("");
    } catch (e: any) {
      toast.error(e.message || "Couldn't join team");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-3.5 w-3.5 mr-1" />
          Join team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a team</DialogTitle>
          <DialogDescription>
            Enter the invite code your manager shared with you.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="ABCD2345"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          className="font-mono text-center tracking-widest"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleJoin} disabled={join.isPending || !code.trim()}>
            {join.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
