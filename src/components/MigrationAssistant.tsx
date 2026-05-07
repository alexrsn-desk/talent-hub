import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Check, ArrowRight, ArrowLeft, SkipForward, Loader2,
  Briefcase, Users, FileText, Link2, Sparkles, ChevronRight,
  Keyboard, CornerDownLeft,
} from "lucide-react";
import { detectDuplicateCandidates, DuplicateCandidate } from "@/lib/csv-import";

// ── Types ──────────────────────────────────────────────────────────
interface UnmatchedJob {
  id: string;
  title: string;
  salary_min: number | null;
  salary_max: number | null;
  date_opened: string;
}

interface CandidateWithNotes {
  id: string;
  name: string;
  job_title: string | null;
  current_employer: string | null;
  notes: { id: string; content: string }[];
}

interface UnlinkedCandidate {
  id: string;
  name: string;
  job_title: string | null;
  current_employer: string | null;
  status: string;
}

type QueueType = "jobs" | "notes" | "assignments" | "duplicates";

interface Props {
  /** Pre-loaded unmatched jobs (from import flow) */
  initialUnmatchedJobs?: UnmatchedJob[];
  onComplete: () => void;
  /** Show "come back later" button */
  showLaterOption?: boolean;
}

// ── Persistence helpers ────────────────────────────────────────────
const SKIPPED_KEY = "migration_assistant_skipped";
function getSkipped(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(SKIPPED_KEY) || "{}"); } catch { return {}; }
}
function addSkipped(queue: string, id: string) {
  const s = getSkipped();
  if (!s[queue]) s[queue] = [];
  if (!s[queue].includes(id)) s[queue].push(id);
  localStorage.setItem(SKIPPED_KEY, JSON.stringify(s));
}
function clearSkipped() {
  localStorage.removeItem(SKIPPED_KEY);
}

export function MigrationAssistant({ initialUnmatchedJobs, onComplete, showLaterOption = true }: Props) {
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState<QueueType>("jobs");
  const [currentIndex, setCurrentIndex] = useState(0);

  // Data
  const [unmatchedJobs, setUnmatchedJobs] = useState<UnmatchedJob[]>([]);
  const [candidatesWithNotes, setCandidatesWithNotes] = useState<CandidateWithNotes[]>([]);
  const [unlinkedCandidates, setUnlinkedCandidates] = useState<UnlinkedCandidate[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [allClients, setAllClients] = useState<{ id: string; company_name: string }[]>([]);
  const [allJobs, setAllJobs] = useState<{ id: string; title: string }[]>([]);

  // Per-item state
  const [selectedClient, setSelectedClient] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [tidying, setTidying] = useState(false);
  const [selectedJob, setSelectedJob] = useState("");
  const [merging, setMerging] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Bulk note actions
  const [tidiedMap, setTidiedMap] = useState<Record<string, string>>({});
  const [bulkTidying, setBulkTidying] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, label: "" });

  // Skipped items
  const [skippedItems, setSkippedItems] = useState<Record<string, string[]>>(getSkipped);
  const [showSkipped, setShowSkipped] = useState(false);

  // ── Load data ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const skipped = getSkipped();

      // 1. Unmatched jobs
      let jobs: UnmatchedJob[] = [];
      if (initialUnmatchedJobs?.length) {
        jobs = initialUnmatchedJobs;
      } else {
        const { data } = await supabase
          .from("jobs")
          .select("id, title, salary_min, salary_max, date_opened")
          .is("client_id", null);
        jobs = (data || []) as UnmatchedJob[];
      }
      const filteredJobs = jobs.filter(j => !(skipped.jobs || []).includes(j.id));
      setUnmatchedJobs(filteredJobs);

      // 2. Candidates with notes
      const { data: notesData } = await supabase
        .from("notes")
        .select("id, content, candidate_id, candidates(id, name, job_title, current_employer)")
        .not("candidate_id", "is", null)
        .order("created_at", { ascending: false });
      const candidateMap = new Map<string, CandidateWithNotes>();
      (notesData || []).forEach((n: any) => {
        if (!n.candidates || (skipped.notes || []).includes(n.candidates.id)) return;
        const cid = n.candidates.id;
        if (!candidateMap.has(cid)) {
          candidateMap.set(cid, {
            id: cid,
            name: n.candidates.name,
            job_title: n.candidates.job_title,
            current_employer: n.candidates.current_employer,
            notes: [],
          });
        }
        candidateMap.get(cid)!.notes.push({ id: n.id, content: n.content });
      });
      setCandidatesWithNotes(Array.from(candidateMap.values()));

      // 3. Unlinked candidates (not in any candidate_jobs)
      const { data: allCands } = await supabase.from("candidates").select("id, name, job_title, current_employer, status");
      const { data: linkedCands } = await supabase.from("candidate_jobs").select("candidate_id");
      const linkedIds = new Set((linkedCands || []).map((c: any) => c.candidate_id));
      const unlinked = (allCands || []).filter((c: any) =>
        !linkedIds.has(c.id) && !(skipped.assignments || []).includes(c.id)
      ) as UnlinkedCandidate[];
      setUnlinkedCandidates(unlinked);

      // 4. Duplicates
      const dupes = await detectDuplicateCandidates();
      const filteredDupes = dupes.filter(d =>
        !(skipped.duplicates || []).includes(`${d.id1}-${d.id2}`)
      );
      setDuplicates(filteredDupes);

      // Reference data
      const { data: clients } = await supabase.from("clients").select("id, company_name").order("company_name");
      setAllClients(clients || []);
      const { data: jobsList } = await supabase.from("jobs").select("id, title").eq("status", "Open").order("title");
      setAllJobs(jobsList || []);

      // Determine starting queue
      if (filteredJobs.length > 0) setActiveQueue("jobs");
      else if (candidateMap.size > 0) setActiveQueue("notes");
      else if (unlinked.length > 0) setActiveQueue("assignments");
      else if (filteredDupes.length > 0) setActiveQueue("duplicates");

      setLoading(false);
    })();
  }, []);

  // ── Queue info ───────────────────────────────────────────────────
  const queues: { key: QueueType; label: string; icon: any; items: any[] }[] = [
    { key: "jobs", label: "Unmatched Jobs", icon: Briefcase, items: unmatchedJobs },
    { key: "notes", label: "Candidate Notes", icon: FileText, items: candidatesWithNotes },
    { key: "assignments", label: "Job Assignments", icon: Link2, items: unlinkedCandidates },
    { key: "duplicates", label: "Duplicates", icon: Users, items: duplicates },
  ];

  const currentQueue = queues.find(q => q.key === activeQueue)!;
  const totalItems = queues.reduce((sum, q) => sum + q.items.length, 0);
  const completedItems = queues.reduce((sum, q) => {
    const originalCount = q.items.length + (skippedItems[q.key]?.length || 0);
    return sum + (skippedItems[q.key]?.length || 0);
  }, 0);
  const totalOriginal = totalItems + Object.values(skippedItems).reduce((s, arr) => s + arr.length, 0);
  const progressPct = totalOriginal > 0 ? Math.round(((totalOriginal - totalItems) / totalOriginal) * 100) : 100;

  const currentItem = currentQueue.items[currentIndex];
  const isComplete = totalItems === 0;

  // ── Reset per-item state ─────────────────────────────────────────
  const resetItemState = useCallback(() => {
    setSelectedClient("");
    setNewClientName("");
    setCreatingClient(false);
    setEditedNotes("");
    setSelectedJob("");
  }, []);

  const advanceToNext = useCallback(() => {
    resetItemState();
    if (currentIndex + 1 < currentQueue.items.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Move to next queue with items
      const nextQueue = queues.find(q => q.key !== activeQueue && q.items.length > 0);
      if (nextQueue) {
        setActiveQueue(nextQueue.key);
        setCurrentIndex(0);
      }
    }
  }, [currentIndex, currentQueue, activeQueue, queues, resetItemState]);

  const skipItem = useCallback(() => {
    if (!currentItem) return;
    const id = activeQueue === "duplicates"
      ? `${(currentItem as DuplicateCandidate).id1}-${(currentItem as DuplicateCandidate).id2}`
      : (currentItem as any).id;
    addSkipped(activeQueue, id);
    setSkippedItems(getSkipped());

    // Remove from current list
    if (activeQueue === "jobs") setUnmatchedJobs(prev => prev.filter((_, i) => i !== currentIndex));
    else if (activeQueue === "notes") setCandidatesWithNotes(prev => prev.filter((_, i) => i !== currentIndex));
    else if (activeQueue === "assignments") setUnlinkedCandidates(prev => prev.filter((_, i) => i !== currentIndex));
    else if (activeQueue === "duplicates") setDuplicates(prev => prev.filter((_, i) => i !== currentIndex));

    if (currentIndex >= currentQueue.items.length - 1) {
      const nextQueue = queues.find(q => q.key !== activeQueue && q.items.length > 1);
      if (nextQueue) { setActiveQueue(nextQueue.key); setCurrentIndex(0); }
      else setCurrentIndex(Math.max(0, currentIndex - 1));
    }
    resetItemState();
  }, [currentItem, activeQueue, currentIndex, currentQueue, queues, resetItemState]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (isComplete) return;

      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("migration-confirm-btn")?.click();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skipItem();
      } else if (e.key === "ArrowRight" && currentIndex + 1 < currentQueue.items.length) {
        setCurrentIndex(prev => prev + 1);
        resetItemState();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
        resetItemState();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isComplete, currentIndex, currentQueue, skipItem, resetItemState]);

  // ── Set edited notes when entering notes queue ───────────────────
  useEffect(() => {
    if (activeQueue === "notes" && currentItem) {
      const c = currentItem as CandidateWithNotes;
      const original = c.notes.map(n => n.content).join("\n\n---\n\n");
      setEditedNotes(tidiedMap[c.id] ?? original);
    }
  }, [activeQueue, currentIndex, currentItem, tidiedMap]);

  // ── Actions ──────────────────────────────────────────────────────
  const confirmJob = async () => {
    if (!currentItem) return;
    const job = currentItem as UnmatchedJob;
    setProcessing(true);

    let clientId = selectedClient;
    if (creatingClient && newClientName.trim()) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("clients").insert({ company_name: newClientName.trim(), owner_user_id: user?.id } as any).select("id").single();
      if (error) { toast.error(error.message); setProcessing(false); return; }
      clientId = data.id;
      setAllClients(prev => [...prev, { id: data.id, company_name: newClientName.trim() }]);
    }

    if (clientId) {
      const { error } = await supabase.from("jobs").update({ client_id: clientId }).eq("id", job.id);
      if (error) { toast.error(error.message); setProcessing(false); return; }
      toast.success("Job linked to client");
    }

    setUnmatchedJobs(prev => prev.filter(j => j.id !== job.id));
    setProcessing(false);
    if (unmatchedJobs.length <= 1) {
      const next = queues.find(q => q.key !== "jobs" && q.items.length > 0);
      if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    } else {
      setCurrentIndex(prev => Math.min(prev, unmatchedJobs.length - 2));
    }
    resetItemState();
  };

  const confirmNotes = async () => {
    if (!currentItem) return;
    const c = currentItem as CandidateWithNotes;
    setProcessing(true);

    // Delete old notes and insert cleaned version
    for (const n of c.notes) {
      await supabase.from("notes").delete().eq("id", n.id);
    }
    if (editedNotes.trim()) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("notes").insert({
        candidate_id: c.id,
        content: editedNotes.trim(),
        activity_type: "Note",
        owner_user_id: user?.id,
      } as any);
    }

    toast.success("Notes updated");
    setCandidatesWithNotes(prev => prev.filter(cn => cn.id !== c.id));
    setProcessing(false);
    if (candidatesWithNotes.length <= 1) {
      const next = queues.find(q => q.key !== "notes" && q.items.length > 0);
      if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    } else {
      setCurrentIndex(prev => Math.min(prev, candidatesWithNotes.length - 2));
    }
    resetItemState();
  };

  const clearNotes = async () => {
    if (!currentItem) return;
    const c = currentItem as CandidateWithNotes;
    setProcessing(true);
    for (const n of c.notes) {
      await supabase.from("notes").delete().eq("id", n.id);
    }
    toast.success("Notes cleared");
    setCandidatesWithNotes(prev => prev.filter(cn => cn.id !== c.id));
    setProcessing(false);
    resetItemState();
  };

  const tidyNotes = async () => {
    if (!currentItem) return;
    const c = currentItem as CandidateWithNotes;
    setTidying(true);
    try {
      const { data, error } = await supabase.functions.invoke("tidy-notes", {
        body: { notes: editedNotes, candidateName: c.name },
      });
      if (error) throw error;
      if (data?.tidied) setEditedNotes(data.tidied);
      toast.success("Notes tidied by AI");
    } catch (e: any) {
      toast.error(e.message || "Failed to tidy notes");
    }
    setTidying(false);
  };

  // ── Bulk note actions ────────────────────────────────────────────
  const tidyAllNotes = async (): Promise<Record<string, string>> => {
    const list = candidatesWithNotes;
    if (list.length === 0) return {};
    setBulkTidying(true);
    setBulkProgress({ done: 0, total: list.length, label: "Tidying notes" });
    const results: Record<string, string> = { ...tidiedMap };
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const original = c.notes.map(n => n.content).join("\n\n---\n\n");
      if (results[c.id]) {
        setBulkProgress({ done: i + 1, total: list.length, label: "Tidying notes" });
        continue;
      }
      try {
        const { data, error } = await supabase.functions.invoke("tidy-notes", {
          body: { notes: original, candidateName: c.name },
        });
        if (!error && data?.tidied) {
          results[c.id] = data.tidied;
        } else {
          results[c.id] = original;
        }
      } catch {
        results[c.id] = original;
      }
      setTidiedMap({ ...results });
      setBulkProgress({ done: i + 1, total: list.length, label: "Tidying notes" });
    }
    setBulkTidying(false);
    return results;
  };

  const confirmAllNotes = async (overrides?: Record<string, string>) => {
    const list = candidatesWithNotes;
    if (list.length === 0) return;
    setBulkConfirming(true);
    setBulkProgress({ done: 0, total: list.length, label: "Importing notes" });
    const { data: { user } } = await supabase.auth.getUser();
    const map = overrides ?? tidiedMap;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const original = c.notes.map(n => n.content).join("\n\n---\n\n");
      const finalContent = (map[c.id] ?? original).trim();
      try {
        for (const n of c.notes) {
          await supabase.from("notes").delete().eq("id", n.id);
        }
        if (finalContent) {
          await supabase.from("notes").insert({
            candidate_id: c.id,
            content: finalContent,
            activity_type: "Note",
            owner_user_id: user?.id,
          } as any);
        }
      } catch (e: any) {
        console.error("confirmAllNotes error", e);
      }
      setBulkProgress({ done: i + 1, total: list.length, label: "Importing notes" });
    }
    setCandidatesWithNotes([]);
    setTidiedMap({});
    setBulkConfirming(false);
    toast.success(`Imported ${list.length} note${list.length > 1 ? "s" : ""}`);
    const next = queues.find(q => q.key !== "notes" && q.items.length > 0);
    if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    resetItemState();
  };

  const tidyAndConfirmAll = async () => {
    const results = await tidyAllNotes();
    await confirmAllNotes(results);
  };
    if (!currentItem) return;
    const c = currentItem as UnlinkedCandidate;
    setProcessing(true);

    if (selectedJob) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("candidate_jobs").insert({
        candidate_id: c.id,
        job_id: selectedJob,
        owner_user_id: user?.id,
      } as any);
      if (error) { toast.error(error.message); setProcessing(false); return; }
      toast.success("Candidate linked to job");
    }

    setUnlinkedCandidates(prev => prev.filter(uc => uc.id !== c.id));
    setProcessing(false);
    if (unlinkedCandidates.length <= 1) {
      const next = queues.find(q => q.key !== "assignments" && q.items.length > 0);
      if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    } else {
      setCurrentIndex(prev => Math.min(prev, unlinkedCandidates.length - 2));
    }
    resetItemState();
  };

  const mergeDuplicate = async (keepId: string, removeId: string) => {
    setMerging(true);
    await supabase.from("candidate_jobs").update({ candidate_id: keepId } as any).eq("candidate_id", removeId);
    await supabase.from("notes").update({ candidate_id: keepId } as any).eq("candidate_id", removeId);
    const { error } = await supabase.from("candidates").delete().eq("id", removeId);
    if (error) { toast.error(error.message); setMerging(false); return; }
    toast.success("Records merged");
    setDuplicates(prev => prev.filter(d => d.id1 !== removeId && d.id2 !== removeId));
    setMerging(false);
    if (duplicates.length <= 1) {
      const next = queues.find(q => q.key !== "duplicates" && q.items.length > 0);
      if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    } else {
      setCurrentIndex(prev => Math.min(prev, duplicates.length - 2));
    }
  };

  const keepSeparate = () => {
    if (!currentItem) return;
    const d = currentItem as DuplicateCandidate;
    setDuplicates(prev => prev.filter(dup => !(dup.id1 === d.id1 && dup.id2 === d.id2)));
    if (duplicates.length <= 1) {
      const next = queues.find(q => q.key !== "duplicates" && q.items.length > 0);
      if (next) { setActiveQueue(next.key); setCurrentIndex(0); }
    } else {
      setCurrentIndex(prev => Math.min(prev, duplicates.length - 2));
    }
  };

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Scanning your data…</p>
        </div>
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────────────
  if (isComplete) {
    const totalSkipped = Object.values(skippedItems).reduce((s, arr) => s + arr.length, 0);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg text-center space-y-6">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">You're all set!</h1>
          <p className="text-sm text-muted-foreground">Your CRM data has been reviewed and tidied.</p>

          <div className="grid grid-cols-3 gap-3">
            <CountCard label="Candidates" icon={Users} table="candidates" />
            <CountCard label="Clients" icon={Briefcase} table="clients" />
            <CountCard label="Jobs" icon={FileText} table="jobs" />
          </div>

          {totalSkipped > 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {totalSkipped} item{totalSkipped > 1 ? "s" : ""} skipped.{" "}
                <button
                  onClick={() => { clearSkipped(); window.location.reload(); }}
                  className="text-primary underline underline-offset-2"
                >
                  Review skipped items
                </button>
              </CardContent>
            </Card>
          )}

          <Button size="lg" onClick={onComplete}>
            <Sparkles className="h-4 w-4 mr-2" /> Go to your dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Migration Assistant</h1>
            <span className="text-sm text-muted-foreground">{totalItems} record{totalItems > 1 ? "s" : ""} left to review</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        {/* Queue tabs */}
        <div className="flex gap-2 flex-wrap">
          {queues.filter(q => q.items.length > 0).map(q => (
            <Button
              key={q.key}
              variant={activeQueue === q.key ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => { setActiveQueue(q.key); setCurrentIndex(0); resetItemState(); }}
            >
              <q.icon className="h-3.5 w-3.5 mr-1" />
              {q.label}
              <Badge variant="secondary" className="ml-1.5 text-xs h-5 px-1.5">{q.items.length}</Badge>
            </Button>
          ))}
        </div>

        {/* Current item card */}
        {currentItem && (
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-5">

              {/* Queue 1: Unmatched Jobs */}
              {activeQueue === "jobs" && (() => {
                const job = currentItem as UnmatchedJob;
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Unmatched Job</p>
                      <h2 className="text-lg font-semibold">{job.title}</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Salary: </span>
                        {job.salary_min || job.salary_max
                          ? `£${(job.salary_min || 0).toLocaleString()} – £${(job.salary_max || 0).toLocaleString()}`
                          : "Not specified"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Opened: </span>
                        {new Date(job.date_opened).toLocaleDateString("en-GB")}
                      </div>
                    </div>

                    {!creatingClient ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Link to client</label>
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                          <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                          <SelectContent>
                            {allClients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setCreatingClient(true)}
                          className="text-xs text-primary hover:underline underline-offset-2"
                        >
                          + Create new client
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">New client name</label>
                        <input
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          placeholder="Company name…"
                          value={newClientName}
                          onChange={e => setNewClientName(e.target.value)}
                          autoFocus
                        />
                        <button
                          onClick={() => { setCreatingClient(false); setNewClientName(""); }}
                          className="text-xs text-muted-foreground hover:underline underline-offset-2"
                        >
                          ← Select existing client instead
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Queue 2: Candidate Notes */}
              {activeQueue === "notes" && (() => {
                const c = currentItem as CandidateWithNotes;
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Candidate Notes Review</p>
                      <h2 className="text-lg font-semibold">{c.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {[c.job_title, c.current_employer].filter(Boolean).join(" at ")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Notes ({c.notes.length})</label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={tidyNotes}
                          disabled={tidying}
                        >
                          {tidying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                          Tidy these notes
                        </Button>
                      </div>
                      <Textarea
                        value={editedNotes}
                        onChange={e => setEditedNotes(e.target.value)}
                        rows={8}
                        className="text-sm font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-destructive"
                        onClick={clearNotes}
                      >
                        Clear notes
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Queue 3: Candidate Job Assignment */}
              {activeQueue === "assignments" && (() => {
                const c = currentItem as UnlinkedCandidate;
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Job Assignment</p>
                      <h2 className="text-lg font-semibold">{c.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {[c.job_title, c.current_employer].filter(Boolean).join(" at ")}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">{c.status}</Badge>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Was this candidate active on a role?</label>
                      <Select value={selectedJob} onValueChange={setSelectedJob}>
                        <SelectTrigger><SelectValue placeholder="Select job or 'Not on an active role'" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Not on an active role</SelectItem>
                          {allJobs.map(j => (
                            <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })()}

              {/* Queue 4: Duplicate Review */}
              {activeQueue === "duplicates" && (() => {
                const d = currentItem as DuplicateCandidate;
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Possible Duplicate</p>
                      <h2 className="text-lg font-semibold">{d.name}</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="border-primary/20">
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs font-medium text-primary">Record A</p>
                          <p className="text-sm">{d.email1 || "No email"}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Record B</p>
                          <p className="text-sm">{d.email2 || "No email"}</p>
                        </CardContent>
                      </Card>
                    </div>
                    {d.email1 !== d.email2 && d.email1 && d.email2 && (
                      <div className="text-xs text-yellow-500 flex items-center gap-1">
                        Emails differ — review carefully
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={merging}
                        onClick={() => mergeDuplicate(d.id1, d.id2)}
                      >
                        {merging ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Merge (keep A)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={merging}
                        onClick={() => mergeDuplicate(d.id2, d.id1)}
                      >
                        Merge (keep B)
                      </Button>
                      <Button size="sm" variant="ghost" onClick={keepSeparate}>
                        Keep separate
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Action bar */}
              {activeQueue !== "duplicates" && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={skipItem}>
                    <SkipForward className="h-4 w-4 mr-1" /> Skip
                  </Button>
                  <Button
                    id="migration-confirm-btn"
                    onClick={
                      activeQueue === "jobs" ? confirmJob
                        : activeQueue === "notes" ? confirmNotes
                        : confirmAssignment
                    }
                    disabled={processing}
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                    Confirm & next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Keyboard shortcut hints */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> Confirm</span>
          <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> S = Skip</span>
          <span>← → Navigate</span>
        </div>

        {/* Come back later */}
        {showLaterOption && (
          <div className="text-center pt-2">
            <button
              onClick={() => {
                toast.info("Progress saved — find Migration Assistant in Settings");
                onComplete();
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Come back later — save progress
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: live count card ────────────────────────────────────────
function CountCard({ label, icon: Icon, table }: { label: string; icon: any; table: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { count: c } = await supabase.from(table as any).select("id", { count: "exact", head: true });
      setCount(c ?? 0);
    })();
  }, [table]);
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <Icon className="h-5 w-5 mx-auto text-primary mb-1" />
        <div className="text-2xl font-bold">{count ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
