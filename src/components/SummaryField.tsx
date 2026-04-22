import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Pencil, Sparkles, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SummaryFieldProps {
  /** Display label, e.g. "Summary" or "Company Brief" */
  label?: string;
  /** Current saved value */
  value: string;
  /** Placeholder shown when empty */
  placeholder?: string;
  /** Persists the new value (debounced auto-save) */
  onSave: (newValue: string) => Promise<void>;
  /** Optional AI generator — receives nothing, returns generated text */
  onGenerate?: () => Promise<string>;
  /** Label for the AI generate link */
  generateLabel?: string;
}

/**
 * Inline-editable multi-line summary field.
 * - Click anywhere (or pencil) to edit
 * - Auto-saves 3s after the user stops typing
 * - Shows "Generate with AI" link when empty (if onGenerate provided)
 */
export function SummaryField({
  label = "Summary",
  value,
  placeholder = "Add an overview…",
  onSave,
  onGenerate,
  generateLabel = "Generate with AI",
}: SummaryFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [generating, setGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef(value || "");

  // Sync external value changes when not editing
  useEffect(() => {
    if (!editing) {
      setDraft(value || "");
      lastSavedRef.current = value || "";
    }
  }, [value, editing]);

  // Auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [draft, editing]);

  const persist = useCallback(async (next: string) => {
    if (next === lastSavedRef.current) return;
    setSaving(true);
    try {
      await onSave(next);
      lastSavedRef.current = next;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  // Debounced autosave on draft changes
  useEffect(() => {
    if (!editing) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      persist(draft);
    }, 3000);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [draft, editing, persist]);

  const startEdit = () => {
    setDraft(value || "");
    setEditing(true);
    // Focus next tick after render
    setTimeout(() => {
      textareaRef.current?.focus();
      const len = textareaRef.current?.value.length || 0;
      textareaRef.current?.setSelectionRange(len, len);
    }, 0);
  };

  const handleBlur = async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await persist(draft);
    setEditing(false);
  };

  const handleGenerate = async () => {
    if (!onGenerate) return;
    setGenerating(true);
    try {
      const generated = await onGenerate();
      if (generated) {
        setDraft(generated);
        await persist(generated);
        toast.success("Summary generated");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate summary");
    } finally {
      setGenerating(false);
    }
  };

  const isEmpty = !value || value.trim().length === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {saving && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          {!saving && savedFlash && (
            <span className="flex items-center gap-1 text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          className="min-h-[100px] resize-none text-sm leading-relaxed border-transparent bg-muted/20 focus-visible:bg-background focus-visible:border-input"
        />
      ) : (
        <div
          className={cn(
            "group/sum cursor-text rounded-md px-2 py-2 -mx-2 hover:bg-muted/30 transition-colors",
            isEmpty && "italic"
          )}
          onClick={startEdit}
        >
          {isEmpty ? (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">{placeholder}</p>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/sum:opacity-100 transition-opacity shrink-0 mt-0.5" />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{value}</p>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/sum:opacity-100 transition-opacity shrink-0 mt-0.5" />
            </div>
          )}
        </div>
      )}

      {isEmpty && !editing && onGenerate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {generating ? "Generating…" : generateLabel}
        </Button>
      )}
    </div>
  );
}
