import { useMemo, useState } from "react";
import { Inbox, Trash2, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBuckets, useBucketItems, useCreateBucket, useDeleteBucket, type Bucket } from "@/hooks/use-buckets";
import { useCandidates, useContacts, useClients } from "@/hooks/use-data";
import { Link } from "react-router-dom";

export function BucketsPanel() {
  const { data: buckets = [], isLoading } = useBuckets();
  const { data: items = [] } = useBucketItems();
  const { data: candidates = [] } = useCandidates();
  const { data: contacts = [] } = useContacts();
  const { data: clients = [] } = useClients();
  const createBucket = useCreateBucket();
  const deleteBucket = useDeleteBucket();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bucket | null>(null);

  const byBucket = useMemo(() => {
    const map = new Map<string, { candidate: number; contact: number; client: number; rows: any[] }>();
    for (const it of items) {
      let m = map.get(it.bucket_id);
      if (!m) { m = { candidate: 0, contact: 0, client: 0, rows: [] }; map.set(it.bucket_id, m); }
      m[it.entity_type] += 1;
      m.rows.push(it);
    }
    return map;
  }, [items]);

  const candById = useMemo(() => new Map(candidates.map((c: any) => [c.id, c])), [candidates]);
  const contactById = useMemo(() => new Map(contacts.map((c: any) => [c.id, c])), [contacts]);
  const clientById = useMemo(() => new Map(clients.map((c: any) => [c.id, c])), [clients]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createBucket.mutateAsync({ name: newName, description: newDesc });
      setNewName(""); setNewDesc(""); setAddOpen(false);
      toast.success("Bucket created");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create");
    }
  };

  const entityLink = (t: string, id: string) => {
    const e =
      t === "candidate" ? candById.get(id)
      : t === "contact" ? contactById.get(id)
      : clientById.get(id);
    if (!e) return { label: "(deleted)", to: null as string | null };
    if (t === "candidate") return { label: e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim(), to: `/candidates?id=${id}` };
    if (t === "contact") return { label: e.name, to: `/contacts?id=${id}` };
    return { label: e.company_name, to: `/clients?id=${id}` };
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Lightweight, mixed-entity capture. Sort into pools or pipelines later.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New bucket
        </Button>
      </div>

      {buckets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No buckets yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to start capturing loose leads.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {buckets.map((b) => {
            const stats = byBucket.get(b.id) || { candidate: 0, contact: 0, client: 0, rows: [] };
            const total = stats.candidate + stats.contact + stats.client;
            const isOpen = expanded === b.id;
            return (
              <div key={b.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : b.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{b.name}</p>
                    {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    {stats.candidate > 0 && <Badge variant="secondary" className="text-[10px]">{stats.candidate} candidate{stats.candidate === 1 ? "" : "s"}</Badge>}
                    {stats.contact > 0 && <Badge variant="secondary" className="text-[10px]">{stats.contact} contact{stats.contact === 1 ? "" : "s"}</Badge>}
                    {stats.client > 0 && <Badge variant="secondary" className="text-[10px]">{stats.client} compan{stats.client === 1 ? "y" : "ies"}</Badge>}
                    {total === 0 && <span className="text-muted-foreground">Empty</span>}
                  </div>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(b); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete bucket"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
                {isOpen && (
                  <div className="bg-muted/10 px-6 py-2">
                    {stats.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Nothing here yet.</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {stats.rows.map((r) => {
                          const l = entityLink(r.entity_type, r.entity_id);
                          return (
                            <li key={r.id} className="flex items-center gap-2 py-1.5 text-xs">
                              <Badge variant="outline" className="text-[9px] uppercase">{r.entity_type}</Badge>
                              {l.to ? (
                                <Link to={l.to} className="hover:underline">{l.label}</Link>
                              ) : (
                                <span className="text-muted-foreground">{l.label}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New bucket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description (optional)</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName.trim() || createBucket.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bucket and its memberships. The candidates, contacts, and companies themselves are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteBucket.mutateAsync(deleteTarget.id);
                  toast.success("Bucket deleted");
                }
                setDeleteTarget(null);
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
