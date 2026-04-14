import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotes, useCreateNote } from "@/hooks/use-data";
import { useSignalCounts } from "@/hooks/use-signals";
import { NoteCard } from "@/components/NoteCard";
import { Send, Phone, Mail, Users, MessageSquare, Globe, FileText, Smartphone, MessageCircle } from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "Note", label: "Note", icon: FileText },
  { value: "Call", label: "Call", icon: Phone },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Text Message", label: "Text", icon: Smartphone },
  { value: "WhatsApp", label: "WhatsApp", icon: MessageCircle },
  { value: "Meeting", label: "Meeting", icon: Users },
  { value: "LinkedIn Message", label: "LinkedIn", icon: Globe },
  { value: "Follow-up", label: "Follow-up", icon: MessageSquare },
] as const;

export function NotesSection({ entityType, entityId }: { entityType: "candidate" | "client" | "job"; entityId: string }) {
  const { data: notes = [] } = useNotes(entityType, entityId);
  const createNote = useCreateNote();
  const { data: signalCounts = {} } = useSignalCounts();
  const [content, setContent] = useState("");
  const [activityType, setActivityType] = useState("Note");

  const handleSubmit = async () => {
    if (!content.trim()) return;
    const payload: any = { content: content.trim(), activity_type: activityType };
    if (entityType === "candidate") payload.candidate_id = entityId;
    if (entityType === "client") payload.client_id = entityId;
    if (entityType === "job") payload.job_id = entityId;
    await createNote.mutateAsync(payload);
    setContent("");
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">History & Notes</h3>
      <div className="space-y-2 mb-3">
        <div className="flex gap-2 items-start">
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Log an interaction or add a note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[60px] resize-none flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
          />
          <Button size="icon" variant="ghost" onClick={handleSubmit} disabled={!content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} unactionedCount={signalCounts[n.id] || 0} />
        ))}
        {notes.length === 0 && <p className="text-sm text-muted-foreground">No history yet</p>}
      </div>
    </div>
  );
}
