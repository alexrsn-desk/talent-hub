import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, Loader2, Sparkles, X, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCandidate, useCreateNote } from "@/hooks/use-data";
import { StagedPoolSelector } from "@/components/StagedPoolSelector";
import { BucketSelector } from "@/components/BucketSelector";
import { useAddCandidatesToPool } from "@/hooks/use-talent-pools";
import { useAddToBuckets } from "@/hooks/use-buckets";

const ACCEPT = ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

type Fields = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  current_job_title: string;
  current_employer: string;
  location: string;
  current_salary: string;
  notice_period: string;
  linkedin_url: string;
  summary: string;
};

const EMPTY: Fields = {
  first_name: "", last_name: "", email: "", phone: "",
  current_job_title: "", current_employer: "", location: "",
  current_salary: "", notice_period: "", linkedin_url: "", summary: "",
};

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  } catch {}
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (candidateId: string) => void;
  defaultLinkToJobId?: string;
};

export function CandidateQuickAddDrawer({ open, onOpenChange, onCreated }: Props) {
  const [tab, setTab] = useState<"cv" | "manual">("cv");
  const create = useCreateCandidate();
  const createNote = useCreateNote();
  const addToPools = useAddCandidatesToPool();
  const addToBuckets = useAddToBuckets();

  // CV state
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [cvFields, setCvFields] = useState<Fields>(EMPTY);
  const [reviewMode, setReviewMode] = useState(false);

  // Manual state
  const [manual, setManual] = useState<Fields>(EMPTY);

  // Grouping (shared across tabs) — staged until save
  const [poolIds, setPoolIds] = useState<string[]>([]);
  const [bucketIds, setBucketIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTab("cv");
    setFilename(null);
    setRawText("");
    setCvFields(EMPTY);
    setReviewMode(false);
    setManual(EMPTY);
    setPoolIds([]);
    setBucketIds([]);
  };

  const handleFile = async (file: File) => {
    setExtracting(true);
    try {
      const name = file.name.toLowerCase();
      let text = "";
      if (name.endsWith(".pdf")) text = await extractPdf(file);
      else if (name.endsWith(".docx") || name.endsWith(".doc")) text = await extractDocx(file);
      else if (name.endsWith(".txt")) text = await file.text();
      else throw new Error("Unsupported file type");
      if (!text || text.trim().length < 30) throw new Error("No readable text");
      setRawText(text);
      setFilename(file.name);
      await analyse(text);
    } catch (e: any) {
      toast.error(e?.message || "Could not read CV");
    } finally {
      setExtracting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const analyse = async (text: string) => {
    setAnalysing(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-cv-fields", { body: { text } });
      if (error) throw error;
      const fields = (data?.fields || EMPTY) as Fields;
      setCvFields(fields);
      setReviewMode(true);
      toast.success("CV extracted — review and save");
    } catch (e: any) {
      toast.error("AI extraction failed — try adding manually");
      setCvFields(EMPTY);
      setReviewMode(true);
    } finally {
      setAnalysing(false);
    }
  };

  const saveFrom = async (f: Fields) => {
    const first = f.first_name.trim();
    const last = f.last_name.trim();
    if (!first && !last) {
      toast.error("At least a first or last name is required");
      return;
    }
    setSaving(true);
    try {
      const salaryNum = f.current_salary ? parseInt(f.current_salary.replace(/[^0-9]/g, "")) : null;
      const created: any = await create.mutateAsync({
        name: `${first} ${last}`.trim(),
        first_name: first,
        last_name: last || null,
        job_title: f.current_job_title || null,
        current_employer: f.current_employer || null,
        location: f.location || null,
        email: f.email || null,
        phone: f.phone || null,
        linkedin_url: f.linkedin_url || null,
        status: "New",
        source: tab === "cv" ? "CV Upload" : "Manual",
        salary_current: Number.isFinite(salaryNum as number) ? (salaryNum as number) : null,
        salary_expectation: null,
        availability: null,
        notice_period: f.notice_period || null,
        summary: f.summary || null,
        priority_flag: false,
        priority_reason: null,
        priority_flagged_at: null,
        priority_followup_date: null,
      } as any);
      if (tab === "cv" && rawText && created?.id) {
        await createNote.mutateAsync({
          candidate_id: created.id,
          content: `CV attached (${filename || "uploaded"})\n\n${rawText.slice(0, 4000)}`,
          activity_type: "Note",
        });
      }
      if (created?.id) {
        if (poolIds.length) {
          try { await addToPools.mutateAsync({ poolId: poolIds[0], candidateIds: [created.id] }); } catch {}
          // add remaining pools (one call per pool keeps existing hook signature)
          for (const pid of poolIds.slice(1)) {
            try { await addToPools.mutateAsync({ poolId: pid, candidateIds: [created.id] }); } catch {}
          }
        }
        if (bucketIds.length) {
          try { await addToBuckets.mutateAsync({ entityType: "candidate", entityId: created.id, bucketIds }); } catch {}
        }
      }
      toast.success("Candidate added");
      reset();
      onOpenChange(false);
      onCreated?.(created?.id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle>Add candidate</SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="px-5 pt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cv">📄 Upload CV</TabsTrigger>
            <TabsTrigger value="manual">✏️ Add Manually</TabsTrigger>
          </TabsList>

          <TabsContent value="cv" className="pt-4 space-y-3">
            {!reviewMode && (
              <>
                {!filename ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={extracting || analysing}
                    className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/50 transition-colors p-8 flex flex-col items-center gap-2 text-center"
                  >
                    {extracting || analysing ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <FileUp className="h-6 w-6 text-primary" />
                    )}
                    <p className="text-sm font-medium">
                      {extracting ? "Reading file…" : analysing ? "AI extracting fields…" : "Drop or select CV"}
                    </p>
                    <p className="text-xs text-muted-foreground">PDF, Word, or plain text</p>
                  </button>
                ) : (
                  <div className="rounded-md border border-border p-3 flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm truncate flex-1">{filename}</span>
                    {(analysing) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <p className="text-xs text-muted-foreground text-center">
                  AI will extract name, contact, current role, salary, notice, and a summary.
                </p>
              </>
            )}

            {reviewMode && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md bg-primary/10 text-primary p-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Review AI-extracted fields, then save.
                </div>
                <FieldGrid f={cvFields} setF={setCvFields} />
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setReviewMode(false); setFilename(null); setRawText(""); setCvFields(EMPTY); }}>
                    Clear
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => saveFrom(cvFields)}
                    disabled={saving || (!cvFields.first_name.trim() && !cvFields.last_name.trim())}
                  >
                    {saving ? "Saving…" : "Save candidate"}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="pt-4 space-y-3">
            <FieldGrid f={manual} setF={setManual} />
            <Button
              className="w-full"
              onClick={() => saveFrom(manual)}
              disabled={saving || (!manual.first_name.trim() && !manual.last_name.trim())}
            >
              {saving ? "Saving…" : "Save candidate"}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="px-5 pt-2 pb-6 space-y-3 border-t border-border mt-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium pt-3">
            Grouping (optional)
          </p>
          <StagedPoolSelector value={poolIds} onChange={setPoolIds} />
          <BucketSelector value={bucketIds} onChange={setBucketIds} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldGrid({ f, setF }: { f: Fields; setF: (v: Fields) => void }) {
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">First name *</Label><Input value={f.first_name} onChange={set("first_name")} className="h-9" /></div>
        <div><Label className="text-xs">Last name</Label><Input value={f.last_name} onChange={set("last_name")} className="h-9" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Email</Label><Input type="email" value={f.email} onChange={set("email")} className="h-9" /></div>
        <div><Label className="text-xs">Phone</Label><Input value={f.phone} onChange={set("phone")} className="h-9" /></div>
      </div>
      <div><Label className="text-xs">LinkedIn URL</Label><Input value={f.linkedin_url} onChange={set("linkedin_url")} placeholder="https://linkedin.com/in/…" className="h-9" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Current job title</Label><Input value={f.current_job_title} onChange={set("current_job_title")} className="h-9" /></div>
        <div><Label className="text-xs">Current employer</Label><Input value={f.current_employer} onChange={set("current_employer")} className="h-9" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Location</Label><Input value={f.location} onChange={set("location")} className="h-9" /></div>
        <div><Label className="text-xs">Current salary</Label><Input value={f.current_salary} onChange={set("current_salary")} placeholder="£85,000" className="h-9" /></div>
      </div>
      <div><Label className="text-xs">Notice period</Label><Input value={f.notice_period} onChange={set("notice_period")} placeholder="1 month" className="h-9" /></div>
      <div><Label className="text-xs">Summary</Label><Textarea value={f.summary} onChange={set("summary")} rows={3} className="text-sm" /></div>
    </>
  );
}
