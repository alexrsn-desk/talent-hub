// Compare & Submit — full-screen 5-step workflow.
// ① Role → ② Candidates → ③ AI Assessment → ④ Select → ⑤ Send
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Edit3, FileText,
  Loader2, Plus, Search, Send, Sparkles, Trash2, Upload, X, GripVertical, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { JobSpecUploader } from "@/components/JobSpecUploader";
import {
  useJobs, useCandidates, useCreateCandidate, useCandidateJobs,
  useCreateCandidateJob, useUpdateCandidateJob, useCreateNote, type Candidate, type Job,
} from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activity-log";

type ExtraCand = {
  ref_id: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  current_employer?: string;
  cv_text?: string;
  email?: string;
};

type SelectedCand = {
  ref_id: string;          // candidate.id or extra ref_id
  existing_id?: string;    // resolved candidate id once saved
  display_name: string;
  job_title?: string;
  current_employer?: string;
  context?: string;        // recruiter's extra note for THIS comparison
  email?: string;
  salary_expectation?: number | null;
  availability?: string | null;
};

type Assessment = {
  ref_id: string;
  score: number;
  tier: "strong" | "moderate" | "weak";
  reason: string;
  watch_outs: string[];
};

const STEPS = ["Role", "Candidates", "Assessment", "Select", "Send"] as const;

const tierBadge = (t: Assessment["tier"]) =>
  t === "strong" ? "bg-green-500/15 text-green-400 border-green-500/30"
  : t === "moderate" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
  : "bg-red-500/15 text-red-400 border-red-500/30";

const tierEmoji = (t: Assessment["tier"]) => t === "strong" ? "🟢" : t === "moderate" ? "🟡" : "🔴";
const tierLabel = (t: Assessment["tier"]) => t === "strong" ? "Strong match" : t === "moderate" ? "Moderate match" : "Weak match";

export default function CompareSubmitPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: jobs = [] } = useJobs();
  const job = jobs.find((j) => j.id === jobId) as (Job & { description?: string; intake_summary?: string; clients?: any }) | undefined;

  const [step, setStep] = useState(0);
  const draftKey = `compare-submit:${jobId}`;

  // Step 2 state
  const [selected, setSelected] = useState<SelectedCand[]>([]);
  const [extras, setExtras] = useState<ExtraCand[]>([]);
  const [perContext, setPerContext] = useState<Record<string, string>>({});

  // Step 3 state
  const [assessing, setAssessing] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>({});
  const [loadingMessage, setLoadingMessage] = useState("");

  // Step 4 state
  const [sendFormat, setSendFormat] = useState<"individual" | "shortlist">("shortlist");
  const [editedReasons, setEditedReasons] = useState<Record<string, string>>({});

  // Step 5 state
  const [recruiterStyle, setRecruiterStyle] = useState<string>("");
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [pasteExample, setPasteExample] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [shortlistDraft, setShortlistDraft] = useState<{ subject: string; body: string } | null>(null);
  const [individualDrafts, setIndividualDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [sending, setSending] = useState(false);
  const [sentSummary, setSentSummary] = useState<{ count: number } | null>(null);
  const [recruiterFirstName, setRecruiterFirstName] = useState<string>("");

  // ───────────────────────── Draft persistence ─────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setStep(d.step ?? 0);
        setSelected(d.selected ?? []);
        setExtras(d.extras ?? []);
        setPerContext(d.perContext ?? {});
        setAssessments(d.assessments ?? []);
        setTicked(new Set(d.ticked ?? []));
        setSendFormat(d.sendFormat ?? "shortlist");
        setEditedReasons(d.editedReasons ?? {});
        setPersonalNotes(d.personalNotes ?? {});
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        step, selected, extras, perContext, assessments,
        ticked: Array.from(ticked), sendFormat, editedReasons, personalNotes,
      }));
    } catch {}
  }, [step, selected, extras, perContext, assessments, ticked, sendFormat, editedReasons, personalNotes, draftKey]);

  // Load recruiter style + name on entering step 5
  useEffect(() => {
    if (step !== 4 || styleLoaded || !user) return;
    (async () => {
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("submission_email_template, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setRecruiterStyle((data as any)?.submission_email_template || "");
      setRecruiterFirstName(((data as any)?.display_name || "").split(" ")[0] || "");
      setStyleLoaded(true);
    })();
  }, [step, styleLoaded, user]);

  // Auto-generate email when step 5 opens (if we don't already have one)
  useEffect(() => {
    if (step !== 4 || !styleLoaded) return;
    if (sendFormat === "shortlist" && !shortlistDraft) generateEmail();
    if (sendFormat === "individual" && Object.keys(individualDrafts).length === 0) generateEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, styleLoaded, sendFormat]);

  if (!job) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const clientName = (job as any).clients?.company_name || "—";

  // ───────────────────────── Step 3 — assessment ─────────────────────────
  const runAssessment = useCallback(async () => {
    if (selected.length < 2) {
      toast.error("Add at least 2 candidates");
      return;
    }
    setAssessing(true);
    setLoadingMessage("Reading the role…");
    const t1 = setTimeout(() => setLoadingMessage("Reading each candidate…"), 1200);
    const t2 = setTimeout(() => setLoadingMessage("Comparing fit…"), 2400);
    try {
      const candidate_ids = selected.filter((s) => s.existing_id || !extras.find((e) => e.ref_id === s.ref_id)).map((s) => s.existing_id || s.ref_id);
      const extra_candidates = extras
        .filter((e) => selected.find((s) => s.ref_id === e.ref_id))
        .map((e) => ({
          ref_id: e.ref_id, first_name: e.first_name, last_name: e.last_name,
          job_title: e.job_title, current_employer: e.current_employer, cv_text: e.cv_text,
          context: perContext[e.ref_id],
        }));
      const ctxMap: Record<string, string> = {};
      for (const s of selected) if (s.context) ctxMap[s.existing_id || s.ref_id] = s.context;

      const { data, error } = await supabase.functions.invoke("compare-submit-assess", {
        body: { job_id: jobId, candidate_ids, extra_candidates, per_candidate_context: ctxMap },
      });
      if (error) throw error;
      const a: Assessment[] = (data?.assessments || []).map((x: any) => ({
        ref_id: String(x.ref_id),
        score: Number(x.score) || 0,
        tier: (x.tier === "strong" || x.tier === "weak") ? x.tier : "moderate",
        reason: String(x.reason || ""),
        watch_outs: Array.isArray(x.watch_outs) ? x.watch_outs : [],
      }));
      // sort by score desc
      a.sort((x, y) => y.score - x.score);
      setAssessments(a);
      // auto-tick strong, expand strong+moderate
      const newTicked = new Set<string>();
      const newExpanded = new Set<string>();
      for (const x of a) {
        if (x.tier === "strong") newTicked.add(x.ref_id);
        if (x.tier !== "weak") newExpanded.add(x.ref_id);
      }
      setTicked(newTicked);
      setExpanded(newExpanded);
    } catch (e: any) {
      toast.error(e?.message || "AI assessment failed");
    } finally {
      clearTimeout(t1); clearTimeout(t2);
      setAssessing(false);
      setLoadingMessage("");
    }
  }, [extras, jobId, perContext, selected]);

  // ───────────────────────── Step 5 — draft email ─────────────────────────
  const generateEmail = useCallback(async () => {
    setDrafting(true);
    try {
      const chosen = selected.filter((s) => ticked.has(s.ref_id));
      const payloadCandidates = chosen.map((s) => {
        const a = assessments.find((x) => x.ref_id === s.ref_id);
        return {
          ref_id: s.ref_id,
          name: s.display_name,
          first_name: s.display_name.split(" ")[0],
          job_title: s.job_title,
          current_employer: s.current_employer,
          salary_expectation: s.salary_expectation,
          availability: s.availability,
          reason: editedReasons[s.ref_id] || a?.reason || "",
          extra_context: s.context,
        };
      });
      const { data, error } = await supabase.functions.invoke("compare-submit-email", {
        body: {
          job_id: jobId,
          format: sendFormat,
          candidates: payloadCandidates,
          recruiter_style: recruiterStyle || null,
          recruiter_first_name: recruiterFirstName || null,
        },
      });
      if (error) throw error;
      if (sendFormat === "shortlist") {
        setShortlistDraft({ subject: data?.subject || `Shortlist for ${job.title}`, body: data?.body || "" });
      } else {
        const map: Record<string, { subject: string; body: string }> = {};
        for (const e of (data?.emails || [])) {
          map[String(e.ref_id)] = { subject: e.subject || `Candidate for ${job.title}`, body: e.body || "" };
        }
        setIndividualDrafts(map);
      }
    } catch (e: any) {
      toast.error(e?.message || "Email draft failed");
    } finally {
      setDrafting(false);
    }
  }, [assessments, editedReasons, individualDrafts, jobId, job.title, recruiterFirstName, recruiterStyle, selected, sendFormat, shortlistDraft, ticked]);

  // ───────────────────────── Step 5 — send ─────────────────────────
  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const chosen = selected.filter((s) => ticked.has(s.ref_id));
      const notChosen = selected.filter((s) => !ticked.has(s.ref_id));

      // 1. Persist any "extras" as new candidates first
      for (const s of chosen) {
        if (!s.existing_id) {
          const extra = extras.find((e) => e.ref_id === s.ref_id);
          if (extra) {
            const { data: created, error } = await supabase
              .from("candidates")
              .insert({
                name: `${extra.first_name} ${extra.last_name}`.trim(),
                first_name: extra.first_name,
                last_name: extra.last_name,
                job_title: extra.job_title || null,
                current_employer: extra.current_employer || null,
                email: extra.email || null,
                summary: extra.cv_text ? extra.cv_text.slice(0, 4000) : null,
                source: "Compare & Submit",
                owner_user_id: user?.id,
              } as any)
              .select()
              .single();
            if (!error && created) s.existing_id = created.id;
          }
        }
      }

      // 2. Link / move each chosen candidate to Submitted stage
      for (const s of chosen) {
        if (!s.existing_id) continue;
        const { data: existing } = await supabase
          .from("candidate_jobs")
          .select("id, stage")
          .eq("candidate_id", s.existing_id)
          .eq("job_id", jobId)
          .maybeSingle();
        if (existing) {
          if (existing.stage !== "Submitted") {
            await supabase.from("candidate_jobs").update({ stage: "Submitted" }).eq("id", existing.id);
            await logActivity({
              action_type: "stage_change", candidate_id: s.existing_id, job_id: jobId,
              candidate_job_id: existing.id,
              metadata: { stage_from: existing.stage, stage_to: "Submitted", via: "Compare & Submit" },
            });
          }
        } else {
          const { data: cj } = await supabase
            .from("candidate_jobs")
            .insert({ candidate_id: s.existing_id, job_id: jobId, stage: "Submitted", source: "Compare & Submit", owner_user_id: user?.id } as any)
            .select().single();
          if (cj) {
            await logActivity({
              action_type: "candidate_job_linked", candidate_id: s.existing_id, job_id: jobId,
              candidate_job_id: cj.id, metadata: { stage: "Submitted", via: "Compare & Submit" },
            });
          }
        }
        // Note on candidate record
        await supabase.from("notes").insert({
          content: `Submitted to ${clientName} for ${job.title}`,
          activity_type: "CV Sent",
          candidate_id: s.existing_id,
          job_id: jobId,
          owner_user_id: user?.id,
        } as any);
        // Save personal note for next time
        if (personalNotes[s.ref_id]) {
          await supabase.from("notes").insert({
            content: `Compare & Submit note: ${personalNotes[s.ref_id]}`,
            activity_type: "Note",
            candidate_id: s.existing_id,
            owner_user_id: user?.id,
          } as any);
        }
      }

      // 3. Client touchpoint
      if ((job as any).client_id) {
        await supabase.from("notes").insert({
          content: `Submission sent — ${chosen.length} candidate(s) for ${job.title}`,
          activity_type: "CV Sent",
          client_id: (job as any).client_id,
          job_id: jobId,
          owner_user_id: user?.id,
        } as any);
      }

      // 4. Job-level activity log
      await logActivity({
        action_type: "cv_sent",
        job_id: jobId,
        metadata: {
          via: "Compare & Submit",
          format: sendFormat,
          submitted: chosen.length,
          considered: selected.length,
        },
      });

      // 5. Log non-selected candidates as considered
      for (const s of notChosen) {
        if (!s.existing_id) continue;
        const a = assessments.find((x) => x.ref_id === s.ref_id);
        await supabase.from("notes").insert({
          content: `Considered for ${job.title} — not submitted. ${a?.reason || ""}`.trim(),
          activity_type: "Note",
          candidate_id: s.existing_id,
          job_id: jobId,
          owner_user_id: user?.id,
        } as any);
      }

      setSentSummary({ count: chosen.length });
      try { localStorage.removeItem(draftKey); } catch {}
    } catch (e: any) {
      toast.error(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }, [assessments, clientName, draftKey, extras, job, jobId, personalNotes, selected, sendFormat, ticked, user]);

  const saveTemplate = async () => {
    if (!user) return;
    await supabase.from("recruiter_profiles").upsert(
      { user_id: user.id, submission_email_template: pasteExample } as any,
      { onConflict: "user_id" },
    );
    setRecruiterStyle(pasteExample);
    toast.success("Template saved");
  };

  // ───────────────────────── Render ─────────────────────────
  if (sentSummary) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="p-10 text-center space-y-4">
          <div className="flex justify-center"><Check className="h-12 w-12 text-green-400" /></div>
          <h2 className="text-2xl font-semibold">Sent to {clientName}</h2>
          <p className="text-muted-foreground">{sentSummary.count} candidate{sentSummary.count === 1 ? "" : "s"} submitted</p>
          <div className="flex justify-center gap-2 pt-2">
            <Button onClick={() => navigate(`/jobs?jobId=${jobId}`)}>View job</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>Compare more candidates</Button>
            <Button variant="ghost" onClick={() => navigate(`/jobs`)}>Done</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs?jobId=${jobId}`)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to job
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Compare & Submit</h1>
          <p className="text-sm text-muted-foreground">{job.title} · {clientName}</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const isCurrent = i === step;
          const isDone = i < step;
          const canClick = isDone || (i < step + 1);
          return (
            <button
              key={label}
              onClick={() => canClick && setStep(i)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
                isCurrent ? "border-primary bg-primary/10 text-primary"
                : isDone ? "border-green-500/40 bg-green-500/5 text-green-400 hover:bg-green-500/10"
                : "border-border text-muted-foreground"
              } ${canClick ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                isCurrent ? "bg-primary text-primary-foreground"
                : isDone ? "bg-green-500/30 text-green-200" : "bg-muted text-muted-foreground"
              }`}>{isDone ? <Check className="h-3 w-3" /> : i + 1}</span>
              <span className="font-medium">{label}</span>
              {i < STEPS.length - 1 && <span className="ml-1 text-muted-foreground/50">→</span>}
            </button>
          );
        })}
      </div>

      {/* Step body */}
      {step === 0 && <RoleStep job={job} onContinue={() => setStep(1)} onEdit={() => navigate(`/jobs?jobId=${jobId}`)} />}

      {step === 1 && (
        <CandidatesStep
          jobId={jobId}
          selected={selected}
          setSelected={setSelected}
          extras={extras}
          setExtras={setExtras}
          perContext={perContext}
          setPerContext={setPerContext}
          onBack={() => setStep(0)}
          onContinue={() => { setStep(2); setTimeout(runAssessment, 0); }}
        />
      )}

      {step === 2 && (
        <AssessmentStep
          selected={selected}
          assessments={assessments}
          ticked={ticked} setTicked={setTicked}
          expanded={expanded} setExpanded={setExpanded}
          personalNotes={personalNotes} setPersonalNotes={setPersonalNotes}
          assessing={assessing} loadingMessage={loadingMessage}
          onRerun={runAssessment}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <SelectStep
          selected={selected.filter((s) => ticked.has(s.ref_id))}
          assessments={assessments}
          editedReasons={editedReasons} setEditedReasons={setEditedReasons}
          sendFormat={sendFormat} setSendFormat={setSendFormat}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <SendStep
          job={job} clientName={clientName}
          recruiterStyle={recruiterStyle} setRecruiterStyle={setRecruiterStyle}
          pasteExample={pasteExample} setPasteExample={setPasteExample} saveTemplate={saveTemplate}
          sendFormat={sendFormat} setSendFormat={setSendFormat}
          chosen={selected.filter((s) => ticked.has(s.ref_id))}
          ticked={ticked} setTicked={setTicked}
          drafting={drafting} regenerate={generateEmail}
          shortlistDraft={shortlistDraft} setShortlistDraft={setShortlistDraft}
          individualDrafts={individualDrafts} setIndividualDrafts={setIndividualDrafts}
          sending={sending} onSend={handleSend}
          onBack={() => setStep(3)}
          onSaveDraft={() => { toast.success("Draft saved"); navigate(`/jobs?jobId=${jobId}`); }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Step 1 ─────────────────────────
function RoleStep({ job, onContinue, onEdit }: { job: any; onContinue: () => void; onEdit: () => void }) {
  const [jdDraft, setJdDraft] = useState<string>(job.description || "");
  const [savingJd, setSavingJd] = useState(false);
  async function saveJd() {
    setSavingJd(true);
    try {
      const { error } = await supabase.from("jobs").update({ description: jdDraft || null }).eq("id", job.id);
      if (error) throw error;
      job.description = jdDraft;
      toast.success("Job spec saved");
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSavingJd(false);
    }
  }
  const hasJD = (job.description || "").trim().length > 50;
  const hasIntake = (job.intake_summary || "").trim().length > 30;
  const salary = job.salary_min || job.salary_max
    ? `£${job.salary_min || "?"} – £${job.salary_max || "?"}`
    : "Not set";
  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">The role</div>
            <h2 className="text-lg font-semibold mt-1">{job.title}</h2>
            <p className="text-sm text-muted-foreground">{job.clients?.company_name || "—"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1">
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t border-border pt-3">
          <div><div className="text-xs text-muted-foreground">Salary</div>{salary}</div>
          <div><div className="text-xs text-muted-foreground">Location</div>{job.location || "—"}</div>
          <div><div className="text-xs text-muted-foreground">Type</div>{job.job_type || "—"}</div>
          <div><div className="text-xs text-muted-foreground">Status</div>{job.status}</div>
        </div>
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Job spec</span>
            {hasJD ? <Badge variant="outline" className="text-green-400 border-green-500/40">Loaded</Badge>
                   : <Badge variant="outline" className="text-yellow-400 border-yellow-500/40">Missing</Badge>}
          </div>
          {hasJD && <p className="text-xs text-muted-foreground line-clamp-3">{job.description}</p>}
          <div className="flex items-center gap-2 mt-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Intake brief</span>
            {hasIntake ? <Badge variant="outline" className="text-green-400 border-green-500/40">Loaded</Badge>
                       : <Badge variant="outline" className="text-yellow-400 border-yellow-500/40">Missing</Badge>}
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <JobSpecUploader
          value={jdDraft}
          onChange={setJdDraft}
          label="Job spec — upload or paste"
          rows={6}
          helper="Used by the AI assessment in step 3."
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={saveJd} disabled={savingJd || jdDraft === (job.description || "")}>
            {savingJd ? "Saving…" : "Save job spec"}
          </Button>
        </div>
      </Card>

      {(!hasJD || !hasIntake) && (
        <Card className="p-4 border-yellow-500/30 bg-yellow-500/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Adding more context here will improve the quality of candidate assessment.</p>
            <p className="text-muted-foreground mt-1">Want to add it now?</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>Add context</Button>
            <Button size="sm" variant="ghost" onClick={onContinue}>Continue without it</Button>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} className="gap-1">Continue to candidates <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ───────────────────────── Step 2 ─────────────────────────
function CandidatesStep(props: {
  jobId: string;
  selected: SelectedCand[]; setSelected: (v: SelectedCand[]) => void;
  extras: ExtraCand[]; setExtras: (v: ExtraCand[]) => void;
  perContext: Record<string, string>; setPerContext: (v: Record<string, string>) => void;
  onBack: () => void; onContinue: () => void;
}) {
  const { selected, setSelected, extras, setExtras, perContext, setPerContext, onBack, onContinue } = props;
  const { data: candidates = [] } = useCandidates();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"db" | "cv" | "quick">("db");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const recent = useMemo(() => {
    return [...candidates]
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 8);
  }, [candidates]);

  const results = useMemo(() => {
    if (!search.trim()) return recent;
    const q = search.toLowerCase();
    return candidates.filter((c) =>
      (c.name || "").toLowerCase().includes(q)
      || (c.job_title || "").toLowerCase().includes(q)
      || ((c as any).current_employer || "").toLowerCase().includes(q)
      || (c.email || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [candidates, recent, search]);

  const isSelected = (id: string) => selected.some((s) => s.ref_id === id || s.existing_id === id);

  const addCandidate = (c: Candidate) => {
    if (selected.length >= 10) { toast.error("Maximum 10 candidates"); return; }
    if (isSelected(c.id)) return;
    setSelected([...selected, {
      ref_id: c.id, existing_id: c.id, display_name: c.name || "Unnamed",
      job_title: c.job_title || undefined, current_employer: (c as any).current_employer || undefined,
      email: c.email || undefined, salary_expectation: (c as any).salary_expectation,
      availability: (c as any).availability || (c as any).notice_period,
    }]);
  };

  const removeCandidate = (refId: string) => {
    setSelected(selected.filter((s) => s.ref_id !== refId));
    setExtras(extras.filter((e) => e.ref_id !== refId));
  };

  const handleQuickAdd = (first: string, last: string, role: string) => {
    if (!first.trim() || !last.trim()) { toast.error("First and last name required"); return; }
    const ref_id = `extra_${Date.now()}`;
    setExtras([...extras, { ref_id, first_name: first.trim(), last_name: last.trim(), job_title: role.trim() }]);
    setSelected([...selected, {
      ref_id, display_name: `${first} ${last}`.trim(), job_title: role.trim() || undefined,
    }]);
  };

  const handleCVUpload = async (file: File) => {
    setUploading(true);
    try {
      const text = await extractTextFromFile(file);
      // Try to match to existing candidate
      const lower = text.slice(0, 4000).toLowerCase();
      const match = candidates.find((c) => {
        const n = (c.name || "").toLowerCase();
        const em = (c.email || "").toLowerCase();
        return (n.length > 4 && lower.includes(n)) || (em.length > 6 && lower.includes(em));
      });
      if (match) {
        addCandidate(match);
        toast.success(`Matched to existing profile: ${match.name}`);
      } else {
        // Try crude name extraction (first line)
        const first = text.split(/\s+/).slice(0, 1).join("") || "Unnamed";
        const last = text.split(/\s+/).slice(1, 2).join("") || "Candidate";
        const ref_id = `extra_${Date.now()}`;
        setExtras([...extras, { ref_id, first_name: first, last_name: last, cv_text: text.slice(0, 8000) }]);
        setSelected([...selected, { ref_id, display_name: `${first} ${last}` }]);
        toast.message("New candidate added from CV", { description: "Edit name in the list below if needed." });
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to read CV");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Who are you considering for this role?</h2>
        <p className="text-sm text-muted-foreground">Add up to 10 candidates to compare ({selected.length}/10)</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="db">From your database</TabsTrigger>
          <TabsTrigger value="cv">Upload a CV</TabsTrigger>
          <TabsTrigger value="quick">Quick add</TabsTrigger>
        </TabsList>

        <TabsContent value="db" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, role, employer or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          {!search && <p className="text-xs text-muted-foreground">Recently updated candidates:</p>}
          <div className="border border-border rounded-md divide-y divide-border max-h-80 overflow-auto">
            {results.length === 0 && <div className="p-4 text-sm text-muted-foreground">No matches.</div>}
            {results.map((c) => (
              <button key={c.id} onClick={() => addCandidate(c)} disabled={isSelected(c.id)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30 disabled:opacity-50">
                <Initials name={c.name || ""} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.job_title || "—"}{(c as any).current_employer ? ` · ${(c as any).current_employer}` : ""}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{(c as any).status || "Active"}</Badge>
                {isSelected(c.id) ? <Check className="h-4 w-4 text-green-400" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cv">
          <Card className="p-6 text-center space-y-3 border-dashed">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm">Drag and drop a PDF or Word CV, or click to choose.</p>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCVUpload(f); }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Choose file"}
            </Button>
            <p className="text-xs text-muted-foreground">We'll try to match the CV to an existing profile first.</p>
          </Card>
        </TabsContent>

        <TabsContent value="quick">
          <QuickAddForm onAdd={handleQuickAdd} />
        </TabsContent>
      </Tabs>

      {/* Added candidates list */}
      {selected.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Added ({selected.length})</div>
          {selected.map((s) => (
            <Card key={s.ref_id} className="p-3">
              <div className="flex items-center gap-3">
                <Initials name={s.display_name} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.job_title || "—"}{s.current_employer ? ` · ${s.current_employer}` : ""}
                    {!s.existing_id && <Badge variant="outline" className="ml-2 text-[10px]">New</Badge>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeCandidate(s.ref_id)}><X className="h-4 w-4" /></Button>
              </div>
              <Textarea
                value={perContext[s.ref_id] || s.context || ""}
                onChange={(e) => {
                  setPerContext({ ...perContext, [s.ref_id]: e.target.value });
                  setSelected(selected.map((x) => x.ref_id === s.ref_id ? { ...x, context: e.target.value } : x));
                }}
                placeholder={`Anything else you know about ${s.display_name.split(" ")[0]} that's relevant to this role? (optional)`}
                rows={2}
                className="mt-2 text-xs"
              />
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button onClick={onContinue} disabled={selected.length < 2} className="gap-1">
          Continue to assessment <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuickAddForm({ onAdd }: { onAdd: (first: string, last: string, role: string) => void }) {
  const [first, setFirst] = useState(""); const [last, setLast] = useState(""); const [role, setRole] = useState("");
  return (
    <Card className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
        <Input placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
        <Input placeholder="Current role" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      <Button size="sm" onClick={() => { onAdd(first, last, role); setFirst(""); setLast(""); setRole(""); }} className="gap-1">
        <Plus className="h-4 w-4" /> Add to comparison
      </Button>
    </Card>
  );
}

function Initials({ name }: { name: string }) {
  const i = name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";
  return <div className="h-9 w-9 flex-shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">{i}</div>;
}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return await file.text();
  }
  // For PDF/DOCX, fall back to reading bytes as text — a real CV parser would be
  // a separate edge function; for the wizard we send raw text excerpt to the AI.
  try {
    const text = await file.text();
    // Strip binary noise
    return text.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return `Uploaded file: ${file.name}`;
  }
}

// ───────────────────────── Step 3 ─────────────────────────
function AssessmentStep(props: {
  selected: SelectedCand[]; assessments: Assessment[];
  ticked: Set<string>; setTicked: (v: Set<string>) => void;
  expanded: Set<string>; setExpanded: (v: Set<string>) => void;
  personalNotes: Record<string, string>; setPersonalNotes: (v: Record<string, string>) => void;
  assessing: boolean; loadingMessage: string;
  onRerun: () => void; onBack: () => void; onContinue: () => void;
}) {
  const { selected, assessments, ticked, setTicked, expanded, setExpanded, personalNotes, setPersonalNotes,
    assessing, loadingMessage, onRerun, onBack, onContinue } = props;

  const toggleTick = (id: string) => {
    const n = new Set(ticked);
    n.has(id) ? n.delete(id) : n.add(id);
    setTicked(n);
  };
  const toggleExpand = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  // Sort: order by assessment.score desc; candidates without assessment go last
  const ordered = useMemo(() => {
    const scoreOf = (id: string) => assessments.find((a) => a.ref_id === id)?.score ?? -1;
    return [...selected].sort((a, b) => scoreOf(b.ref_id) - scoreOf(a.ref_id));
  }, [selected, assessments]);

  if (assessing) {
    return (
      <Card className="p-12 text-center space-y-3">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
        <p className="text-sm font-medium">{loadingMessage || "Assessing…"}</p>
        <p className="text-xs text-muted-foreground">Comparing {selected.length} candidates against the role</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Assessment</h2>
        <Button variant="outline" size="sm" onClick={onRerun} className="gap-1">
          <Sparkles className="h-3.5 w-3.5" /> Re-run
        </Button>
      </div>

      {ordered.map((s) => {
        const a = assessments.find((x) => x.ref_id === s.ref_id);
        const tier = a?.tier || "moderate";
        const isExpanded = expanded.has(s.ref_id);
        return (
          <Card key={s.ref_id} className="p-4">
            <div className="flex items-start gap-3">
              <Checkbox checked={ticked.has(s.ref_id)} onCheckedChange={() => toggleTick(s.ref_id)} className="mt-1" />
              <Initials name={s.display_name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{s.display_name}</span>
                  <span className="text-xs text-muted-foreground">{s.job_title || "—"}{s.current_employer ? ` @ ${s.current_employer}` : ""}</span>
                  {a && (
                    <Badge variant="outline" className={`text-xs ${tierBadge(tier)}`}>
                      {tierEmoji(tier)} {tierLabel(tier)} — {a.score}%
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => toggleExpand(s.ref_id)}>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {isExpanded && a && (
              <div className="ml-12 mt-3 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Why this match</div>
                  <p className="text-foreground/90 leading-relaxed">{a.reason}</p>
                </div>
                {a.watch_outs.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-yellow-400 uppercase tracking-wide mb-1">Watch out for</div>
                    <ul className="list-disc list-inside text-foreground/80 space-y-0.5">
                      {a.watch_outs.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <Textarea
                  value={personalNotes[s.ref_id] || ""}
                  onChange={(e) => setPersonalNotes({ ...personalNotes, [s.ref_id]: e.target.value })}
                  placeholder="Add a personal note (saved on the candidate record for next time)…"
                  rows={2} className="text-xs"
                />
              </div>
            )}
            {!isExpanded && a && tier === "weak" && (
              <button onClick={() => toggleExpand(s.ref_id)} className="ml-12 mt-1 text-xs text-muted-foreground hover:text-foreground">
                Show reasoning
              </button>
            )}
          </Card>
        );
      })}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button onClick={onContinue} disabled={ticked.size === 0} className="gap-1">
          Continue to selection <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── Step 4 ─────────────────────────
function SelectStep(props: {
  selected: SelectedCand[]; assessments: Assessment[];
  editedReasons: Record<string, string>; setEditedReasons: (v: Record<string, string>) => void;
  sendFormat: "individual" | "shortlist"; setSendFormat: (v: "individual" | "shortlist") => void;
  onBack: () => void; onContinue: () => void;
}) {
  const { selected, assessments, editedReasons, setEditedReasons, sendFormat, setSendFormat, onBack, onContinue } = props;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Confirm who you're sending</h2>
        <p className="text-sm text-muted-foreground">{selected.length} candidate{selected.length === 1 ? "" : "s"}</p>
      </div>

      <div className="space-y-2">
        {selected.map((s) => {
          const a = assessments.find((x) => x.ref_id === s.ref_id);
          return (
            <Card key={s.ref_id} className="p-3">
              <div className="flex items-center gap-3">
                <Initials name={s.display_name} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.display_name}</div>
                  <div className="text-xs text-muted-foreground">{s.job_title || "—"} {a && <span className={`ml-1 ${tierBadge(a.tier)} px-1.5 rounded`}>{a.score}%</span>}</div>
                </div>
              </div>
              <Textarea
                value={editedReasons[s.ref_id] ?? a?.reason ?? ""}
                onChange={(e) => setEditedReasons({ ...editedReasons, [s.ref_id]: e.target.value })}
                rows={2} className="mt-2 text-xs"
              />
            </Card>
          );
        })}
      </div>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">How would you like to send these?</div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" checked={sendFormat === "individual"} onChange={() => setSendFormat("individual")} className="mt-1" />
          <div>
            <div className="text-sm font-medium">Individual emails</div>
            <div className="text-xs text-muted-foreground">Separate personalised email per candidate</div>
          </div>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" checked={sendFormat === "shortlist"} onChange={() => setSendFormat("shortlist")} className="mt-1" />
          <div>
            <div className="text-sm font-medium">One shortlist email</div>
            <div className="text-xs text-muted-foreground">All candidates in a single email</div>
          </div>
        </label>
      </Card>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button onClick={onContinue} className="gap-1">Continue to email <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ───────────────────────── Step 5 ─────────────────────────
function SendStep(props: {
  job: any; clientName: string;
  recruiterStyle: string; setRecruiterStyle: (v: string) => void;
  pasteExample: string; setPasteExample: (v: string) => void; saveTemplate: () => void;
  sendFormat: "individual" | "shortlist"; setSendFormat: (v: "individual" | "shortlist") => void;
  chosen: SelectedCand[];
  ticked: Set<string>; setTicked: (v: Set<string>) => void;
  drafting: boolean; regenerate: () => void;
  shortlistDraft: { subject: string; body: string } | null;
  setShortlistDraft: (v: { subject: string; body: string } | null) => void;
  individualDrafts: Record<string, { subject: string; body: string }>;
  setIndividualDrafts: (v: Record<string, { subject: string; body: string }>) => void;
  sending: boolean; onSend: () => void;
  onBack: () => void; onSaveDraft: () => void;
}) {
  const {
    recruiterStyle, pasteExample, setPasteExample, saveTemplate,
    sendFormat, setSendFormat, chosen, ticked, setTicked,
    drafting, regenerate, shortlistDraft, setShortlistDraft,
    individualDrafts, setIndividualDrafts, sending, onSend, onBack, onSaveDraft,
  } = props;

  const [showTemplate, setShowTemplate] = useState(!recruiterStyle);

  const removeFromSend = (refId: string) => {
    const n = new Set(ticked); n.delete(refId); setTicked(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Review & send</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={regenerate} disabled={drafting} className="gap-1">
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Regenerate
          </Button>
        </div>
      </div>

      {showTemplate && !recruiterStyle && (
        <Card className="p-4 border-primary/30 bg-primary/5 space-y-2">
          <div className="font-medium text-sm">First time? Paste an example submission email</div>
          <p className="text-xs text-muted-foreground">So we can match your style. Saved permanently in Settings, editable any time.</p>
          <Textarea value={pasteExample} onChange={(e) => setPasteExample(e.target.value)} placeholder="Paste an example…" rows={6} />
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => { await saveTemplate(); setShowTemplate(false); regenerate(); }} disabled={!pasteExample.trim()}>Save as my template</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowTemplate(false)}>Skip — use standard format</Button>
          </div>
        </Card>
      )}

      {/* Selected candidates summary with drag handle */}
      <Card className="p-3 space-y-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Sending to {chosen.length} candidate(s)</div>
        {chosen.map((s) => (
          <div key={s.ref_id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/30">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            <Initials name={s.display_name} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.display_name}</div>
              <div className="text-xs text-muted-foreground truncate">{s.job_title || "—"}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeFromSend(s.ref_id)} title="Remove from send">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </Card>

      {/* Email panel */}
      {drafting ? (
        <Card className="p-12 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
          <p className="text-sm mt-3 text-muted-foreground">Drafting your email…</p>
        </Card>
      ) : sendFormat === "shortlist" ? (
        shortlistDraft && (
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input value={shortlistDraft.subject} onChange={(e) => setShortlistDraft({ ...shortlistDraft, subject: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Body</label>
              <Textarea value={shortlistDraft.body} onChange={(e) => setShortlistDraft({ ...shortlistDraft, body: e.target.value })} rows={18} className="font-mono text-sm" />
            </div>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {chosen.map((s) => {
            const d = individualDrafts[s.ref_id];
            if (!d) return null;
            return (
              <Card key={s.ref_id} className="p-4 space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.display_name}</div>
                <div>
                  <label className="text-xs text-muted-foreground">Subject</label>
                  <Input value={d.subject} onChange={(e) => setIndividualDrafts({ ...individualDrafts, [s.ref_id]: { ...d, subject: e.target.value } })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Body</label>
                  <Textarea value={d.body} onChange={(e) => setIndividualDrafts({ ...individualDrafts, [s.ref_id]: { ...d, body: e.target.value } })} rows={10} className="font-mono text-sm" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex justify-between flex-wrap gap-2 pt-2">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button variant="outline" onClick={onSaveDraft}>Save as draft</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSendFormat(sendFormat === "shortlist" ? "individual" : "shortlist"); }}>
            Switch to {sendFormat === "shortlist" ? "individual emails" : "shortlist email"}
          </Button>
          <Button onClick={onSend} disabled={sending || chosen.length === 0} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendFormat === "shortlist" ? "Send as shortlist" : "Send individually"}
          </Button>
        </div>
      </div>
    </div>
  );
}
