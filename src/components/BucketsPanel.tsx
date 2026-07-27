import { useMemo, useState } from "react";
import { Inbox, Trash2, ChevronDown, ChevronRight, Loader2, Plus, StickyNote, Building2, User, UserCircle2, ArrowRightCircle } from "lucide-react";
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
import {
  useBuckets, useBucketItems, useCreateBucket, useDeleteBucket,
  useAddFreeformBucketItem, useDeleteBucketItem, useAddToBuckets,
  type Bucket, type BucketItem,
} from "@/hooks/use-buckets";
import { useCandidates, useContacts, useClients, useCreateCandidate, useCreateClient, useCreateContact } from "@/hooks/use-data";
import { extractCandidateHints } from "@/lib/quick-note-parse";
import { Link } from "react-router-dom";


export function BucketsPanel() {
  const { data: buckets = [], isLoading } = useBuckets();
  const { data: items = [] } = useBucketItems();
  const { data: candidates = [] } = useCandidates();
  const { data: contacts = [] } = useContacts();
  const { data: clients = [] } = useClients();
  const createBucket = useCreateBucket();
  const deleteBucket = useDeleteBucket();
  const addFreeform = useAddFreeformBucketItem();
  const deleteItem = useDeleteBucketItem();
  const addToBuckets = useAddToBuckets();
  const createCandidate = useCreateCandidate();
  const createClient = useCreateClient();
  const createContact = useCreateContact();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bucket | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [convertTarget, setConvertTarget] = useState<BucketItem | null>(null);

  const byBucket = useMemo(() => {
    const map = new Map<string, { candidate: number; contact: number; client: number; note: number; rows: BucketItem[] }>();
    for (const it of items) {
      let m = map.get(it.bucket_id);
      if (!m) { m = { candidate: 0, contact: 0, client: 0, note: 0, rows: [] }; map.set(it.bucket_id, m); }
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

  const iconFor = (t: string) => {
    if (t === "candidate") return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === "contact") return <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === "client") return <Building2 className="h-3.5 w-3.5 text-muted-foreground" />;
    return <StickyNote className="h-3.5 w-3.5 text-primary/70" />;
  };

  const addFreeformNote = async (bucketId: string) => {
    const text = (draft[bucketId] || "").trim();
    if (!text) return;
    try {
      await addFreeform.mutateAsync({ bucketId, text });
      setDraft((d) => ({ ...d, [bucketId]: "" }));
    } catch (e: any) {
      toast.error(e?.message || "Failed to add");
    }
  };

  const handleConvert = async (kind: "candidate" | "client" | "contact") => {
    if (!convertTarget?.note_text) return;
    const text = convertTarget.note_text;
    try {
      let newId: string | null = null;
      if (kind === "candidate") {
        const hints = extractCandidateHints(text);
        // Use first sensible chunk as name fallback
        const name = text.split(/[,.\n]/)[0].trim().slice(0, 80) || "New candidate";
        const c: any = await createCandidate.mutateAsync({
          name,
          job_title: hints.job_title || null,
          current_employer: hints.current_employer || null,
          note: text,
        } as any);
        newId = c?.id ?? null;
      } else if (kind === "client") {
        const name = text.split(/[,.\n]/)[0].trim().slice(0, 80) || "New company";
        const c: any = await createClient.mutateAsync({ company_name: name, notes: text } as any);
        newId = c?.id ?? null;
      } else {
        const name = text.split(/[,.\n]/)[0].trim().slice(0, 80) || "New contact";
        const c: any = await createContact.mutateAsync({ name, note: text } as any);
        newId = c?.id ?? null;
      }
      if (newId) {
        await addToBuckets.mutateAsync({
          entityType: kind,
          entityId: newId,
          bucketIds: [convertTarget.bucket_id],
        });
        await deleteItem.mutateAsync(convertTarget.id);
        toast.success(`Converted to ${kind}`);
      }
      setConvertTarget(null);
    } catch (e: any) {
      toast.error(e?.message || "Convert failed");
    }
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
            const stats = byBucket.get(b.id) || { candidate: 0, contact: 0, client: 0, note: 0, rows: [] as BucketItem[] };
            const total = stats.candidate + stats.contact + stats.client + stats.note;
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
                    {stats.note > 0 && <Badge variant="secondary" className="text-[10px]">{stats.note} note{stats.note === 1 ? "" : "s"}</Badge>}
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
                  <div className="bg-muted/10 px-6 py-3 space-y-3">
                    {stats.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing here yet.</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {stats.rows.map((r) => {
                          if (r.entity_type === "note") {
                            return (
                              <li key={r.id} className="flex items-start gap-2 py-2 text-xs group">
                                <StickyNote className="h-3.5 w-3.5 text-primary/70 mt-0.5 shrink-0" />
                                <p className="flex-1 whitespace-pre-wrap text-foreground/90 leading-relaxed">
                                  {r.note_text}
                                </p>
                                <button
                                  onClick={() => setConvertTarget(r)}
                                  className="opacity-0 group-hover:opacity-100 transition text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted"
                                  title="Convert to record"
                                >
                                  <ArrowRightCircle className="h-3 w-3" /> Convert
                                </button>
                                <button
                                  onClick={() => deleteItem.mutate(r.id)}
                                  className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive p-0.5"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </li>
                            );
                          }
                          const l = entityLink(r.entity_type, r.entity_id!);
                          return (
                            <li key={r.id} className="flex items-center gap-2 py-1.5 text-xs group">
                              {iconFor(r.entity_type)}
                              {l.to ? (
                                <Link to={l.to} className="hover:underline flex-1 truncate">{l.label}</Link>
                              ) : (
                                <span className="text-muted-foreground flex-1 truncate">{l.label}</span>
                              )}
                              <button
                                onClick={() => deleteItem.mutate(r.id)}
                                className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive p-0.5"
                                title="Remove from bucket"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex items-start gap-2 pt-1">
                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-2 shrink-0" />
                      <Textarea
                        value={draft[b.id] || ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [b.id]: e.target.value }))}
                        placeholder="Jot a freeform note — e.g. 'Tom Hutton, AI startup, hiring in 3 months'"
                        rows={1}
                        className="flex-1 text-xs min-h-[36px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            addFreeformNote(b.id);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!draft[b.id]?.trim() || addFreeform.isPending}
                        onClick={() => addFreeformNote(b.id)}
                      >
                        Add
                      </Button>
                    </div>
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
