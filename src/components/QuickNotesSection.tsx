import { useState } from "react";
import { Inbox, Check, Trash2, ListPlus, Link as LinkIcon, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useQuickNotes, useUpdateQuickNote, useDeleteQuickNote, type QuickNote } from "@/hooks/use-quick-notes";
import { useCandidates, useClients, useContacts, useCreateNote } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function QuickNotesSection() {
  const { data: notes = [] } = useQuickNotes("inbox");
  const [collapsed, setCollapsed] = useState(false);

  if (notes.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <Inbox className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">
          Quick Notes <span className="text-muted-foreground">({notes.length})</span>
        </h2>
        <span className="text-xs text-muted-foreground ml-auto">review and action</span>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {notes.map(n => <QuickNoteRow key={n.id} note={n} />)}
        </div>
      )}
    </div>
  );
}

function QuickNoteRow({ note }: { note: QuickNote }) {
  const update = useUpdateQuickNote();
  const del = useDeleteQuickNote();
  const createNote = useCreateNote();
  const { data: candidates = [] } = useCandidates();
  const [linking, setLinking] = useState(false);

  const parsed = (() => {
    // Local import to avoid cycle
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseNoteIntent, matchCandidatesByName } = require("@/lib/quick-note-parse");
    const p = parseNoteIntent(note.content);
    if (!p) return null;
    const { strong, near } = matchCandidatesByName(p.targetName, candidates as any);
    const suggestions = (strong.length ? strong : near).slice(0, 4);
    return { parsed: p, suggestions, ambiguous: strong.length !== 1 };
  })();

  const markDone = async () => {
    await update.mutateAsync({ id: note.id, status: "done", reviewed_at: new Date().toISOString() });
    toast.success("Archived");
  };

  const remove = async () => {
    await del.mutateAsync(note.id);
    toast.success("Deleted");
  };

  const convertToTask = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("todo_tasks").insert({
      user_id: user.id, owner_user_id: user.id,
      title: note.content.slice(0, 200), priority: "normal",
    });
    if (error) { toast.error("Failed"); return; }
    await update.mutateAsync({ id: note.id, status: "done", reviewed_at: new Date().toISOString() });
    toast.success("Added to My List");
  };

  const attachTo = async (candidate: { id: string; name: string | null }) => {
    const body = parsed?.parsed.noteContent || note.content;
    await createNote.mutateAsync({
      content: body,
      candidate_id: candidate.id,
      activity_type: "Note",
    } as any);
    await update.mutateAsync({ id: note.id, status: "done", reviewed_at: new Date().toISOString() });
    toast.success(`Added to ${candidate.name}`);
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
      <p className="text-[10px] text-muted-foreground mt-1">
        {new Date(note.created_at).toLocaleString()}
      </p>
      {parsed && parsed.suggestions.length > 0 && (
        <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2">
          <p className="text-[11px] text-muted-foreground mb-1">
            Looks like a note for <span className="font-medium text-foreground">{parsed.parsed.targetName}</span>
            {parsed.ambiguous ? " — pick the right person:" : ":"}
          </p>
          <div className="flex flex-wrap gap-1">
            {parsed.suggestions.map((c: any) => (
              <button
                key={c.id}
                onClick={() => attachTo(c)}
                className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted"
              >
                {c.name}
                {c.job_title && <span className="text-muted-foreground ml-1">· {c.job_title}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={convertToTask}>
          <ListPlus className="h-3 w-3 mr-1" /> Convert to task
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinking(true)}>
          <LinkIcon className="h-3 w-3 mr-1" /> Link to record
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={markDone}>
          <Check className="h-3 w-3 mr-1" /> Done
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={remove}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </div>
      {linking && <LinkToRecordPicker note={note} onClose={() => setLinking(false)} onLinked={markDone} />}
    </div>
  );
}

function LinkToRecordPicker({ note, onClose, onLinked }: { note: QuickNote; onClose: () => void; onLinked: () => void }) {
  const { data: candidates = [] } = useCandidates();
  const { data: clients = [] } = useClients();
  const { data: contacts = [] } = useContacts();
  const createNote = useCreateNote();
  const [q, setQ] = useState("");

  const results = (() => {
    const s = q.trim().toLowerCase();
    if (!s) return [] as { type: string; id: string; label: string; candidate_id?: string; client_id?: string }[];
    const out: any[] = [];
    candidates.filter(c => c.name?.toLowerCase().includes(s)).slice(0, 4).forEach(c =>
      out.push({ type: "candidate", id: c.id, label: c.name, candidate_id: c.id }));
    clients.filter(c => c.company_name?.toLowerCase().includes(s)).slice(0, 4).forEach(c =>
      out.push({ type: "client", id: c.id, label: c.company_name, client_id: c.id }));
    contacts.filter(c => c.name?.toLowerCase().includes(s)).slice(0, 4).forEach(c =>
      out.push({ type: "contact", id: c.id, label: c.name, client_id: c.client_id }));
    return out;
  })();

  const link = async (r: any) => {
    await createNote.mutateAsync({
      content: note.content,
      activity_type: "Note",
      candidate_id: r.candidate_id,
      client_id: r.client_id,
    });
    toast.success(`Linked to ${r.label}`);
    onLinked();
    onClose();
  };

  return (
    <div className="mt-2 p-2 rounded-md border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." className="h-8 text-xs" />
        <button onClick={onClose}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {results.map(r => (
          <button key={`${r.type}-${r.id}`} onClick={() => link(r)}
            className="block w-full text-left text-xs rounded px-2 py-1.5 hover:bg-background">
            <span className="font-medium">{r.label}</span>
            <span className="text-muted-foreground ml-2 capitalize">{r.type}</span>
          </button>
        ))}
        {q && !results.length && <p className="text-xs text-muted-foreground px-2">No matches</p>}
      </div>
    </div>
  );
}
