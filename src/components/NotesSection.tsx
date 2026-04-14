import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotes, useCreateNote } from "@/hooks/use-data";
import { Send, Phone, Mail, Users, MessageSquare, Globe, FileText } from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "Note", label: "Note", icon: FileText },
  { value: "Call", label: "Call", icon: Phone },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Meeting", label: "Meeting", icon: Users },
  { value: "LinkedIn Message", label: "LinkedIn", icon: Globe },
  { value: "Follow-up", label: "Follow-up", icon: MessageSquare },
] as const;

const activityIcon: Record<string, typeof FileText> = {
  Note: FileText,
  Call: Phone,
  Email: Mail,
  Meeting: Users,
  "LinkedIn Message": Globe,
  "Follow-up": MessageSquare,
};

const activityColor: Record<string, string> = {
  Note: "text-muted-foreground",
  Call: "text-green-400",
  Email: "text-blue-400",
  Meeting: "text-yellow-400",
  "LinkedIn Message": "text-sky-400",
  "Follow-up": "text-orange-400",
};

export function NotesSection({ entityType, entityId }: { entityType: "candidate" | "client" | "job"; entityId: string }) {
  const { data: notes = [] } = useNotes(entityType, entityId);
  const createNote = useCreateNote();
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
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {notes.map((n) => {
          const Icon = activityIcon[(n as any).activity_type] || FileText;
          const color = activityColor[(n as any).activity_type] || "text-muted-foreground";
          return (
            <div key={n.id} className="flex gap-2.5 items-start rounded-md bg-muted/30 px-3 py-2">
              <div className={`mt-0.5 ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${color}`}>{(n as any).activity_type || "Note"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm mt-0.5">{n.content}</p>
              </div>
            </div>
          );
        })}
        {notes.length === 0 && <p className="text-sm text-muted-foreground">No history yet</p>}
      </div>
    </div>
  );
}
