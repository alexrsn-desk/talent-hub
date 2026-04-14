import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useNotes, useCreateNote } from "@/hooks/use-data";
import { Send } from "lucide-react";

export function NotesSection({ entityType, entityId }: { entityType: "candidate" | "client" | "job"; entityId: string }) {
  const { data: notes = [] } = useNotes(entityType, entityId);
  const createNote = useCreateNote();
  const [content, setContent] = useState("");

  const handleSubmit = async () => {
    if (!content.trim()) return;
    const payload: any = { content: content.trim() };
    if (entityType === "candidate") payload.candidate_id = entityId;
    if (entityType === "client") payload.client_id = entityId;
    if (entityType === "job") payload.job_id = entityId;
    await createNote.mutateAsync(payload);
    setContent("");
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Notes</h3>
      <div className="flex gap-2 mb-3">
        <Textarea
          placeholder="Add a note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[60px] resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
        />
        <Button size="icon" variant="ghost" onClick={handleSubmit} disabled={!content.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {notes.map(n => (
          <div key={n.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm">
            <p>{n.content}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet</p>}
      </div>
    </div>
  );
}
