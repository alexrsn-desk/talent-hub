import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export interface IntakeSection {
  key: string;
  title: string;
  questions: string[];
}

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    key: "why_this_role",
    title: "Why this role",
    questions: [
      "Why are you hiring for this now?",
      "Is this a new headcount or backfill?",
      "What happens if it isn't filled in the next 8 weeks?",
    ],
  },
  {
    key: "the_last_person",
    title: "The last person",
    questions: [
      "What happened with the previous person in this role?",
      "What would you do differently next time?",
      "What did they do well that you want to preserve?",
    ],
  },
  {
    key: "success_profile",
    title: "Success profile",
    questions: [
      "What does great look like at 90 days?",
      "What did your best ever hire in a similar role look like?",
      "What skills or experience are genuinely non-negotiable?",
    ],
  },
  {
    key: "the_team",
    title: "The team",
    questions: [
      "What is the team dynamic like right now?",
      "What type of person thrives here?",
      "What type of person struggles?",
    ],
  },
  {
    key: "the_offer",
    title: "The offer",
    questions: [
      "Is there any flex on the salary beyond what is advertised?",
      "What is the genuine sell of this role beyond the money?",
      "What might make a strong candidate say no?",
    ],
  },
  {
    key: "the_process",
    title: "The process",
    questions: [
      "How many interview stages?",
      "How quickly do you typically make a decision once you find the right person?",
      "Who else is involved in the final decision?",
    ],
  },
];

const OPENING_LINE =
  "Got a good understanding of the role generally — just want to make sure I have the full picture on the type of person. Going to rattle through a few questions if that's ok?";

interface Props {
  jobId: string;
  jobTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntakeCallCompanion({ jobId, jobTitle, open, onOpenChange }: Props) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<{ summary: string | null; capturedAt: string | null }>({ summary: null, capturedAt: null });
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("intake_notes, intake_summary, intake_captured_at")
        .eq("id", jobId)
        .maybeSingle();
      const existingNotes = (data as any)?.intake_notes || {};
      setNotes(typeof existingNotes === "object" ? existingNotes : {});
      setExisting({
        summary: (data as any)?.intake_summary || null,
        capturedAt: (data as any)?.intake_captured_at || null,
      });
    })();
  }, [open, jobId]);

  const labelledNotes = useMemo(() => {
    return INTAKE_SECTIONS
      .map((s) => {
        const v = (notes[s.key] || "").trim();
        return v ? `${s.title}: ${v}` : null;
      })
      .filter(Boolean)
      .join("\n");
  }, [notes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          intake_notes: notes as any,
          intake_captured_at: new Date().toISOString(),
        } as any)
        .eq("id", jobId);
      if (error) throw error;

      toast({ title: "Intake notes saved", description: "Running AI extraction..." });

      // Run AI extraction in background — don't block
      setExtracting(true);
      supabase.functions
        .invoke("extract-intake-summary", { body: { job_id: jobId } })
        .then(({ data }) => {
          if ((data as any)?.summary) {
            setExisting((p) => ({ ...p, summary: (data as any).summary }));
          }
        })
        .catch((e) => console.error("intake extract failed", e))
        .finally(() => setExtracting(false));

      qc.invalidateQueries({ queryKey: ["jobs"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Intake Call Companion
            <span className="text-sm font-normal text-muted-foreground">— {jobTitle}</span>
            {existing.capturedAt && (
              <Badge variant="secondary" className="ml-auto text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Previously captured
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-3 py-1">
          {OPENING_LINE}
        </p>

        {existing.summary && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> Intake summary
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{existing.summary}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTAKE_SECTIONS.map((s) => (
            <div key={s.key} className="space-y-2 rounded-md border border-border p-3">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {s.questions.map((q, i) => (
                  <li key={i}>→ {q}</li>
                ))}
              </ul>
              <Textarea
                placeholder="Quick note..."
                value={notes[s.key] || ""}
                onChange={(e) => setNotes((p) => ({ ...p, [s.key]: e.target.value }))}
                className="min-h-[40px] text-sm resize-none"
                rows={1}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = t.scrollHeight + "px";
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {labelledNotes ? `${Object.values(notes).filter((v) => (v || "").trim()).length} of ${INTAKE_SECTIONS.length} sections noted` : "No notes yet"}
          </p>
          <Button onClick={handleSave} disabled={saving || !labelledNotes}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save to job record
          </Button>
        </div>

        {extracting && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> AI extracting intake intelligence...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function IntakeCallCompanionButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ClipboardList className="h-3.5 w-3.5" /> Intake Call Companion
      </Button>
      <IntakeCallCompanion jobId={jobId} jobTitle={jobTitle} open={open} onOpenChange={setOpen} />
    </>
  );
}
