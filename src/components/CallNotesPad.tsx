import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PROMPTS = [
  "Team", "Project", "Budget", "Timeline",
  "Decision process", "Must haves", "Why this role",
  "Missing from last apps",
];

interface Props {
  entityType: "candidate" | "client";
  entityId: string;
}

export function CallNotesPad({ entityType, entityId }: Props) {
  const [value, setValue] = useState("");
  const [showPrompts, setShowPrompts] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Auto-bullet on Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const insert = before.length === 0 || before.endsWith("\n") ? "• " : "\n• ";
      const next = before + insert + after;
      setValue(next);
      requestAnimationFrame(() => {
        if (ref.current) {
          const pos = (before + insert).length;
          ref.current.selectionStart = ref.current.selectionEnd = pos;
        }
      });
    }
  };

  const addPromptHeading = (topic: string) => {
    const prefix = value.length === 0 || value.endsWith("\n") ? "" : "\n";
    setValue(value + `${prefix}• ${topic}: `);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        owner_user_id: user?.id,
        content: value.trim(),
        activity_type: "Call Notes",
      };
      if (entityType === "candidate") payload.candidate_id = entityId;
      else payload.client_id = entityId;

      const { data: noteRow, error } = await supabase.from("notes").insert(payload).select("id").maybeSingle();
      if (error) throw error;

      // Fire-and-forget AI extraction + reply-signal detection + screening framework fill
      if (noteRow?.id && entityType === "candidate") {
        supabase.functions.invoke("extract-insights", { body: { note_id: noteRow.id } }).catch(() => {});
        supabase.functions.invoke("detect-signals", { body: { note_id: noteRow.id } }).catch(() => {});
        supabase.functions.invoke("extract-screening-framework", { body: { note_id: noteRow.id } }).catch(() => {});
      }

      toast({ title: "Notes saved" });
      setValue("");
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div>
        <h3 className="text-sm font-medium">Call Notes</h3>
        <p className="text-xs italic text-muted-foreground">Jot anything here during the call</p>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Start typing..."
        className="flex-1 min-h-[260px] text-sm font-mono resize-none"
      />
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setShowPrompts((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Need a prompt? ↓
        </button>
        {showPrompts && (
          <div className="flex flex-wrap gap-1.5">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => addPromptHeading(p)}
                className="text-xs text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted/40 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving || !value.trim()} className="w-full">
        {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
        Save notes to record
      </Button>
    </div>
  );
}
