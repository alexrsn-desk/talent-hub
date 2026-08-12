import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  candidateId: string;
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<void>;
}

/**
 * Client-facing summary field. A short, client-facing summary, separate from internal notes.
 * Never auto-filled — AI suggestions land in the textarea for the recruiter to review.
 */
export function ClientReadyNotes({ candidateId, value, onSave }: Props) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const lastSavedRef = useRef(value || "");

  useEffect(() => {
    setDraft(value || "");
    lastSavedRef.current = value || "";
  }, [value, candidateId]);

  const handleBlur = async () => {
    const next = draft.trim();
    if (next === lastSavedRef.current.trim()) return;
    setSaving(true);
    try {
      await onSave(next || null);
      lastSavedRef.current = next;
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e: any) {
      toast.error(e?.message || "Could not save Client Ready Notes");
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-client-ready-notes", {
        body: { candidate_id: candidateId },
      });
      if (error) throw error;
      const suggestion = (data as any)?.suggestion as string | undefined;
      if (!suggestion) throw new Error("No suggestion returned");
      setDraft(suggestion);
      toast.success("Draft suggested — review and edit before sharing");
    } catch (e: any) {
      toast.error(e?.message || "Could not generate a suggestion");
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Client Ready Notes</h3>
          <p className="text-xs text-muted-foreground max-w-prose">
            A short summary written for sharing with clients — kept separate from internal notes.
            Everything else stays internal.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Suggest summary
        </Button>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        rows={4}
        placeholder="Write a short, client-facing summary — e.g. key strengths, relevant experience, why they're a strong fit"
        className="resize-y text-sm"
      />

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Keep it concise — 2-4 sentences works best</p>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          {saving && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
          {!saving && savedFlash && <><Check className="h-3 w-3 text-green-500" /> Saved</>}
        </span>
      </div>
    </section>
  );
}
