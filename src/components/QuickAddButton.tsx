import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, NotebookPen, Pencil, X, Search, ArrowLeft, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCreateQuickNote } from "@/hooks/use-quick-notes";
import {
  useClients, useCreateClient,
  useCreateCandidate,
  useCreateContact,
  useCreateJob,
  useCreateNote,
  useCandidates,
  useContacts,
} from "@/hooks/use-data";
import { CandidateQuickAddDrawer } from "@/components/CandidateQuickAddDrawer";

type Mode =
  | null
  | "menu"
  | "quick_note"
  | "record_picker"
  | "candidate"
  | "client"
  | "contact"
  | "job"
  | "bd_lead"
  | "note_on_record";

const BD_STAGES = ["Target", "Contacted", "Conversation Started", "Meeting Booked", "Terms Sent"] as const;
const SOURCES = ["LinkedIn", "Referral", "Inbound", "Event", "Other"] as const;
const SECTORS = ["Tech", "Finance", "Healthcare", "Retail", "Other"] as const;

export function QuickAddButton() {
  const [mode, setMode] = useState<Mode>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [candidateDrawerOpen, setCandidateDrawerOpen] = useState(false);
  const sheetOpen = mode !== null && mode !== "quick_note" && mode !== "candidate";

  const handleModeChange = (m: Mode) => {
    if (m === "candidate") {
      setMode(null);
      setCandidateDrawerOpen(true);
      return;
    }
    setMode(m);
  };

  return (
    <>
      {/* Quick Note icon */}
      <button
        onClick={() => setNoteOpen(true)}
        aria-label="Quick Note"
        title="Quick Note"
        className="fixed z-50 right-[172px] bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:bottom-4 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 flex items-center justify-center hover:opacity-90 transition"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {/* Quick Add icon */}
      <button
        onClick={() => setMode("record_picker")}
        aria-label="Quick Add"
        title="Quick Add"
        className="fixed z-50 right-[120px] bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:bottom-4 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 flex items-center justify-center hover:opacity-90 transition"
      >
        <Plus className="h-4 w-4" />
      </button>

      {noteOpen && <FloatingNotepad onClose={() => setNoteOpen(false)} />}

      <Sheet open={sheetOpen} onOpenChange={(v) => !v && setMode(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <QuickAddBody mode={mode} setMode={handleModeChange} onClose={() => setMode(null)} />
        </SheetContent>
      </Sheet>

      <CandidateQuickAddDrawer open={candidateDrawerOpen} onOpenChange={setCandidateDrawerOpen} />
    </>
  );
}


// ─── Floating Post-it Notepad ────────────────────────
function FloatingNotepad({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const create = useCreateQuickNote();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastEnterAt = useRef<number>(0);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const save = async () => {
    const v = content.trim();
    if (!v) { onClose(); return; }
    try {
      await create.mutateAsync(v);
      onClose();
    } catch {
      toast.error("Failed to save");
    }
  };

  const tryClose = () => {
    if (content.trim()) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        tryClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <>
      <div
        role="dialog"
        aria-label="Quick Note"
        className="fixed z-50 right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+4rem)] sm:bottom-16 w-[280px] h-[200px] rounded-md bg-card border border-border shadow-xl flex flex-col"
      >
        <button
          onClick={tryClose}
          aria-label="Close"
          className="absolute top-1 right-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <textarea
          ref={taRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Brain dump — review later..."
          className="flex-1 w-full resize-none bg-transparent border-0 outline-none px-3 pt-3 pr-7 pb-2 text-sm text-foreground placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const now = Date.now();
              if (now - lastEnterAt.current < 600 && content.trim()) {
                e.preventDefault();
                setContent((c) => c.replace(/\n$/, ""));
                save();
                return;
              }
              lastEnterAt.current = now;
            }
          }}
        />
        <div className="flex justify-end px-2 pb-2">
          <button
            onClick={save}
            disabled={!content.trim() || create.isPending}
            aria-label="Save note"
            className="p-1.5 rounded text-primary hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this note?</AlertDialogTitle>
            <AlertDialogDescription>Your typed text will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscard(false); onClose(); }}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuickAddBody({ mode, setMode, onClose }: { mode: Mode; setMode: (m: Mode) => void; onClose: () => void }) {
  const showBack = mode && mode !== "menu";
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          {showBack && (
            <button onClick={() => setMode("menu")} className="p-1 -ml-1 rounded hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <SheetTitle className="flex-1">{titleFor(mode)}</SheetTitle>
        </div>
      </SheetHeader>
      <div className="flex-1 px-5 py-4">
        {mode === "menu" && <MenuView setMode={setMode} />}
        {mode === "quick_note" && <QuickNoteView onDone={onClose} />}
        {mode === "record_picker" && <RecordPickerView setMode={setMode} />}
        {mode === "client" && <ClientForm onDone={onClose} />}
        {mode === "contact" && <ContactForm onDone={onClose} />}
        {mode === "job" && <JobForm onDone={onClose} />}
        {mode === "bd_lead" && <BDLeadForm onDone={onClose} />}
        {mode === "note_on_record" && <NoteOnRecordForm onDone={onClose} />}
      </div>
    </div>
  );
}

function titleFor(mode: Mode) {
  switch (mode) {
    case "menu": return "Quick Add";
    case "quick_note": return "Quick Note";
    case "record_picker": return "Add to Desky";
    case "candidate": return "New Candidate";
    case "client": return "New Client";
    case "contact": return "New Contact";
    case "job": return "New Job";
    case "bd_lead": return "New BD Lead";
    case "note_on_record": return "Note on Record";
    default: return "";
  }
}

// ─── Menu ─────────────────────────────────────────────
function MenuView({ setMode }: { setMode: (m: Mode) => void }) {
  return (
    <div className="space-y-3">
      <button
        onClick={() => setMode("quick_note")}
        className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent transition-colors flex items-start gap-3"
      >
        <div className="mt-0.5 h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">Quick Note</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture a thought or reminder before it's forgotten. Review later from the dashboard inbox.
          </p>
        </div>
      </button>

      <button
        onClick={() => setMode("record_picker")}
        className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent transition-colors flex items-start gap-3"
      >
        <div className="mt-0.5 h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Plus className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">Add to Desky</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add a candidate, client, contact, job, BD lead or note — minimal fields, save in seconds.
          </p>
        </div>
      </button>
    </div>
  );
}

// ─── Quick Note ───────────────────────────────────────
function QuickNoteView({ onDone }: { onDone: () => void }) {
  const [content, setContent] = useState("");
  const create = useCreateQuickNote();

  const save = async () => {
    const v = content.trim();
    if (!v) return;
    try {
      await create.mutateAsync(v);
      toast.success("Captured");
      setContent("");
      onDone();
    } catch {
      toast.error("Failed to save");
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Capture it now — review it later..."
        className="min-h-[180px] text-base"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
        }}
      />
      <Button className="w-full" onClick={save} disabled={!content.trim() || create.isPending}>
        {create.isPending ? "Saving..." : "Save"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        ⌘/Ctrl + Enter to save
      </p>
    </div>
  );
}

// ─── Record Picker ────────────────────────────────────
function RecordPickerView({ setMode }: { setMode: (m: Mode) => void }) {
  const items: { key: Exclude<Mode, null | "menu" | "record_picker">; label: string }[] = [
    { key: "candidate", label: "Candidate" },
    { key: "client", label: "Client" },
    { key: "contact", label: "Contact" },
    { key: "job", label: "Job" },
    { key: "bd_lead", label: "BD Lead" },
    { key: "note_on_record", label: "Note on existing record" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(it => (
        <button
          key={it.key}
          onClick={() => setMode(it.key)}
          className="rounded-md border border-border bg-card p-3 text-sm font-medium hover:border-primary/50 hover:bg-accent transition-colors text-left"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── Save buttons row ─────────────────────────────────
function SaveRow({
  onSaveAndDone,
  onSaveAndComplete,
  saving,
  primaryDisabled,
}: {
  onSaveAndDone: () => void;
  onSaveAndComplete: () => void;
  saving: boolean;
  primaryDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <Button onClick={onSaveAndDone} disabled={saving || primaryDisabled}>
        {saving ? "Saving..." : "Save and done"}
      </Button>
      <Button variant="outline" onClick={onSaveAndComplete} disabled={saving || primaryDisabled}>
        Save and open full profile later
      </Button>
    </div>
  );
}

// ─── Candidate ────────────────────────────────────────
function CandidateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCandidate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [contact, setContact] = useState("");
  const [source, setSource] = useState<string>("LinkedIn");
  const [saving, setSaving] = useState(false);

  const save = async (incomplete: boolean) => {
    if (!first.trim()) { toast.error("First name is required"); return; }
    setSaving(true);
    try {
      const isEmail = contact.includes("@");
      const payload: any = {
        name: `${first.trim()} ${last.trim()}`.trim(),
        first_name: first.trim(),
        last_name: last.trim() || null,
        job_title: jobTitle.trim() || null,
        current_employer: employer.trim() || null,
        email: isEmail ? contact.trim() : null,
        phone: !isEmail ? contact.trim() || null : null,
        linkedin_url: null,
        status: "New",
        source,
        salary_current: null,
        salary_expectation: null,
        availability: null,
        priority_flag: false,
        priority_reason: null,
        priority_flagged_at: null,
        priority_followup_date: null,
        incomplete_profile: incomplete,
      };
      await create.mutateAsync(payload);
      toast.success("Candidate added");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label>First name *</Label><Input value={first} onChange={e => setFirst(e.target.value)} autoFocus /></div>
        <div><Label>Last name</Label><Input value={last} onChange={e => setLast(e.target.value)} /></div>
      </div>
      <div><Label>Current job title</Label><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></div>
      <div><Label>Current employer</Label><Input value={employer} onChange={e => setEmployer(e.target.value)} /></div>
      <div><Label>Phone or email</Label><Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Either one" /></div>
      <div>
        <Label>Source</Label>
        <select value={source} onChange={e => setSource(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <SaveRow saving={saving} onSaveAndDone={() => save(false)} onSaveAndComplete={() => save(true)} primaryDisabled={!first.trim()} />
    </div>
  );
}

// ─── Client ───────────────────────────────────────────
function ClientForm({ onDone }: { onDone: () => void }) {
  const create = useCreateClient();
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [sector, setSector] = useState("Tech");
  const [howCame, setHowCame] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (incomplete: boolean) => {
    if (!company.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      await create.mutateAsync({
        company_name: company.trim(),
        contact_name: contact.trim() || null,
        email: null, phone: null, job_title: null, linkedin_url: null,
        sector, status: "Target",
        next_action: howCame.trim() ? `Source: ${howCame.trim()}` : null,
        next_action_due_date: null,
        last_activity_date: new Date().toISOString().split("T")[0],
        location: null, website: null,
        incomplete_profile: incomplete,
      } as any);
      toast.success("Client added");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Company name *</Label><Input value={company} onChange={e => setCompany(e.target.value)} autoFocus /></div>
      <div><Label>Main contact name</Label><Input value={contact} onChange={e => setContact(e.target.value)} /></div>
      <div>
        <Label>Sector</Label>
        <select value={sector} onChange={e => setSector(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div><Label>How did they come up?</Label><Input value={howCame} onChange={e => setHowCame(e.target.value)} placeholder="Referral, event, inbound..." /></div>
      <SaveRow saving={saving} onSaveAndDone={() => save(false)} onSaveAndComplete={() => save(true)} primaryDisabled={!company.trim()} />
    </div>
  );
}

// ─── Contact ──────────────────────────────────────────
function ContactForm({ onDone }: { onDone: () => void }) {
  const { data: clients = [] } = useClients();
  const createClient = useCreateClient();
  const createContact = useCreateContact();
  const [name, setName] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() =>
    companyQuery.trim()
      ? clients.filter(c => c.company_name.toLowerCase().includes(companyQuery.toLowerCase())).slice(0, 6)
      : []
  , [clients, companyQuery]);

  const save = async (incomplete: boolean) => {
    if (!name.trim() || (!clientId && !companyQuery.trim())) {
      toast.error("Name and company are required"); return;
    }
    setSaving(true);
    try {
      let cid = clientId;
      if (!cid) {
        const created = await createClient.mutateAsync({
          company_name: companyQuery.trim(),
          contact_name: name.trim(),
          email: null, phone: null, job_title: null, linkedin_url: null,
          sector: "Tech", status: "Target",
          next_action: null, next_action_due_date: null,
          last_activity_date: new Date().toISOString().split("T")[0],
          location: null, website: null,
          incomplete_profile: true,
        } as any);
        cid = created.id;
      }
      const isEmail = contact.includes("@");
      const parts = name.trim().split(" ");
      await createContact.mutateAsync({
        client_id: cid!,
        name: name.trim(),
        first_name: parts[0],
        last_name: parts.slice(1).join(" ") || null,
        email: isEmail ? contact.trim() : null,
        phone: !isEmail ? contact.trim() || null : null,
        job_title: jobTitle.trim() || null,
        linkedin_url: null,
        incomplete_profile: incomplete,
      } as any);
      toast.success("Contact added");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally { setSaving(false); }
  };

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="space-y-3">
      <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="relative">
        <Label>Company *</Label>
        <Input
          value={selectedClient ? selectedClient.company_name : companyQuery}
          onChange={e => { setCompanyQuery(e.target.value); setClientId(null); }}
          placeholder="Search existing or type new"
        />
        {!clientId && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.id} type="button"
                onClick={() => { setClientId(c.id); setCompanyQuery(c.company_name); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-muted">
                {c.company_name}
              </button>
            ))}
          </div>
        )}
        {!clientId && companyQuery.trim() && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">Will create "{companyQuery.trim()}" as a new client.</p>
        )}
      </div>
      <div><Label>Job title</Label><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></div>
      <div><Label>Phone or email</Label><Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Either one" /></div>
      <SaveRow saving={saving} onSaveAndDone={() => save(false)} onSaveAndComplete={() => save(true)} primaryDisabled={!name.trim() || (!clientId && !companyQuery.trim())} />
    </div>
  );
}

// ─── Job ──────────────────────────────────────────────
function JobForm({ onDone }: { onDone: () => void }) {
  const { data: clients = [] } = useClients();
  const createJob = useCreateJob();
  const [title, setTitle] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() =>
    clientQuery.trim()
      ? clients.filter(c => c.company_name.toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 6)
      : []
  , [clients, clientQuery]);

  const save = async (incomplete: boolean) => {
    if (!title.trim() || !clientId) { toast.error("Title and client are required"); return; }
    setSaving(true);
    try {
      await createJob.mutateAsync({
        title: title.trim(),
        client_id: clientId,
        location: null,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        job_type: "Perm",
        status: "Open",
        fee_type: "Percentage",
        fee_value: null,
        date_opened: new Date().toISOString().split("T")[0],
        incomplete_profile: incomplete,
      } as any);
      toast.success("Job added");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally { setSaving(false); }
  };

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="space-y-3">
      <div><Label>Job title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
      <div className="relative">
        <Label>Client *</Label>
        <Input
          value={selectedClient ? selectedClient.company_name : clientQuery}
          onChange={e => { setClientQuery(e.target.value); setClientId(null); }}
          placeholder="Search existing client"
        />
        {!clientId && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.id} type="button"
                onClick={() => { setClientId(c.id); setClientQuery(c.company_name); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-muted">
                {c.company_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Salary min</Label><Input type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} /></div>
        <div><Label>Salary max</Label><Input type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} /></div>
      </div>
      <SaveRow saving={saving} onSaveAndDone={() => save(false)} onSaveAndComplete={() => save(true)} primaryDisabled={!title.trim() || !clientId} />
    </div>
  );
}

// ─── BD Lead ──────────────────────────────────────────
function BDLeadForm({ onDone }: { onDone: () => void }) {
  const create = useCreateClient();
  const createNote = useCreateNote();
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [lead, setLead] = useState("");
  const [stage, setStage] = useState<typeof BD_STAGES[number]>("Target");
  const [heat, setHeat] = useState<"Hot" | "Warm" | "Cold">("Warm");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!company.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      const created = await create.mutateAsync({
        company_name: company.trim(),
        contact_name: contact.trim() || null,
        email: null, phone: null, job_title: null, linkedin_url: null,
        sector: "Tech",
        status: stage,
        heat: heat.toLowerCase(),
        next_action: lead.trim() || null,
        next_action_due_date: null,
        last_activity_date: new Date().toISOString().split("T")[0],
        location: null, website: null,
        incomplete_profile: true,
      } as any);
      if (lead.trim()) {
        await createNote.mutateAsync({
          client_id: created.id,
          content: lead.trim(),
          activity_type: "Note",
        });
      }
      toast.success("BD lead added");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Company name *</Label><Input value={company} onChange={e => setCompany(e.target.value)} autoFocus /></div>
      <div><Label>Contact name</Label><Input value={contact} onChange={e => setContact(e.target.value)} /></div>
      <div>
        <Label>What is the lead?</Label>
        <Textarea value={lead} onChange={e => setLead(e.target.value)} placeholder="One line" className="min-h-[60px]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Stage</Label>
          <select value={stage} onChange={e => setStage(e.target.value as any)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {BD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label>Heat</Label>
          <select value={heat} onChange={e => setHeat(e.target.value as any)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option>Hot</option><option>Warm</option><option>Cold</option>
          </select>
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={saving || !company.trim()}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

// ─── Note on existing record ──────────────────────────
type SearchHit = {
  type: "candidate" | "client" | "contact";
  id: string;
  label: string;
  sub?: string;
  candidate_id?: string;
  client_id?: string;
};

function NoteOnRecordForm({ onDone }: { onDone: () => void }) {
  const { data: candidates = [] } = useCandidates();
  const { data: clients = [] } = useClients();
  const { data: contacts = [] } = useContacts();
  const createNote = useCreateNote();
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const results = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    candidates.forEach(c => {
      if (c.name?.toLowerCase().includes(q)) hits.push({
        type: "candidate", id: c.id, label: c.name, sub: c.current_employer || c.job_title || undefined, candidate_id: c.id
      });
    });
    clients.forEach(c => {
      if (c.company_name?.toLowerCase().includes(q)) hits.push({
        type: "client", id: c.id, label: c.company_name, sub: c.contact_name || undefined, client_id: c.id
      });
    });
    contacts.forEach(c => {
      if (c.name?.toLowerCase().includes(q)) {
        const cl = clients.find(x => x.id === c.client_id);
        hits.push({ type: "contact", id: c.id, label: c.name, sub: cl?.company_name, client_id: c.client_id });
      }
    });
    return hits.slice(0, 8);
  }, [query, candidates, clients, contacts]);

  const save = async () => {
    if (!hit || !text.trim()) return;
    setSaving(true);
    try {
      await createNote.mutateAsync({
        content: text.trim(),
        activity_type: "Note",
        candidate_id: hit.candidate_id,
        client_id: hit.client_id,
      });
      toast.success("Note saved");
      onDone();
    } catch {
      toast.error("Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {!hit ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search candidates, clients, contacts"
              className="pl-9"
            />
          </div>
          <div className="space-y-1">
            {results.map(r => (
              <button key={`${r.type}-${r.id}`} onClick={() => setHit(r)}
                className="w-full text-left rounded-md border border-border bg-card px-3 py-2 hover:bg-accent transition-colors">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {r.type}{r.sub ? ` · ${r.sub}` : ""}
                </div>
              </button>
            ))}
            {query.trim() && results.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No matches</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{hit.label}</span>
              <span className="text-xs text-muted-foreground ml-1 capitalize">· {hit.type}</span>
            </div>
            <button onClick={() => setHit(null)} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Note..." className="min-h-[140px]" />
          <Button className="w-full" onClick={save} disabled={saving || !text.trim()}>
            {saving ? "Saving..." : "Save note"}
          </Button>
        </>
      )}
    </div>
  );
}
