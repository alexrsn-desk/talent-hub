import { useState } from "react";
import { Plus, Trash2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  usePools, usePoolMemberships, useCreatePool, useUpdatePool, useDeletePool,
  computePoolHealth, HEALTH_DOT, type TalentPool,
} from "@/hooks/use-talent-pools";
import { useCandidates } from "@/hooks/use-data";

const CHECKIN_OPTIONS = [
  { value: 14, label: "Every 2 weeks" },
  { value: 30, label: "Monthly" },
  { value: 42, label: "Every 6 weeks" },
  { value: 90, label: "Quarterly" },
];

export function TalentPoolsSettings() {
  const { data: pools = [], isLoading } = usePools();
  const { data: memberships = [] } = usePoolMemberships();
  const { data: candidates = [] } = useCandidates();
  const createPool = useCreatePool();
  const updatePool = useUpdatePool();
  const deletePool = useDeletePool();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editing, setEditing] = useState<TalentPool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TalentPool | null>(null);

  const candById = new Map(candidates.map((c: any) => [c.id, c]));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await createPool.mutateAsync({ name: newName, description: newDesc });
    setNewName(""); setNewDesc(""); setAddOpen(false);
    toast.success("Pool created");
  };

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Talent Pools</h2>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />Add new pool</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New talent pool</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Senior DevOps Engineers" autoFocus />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="e.g. London based, £90-120k, Series B experience" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!newName.trim() || createPool.isPending}>
                {createPool.isPending ? "Creating..." : "Create pool"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground">Group candidates by specialism. Each pool is a warm bench you maintain proactively.</p>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : pools.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No pools yet. Add one to start grouping your bench.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {pools.map((pool) => {
            const memberIds = memberships.filter((m) => m.pool_id === pool.id).map((m) => m.candidate_id);
            const members = memberIds.map((cid) => candById.get(cid)).filter(Boolean) as any[];
            const health = computePoolHealth(pool, members.map((m) => ({ status: m.status, last_contacted: m.last_contacted_at || null })));
            return (
              <div key={pool.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{pool.name}</span>
                    <span className="text-xs text-muted-foreground">({members.length})</span>
                    <span className="text-xs">{HEALTH_DOT[health]}</span>
                  </div>
                  {pool.description && <div className="text-xs text-muted-foreground truncate">{pool.description}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(pool)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(pool)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit pool</DialogTitle></DialogHeader>
          {editing && (
            <EditPoolForm
              pool={editing}
              onSave={async (updates) => {
                await updatePool.mutateAsync({ id: editing.id, ...updates });
                setEditing(null);
                toast.success("Pool updated");
              }}
              saving={updatePool.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pool?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed. Candidates in this pool are not deleted — just unlinked from this pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deletePool.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                  toast.success("Pool deleted");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditPoolForm({
  pool, onSave, saving,
}: {
  pool: TalentPool;
  onSave: (updates: Partial<TalentPool>) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(pool.name);
  const [description, setDescription] = useState(pool.description || "");
  const [targetSize, setTargetSize] = useState(pool.target_size);
  const [checkin, setCheckin] = useState(pool.checkin_frequency_days);
  const [warn, setWarn] = useState(pool.warning_threshold_days);

  return (
    <div className="space-y-3">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Target size</Label>
          <Input type="number" min={1} value={targetSize} onChange={(e) => setTargetSize(parseInt(e.target.value || "5"))} />
        </div>
        <div>
          <Label>Warning threshold (days)</Label>
          <Input type="number" min={7} value={warn} onChange={(e) => setWarn(parseInt(e.target.value || "28"))} />
        </div>
      </div>
      <div>
        <Label>Check-in reminder frequency</Label>
        <Select value={String(checkin)} onValueChange={(v) => setCheckin(parseInt(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHECKIN_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSave({
              name: name.trim(),
              description: description.trim() || null,
              target_size: targetSize,
              checkin_frequency_days: checkin,
              warning_threshold_days: warn,
            })
          }
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}
