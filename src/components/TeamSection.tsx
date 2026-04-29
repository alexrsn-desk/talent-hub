import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Check, Plus, X, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useTeamInvites,
  useTeamMembers,
  useCreateInvite,
  useRevokeInvite,
  useDeactivateMember,
  useIsManager,
} from "@/hooks/use-team";

export function TeamSection() {
  const isManager = useIsManager();
  const { data: members = [], isLoading: loadingMembers } = useTeamMembers();
  const { data: invites = [], isLoading: loadingInvites } = useTeamInvites();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const deactivateMember = useDeactivateMember();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeInvites = invites.filter((i) => !i.used_at && new Date(i.expires_at).getTime() > Date.now());
  const activeMembers = members.filter((m) => m.active);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success("Code copied");
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const handleCreate = async () => {
    try {
      await createInvite.mutateAsync({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      setName("");
      setEmail("");
      toast.success("Invite code created");
    } catch (e: any) {
      toast.error(e.message || "Failed to create invite");
    }
  };

  return (
    <div className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Team</h2>
        {isManager && (
          <span className="text-xs text-muted-foreground">
            · {activeMembers.length} member{activeMembers.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Invite consultants to share your manager view. Each invite is a single-use code that expires in 14 days.
      </p>

      {/* Create invite */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button onClick={handleCreate} disabled={createInvite.isPending} size="sm">
          {createInvite.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Plus className="h-3.5 w-3.5 mr-1" />
          )}
          Generate invite code
        </Button>
      </div>

      {/* Active invites */}
      {!loadingInvites && activeInvites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-muted-foreground tracking-wide">Pending invites</h3>
          <div className="space-y-1.5">
            {activeInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <code className="font-mono text-primary">{inv.code}</code>
                  {inv.name && <span className="text-muted-foreground">{inv.name}</span>}
                  {inv.email && <span className="text-xs text-muted-foreground">{inv.email}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => copy(inv.code)} className="h-7 px-2">
                    {copiedCode === inv.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeInvite.mutate(inv.id)}
                    className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active members */}
      {!loadingMembers && activeMembers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-muted-foreground tracking-wide">Team members</h3>
          <div className="space-y-1.5">
            {activeMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{m.name}</div>
                  {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deactivateMember.mutate(m.id)}
                  className="h-7 px-2 text-muted-foreground hover:text-destructive text-xs"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingMembers && !loadingInvites && activeMembers.length === 0 && activeInvites.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No team members yet. Generate a code above to invite one.</p>
      )}
    </div>
  );
}
