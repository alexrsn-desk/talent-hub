import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Copy, ExternalLink, RotateCw, ChevronRight } from "lucide-react";
import { JobSpecUploader } from "@/components/JobSpecUploader";

type MatchCandidate = {
  id: string;
  name: string;
  first_name?: string;
  job_title?: string;
  current_employer?: string;
  status?: string;
  email?: string;
  linkedin_url?: string;
  match_score: number;
  match_reason: string;
};

type DraftMsg = { candidate_id: string; subject?: string; body: string };

const STEPS = ["Brief", "Who You Know", "Generate", "Review", "Launch"] as const;

export default function JobLaunch() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [job, setJob] = useState<any>(null);
  const [hook, setHook] = useState("");
  const [ideal, setIdeal] = useState("");
  const [jobSpec, setJobSpec] = useState("");
  const [loadingJob, setLoadingJob] = useState(true);

  const [matching, setMatching] = useState(false);
  const [known, setKnown] = useState<MatchCandidate[]>([]);
  const [db, setDb] = useState<MatchCandidate[]>([]);
  const [li, setLi] = useState<MatchCandidate[]>([]);
  const [pickedKnown, setPickedKnown] = useState<Set<string>>(new Set());
  const [pickedDb, setPickedDb] = useState<Set<string>>(new Set());
  const [pickedLi, setPickedLi] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState("");
  const [personalMsgs, setPersonalMsgs] = useState<DraftMsg[]>([]);
  const [liMsgs, setLiMsgs] = useState<DraftMsg[]>([]);
  const [linkedinPost, setLinkedinPost] = useState("");
  const [campaign, setCampaign] = useState<{ subject: string; body: string }>({ subject: "", body: "" });
  const [clientEmail, setClientEmail] = useState<{ subject: string; body: string }>({ subject: "", body: "" });
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [reviewTab, setReviewTab] = useState<"known" | "li" | "post" | "campaign" | "client">("known");

  const [launching, setLaunching] = useState(false);
  const [clientEmailWillSend, setClientEmailWillSend] = useState(true);
  const [launched, setLaunched] = useState(false);

  // -------------------- Load job
  useEffect(() => {
    if (!jobId) return;
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, description, intake_summary, location, salary_min, salary_max, job_type, status, search_launched_at, launch_hook, ideal_candidate_line, clients(company_name, contact_name)")
        .eq("id", jobId)
        .single();
      if (data) {
        setJob(data);
        setHook((data as any).launch_hook || "");
        setIdeal((data as any).ideal_candidate_line || "");
        setJobSpec((data as any).description || "");
      }
      setLoadingJob(false);
    })();
  }, [jobId]);

  // -------------------- Step transitions
  async function goToStep2() {
    // persist brief inputs to job
    if (!jobId) return;
    await supabase.from("jobs").update({ launch_hook: hook, ideal_candidate_line: ideal, description: jobSpec || null } as any).eq("id", jobId);
    setStep(1);
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("job-launch-match-candidates", {
        body: { job_id: jobId, launch_hook: hook, ideal_candidate_line: ideal },
      });
      if (error) throw error;
      const k: MatchCandidate[] = data?.known || [];
      const l: MatchCandidate[] = data?.li || [];
      setKnown(k);
      setLi(l);
      setPickedKnown(new Set(k.map((c) => c.id))); // pre-ticked
      setPickedLi(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Could not match candidates");
    } finally {
      setMatching(false);
    }
  }

  async function goToStep3() {
    setStep(2);
    setGenerating(true);
    try {
      setGenStage(`Personalising messages to ${pickedKnown.size} candidates you know...`);
      const { data, error } = await supabase.functions.invoke("job-launch-generate", {
        body: {
          job_id: jobId,
          known_candidate_ids: Array.from(pickedKnown),
          li_candidate_ids: Array.from(pickedLi),
          launch_hook: hook,
          ideal_candidate_line: ideal,
        },
      });
      if (error) throw error;
      setPersonalMsgs((data?.personal_messages || []) as DraftMsg[]);
      setLiMsgs((data?.li_messages || []) as DraftMsg[]);
      setLinkedinPost(data?.linkedin_post || "");
      setCampaign(data?.campaign || { subject: "", body: "" });
      setClientEmail(data?.client_email || { subject: "", body: "" });
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
      setStep(1);
    } finally {
      setGenerating(false);
      setGenStage("");
    }
  }

  async function regenerateOne(candidate_id: string, group: "known" | "li") {
    try {
      const { data, error } = await supabase.functions.invoke("job-launch-generate", {
        body: {
          job_id: jobId,
          known_candidate_ids: group === "known" ? [candidate_id] : [],
          li_candidate_ids: group === "li" ? [candidate_id] : [],
          launch_hook: hook,
          ideal_candidate_line: ideal,
        },
      });
      if (error) throw error;
      if (group === "known") {
        const fresh = (data?.personal_messages || [])[0];
        if (fresh) setPersonalMsgs((arr) => arr.map((m) => (m.candidate_id === candidate_id ? fresh : m)));
      } else {
        const fresh = (data?.li_messages || [])[0];
        if (fresh) setLiMsgs((arr) => arr.map((m) => (m.candidate_id === candidate_id ? fresh : m)));
      }
      toast.success("Regenerated");
    } catch (e: any) {
      toast.error(e?.message || "Regenerate failed");
    }
  }

  async function regenerateBulk(kind: "post" | "campaign" | "client") {
    try {
      const { data, error } = await supabase.functions.invoke("job-launch-generate", {
        body: {
          job_id: jobId,
          known_candidate_ids: [],
          li_candidate_ids: [],
          launch_hook: hook,
          ideal_candidate_line: ideal,
        },
      });
      if (error) throw error;
      if (kind === "post") setLinkedinPost(data?.linkedin_post || "");
      if (kind === "campaign") setCampaign(data?.campaign || campaign);
      if (kind === "client") setClientEmail(data?.client_email || clientEmail);
      toast.success("Regenerated");
    } catch (e: any) {
      toast.error(e?.message || "Regenerate failed");
    }
  }

  // -------------------- Launch
  async function launch() {
    if (!jobId) return;
    setLaunching(true);
    try {
      const personal_records = personalMsgs
        .filter((m) => !skipped.has(`k-${m.candidate_id}`))
        .map((m) => ({
          candidate_id: m.candidate_id,
          channel: "email" as const,
          status: "sent" as const,
          subject: m.subject,
          body: m.body,
        }));
      const li_records = liMsgs
        .filter((m) => !skipped.has(`l-${m.candidate_id}`))
        .map((m) => ({
          candidate_id: m.candidate_id,
          channel: "linkedin" as const,
          status: "queued" as const,
          body: m.body,
        }));
      const { data, error } = await supabase.functions.invoke("job-launch-send", {
        body: {
          job_id: jobId,
          personal_records,
          li_records,
          linkedin_post: linkedinPost,
          campaign,
          client_email: clientEmail,
          client_email_sent: clientEmailWillSend,
        },
      });
      if (error) throw error;
      setLaunched(true);
      toast.success("Search launched");
    } catch (e: any) {
      toast.error(e?.message || "Launch failed");
    } finally {
      setLaunching(false);
    }
  }

  function copy(text: string, label = "Copied") {
    navigator.clipboard.writeText(text);
    toast.success(label);
  }

  // -------------------- UI helpers
  function StepperBar() {
    return (
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="text-[11px]">{i + 1}</span>}
              {label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>
    );
  }

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!job) {
    return <div className="p-8 text-sm text-muted-foreground">Job not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to jobs
        </Button>
        <div className="text-right">
          <h1 className="text-xl font-semibold">Launch search</h1>
          <p className="text-xs text-muted-foreground">
            {job.title} · {(job.clients as any)?.company_name || "—"}
          </p>
        </div>
      </div>

      <StepperBar />

      {/* ─────────── STEP 1 — BRIEF */}
      {step === 0 && (
        <div className="space-y-5 rounded-xl border border-border bg-card/60 p-6">
          <div>
            <h2 className="text-lg font-semibold">Confirm the brief</h2>
            <p className="text-sm text-muted-foreground">Two short fields and we'll generate everything in step 3.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Role" value={job.title} />
            <Info label="Client" value={(job.clients as any)?.company_name || "—"} />
            <Info label="Location" value={job.location || "—"} />
            <Info label="Salary" value={job.salary_min || job.salary_max ? `£${job.salary_min || "?"} – £${job.salary_max || "?"}` : "—"} />
          </div>

          <JobSpecUploader
            value={jobSpec}
            onChange={setJobSpec}
            label="Job spec"
            rows={6}
            placeholder="Upload a PDF/Word/TXT, or paste the job spec here…"
            helper="Adding a job spec significantly improves the quality of everything generated."
          />

          <div>
            <Label className="text-xs">What makes this role genuinely interesting?</Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              The real sell beyond the job title. Used in your LinkedIn post and every outreach message.
            </p>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
              placeholder="e.g. Greenfield infrastructure build, genuine ownership, founding team calibre despite Series B stage, CTO is hands-on"
            />
          </div>

          <div>
            <Label className="text-xs">Ideal candidate in one line</Label>
            <p className="text-[11px] text-muted-foreground mb-1">Used to find matches in the next step.</p>
            <Input
              value={ideal}
              onChange={(e) => setIdeal(e.target.value)}
              placeholder="Someone who has built platform at scale and wants to own it, not just maintain it"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={goToStep2} disabled={!hook.trim() && !ideal.trim()} className="gap-1">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 2 — WHO YOU KNOW */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card/60 p-6">
            <h2 className="text-lg font-semibold mb-1">Who do you already know?</h2>
            <p className="text-sm text-muted-foreground mb-4">Warm to cold — your spoken-to relationships first, then your wider network.</p>

            {matching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching your database for matches…
              </div>
            ) : (
              <div className="space-y-6">
                <Group
                  title="Spoken to — warm relationships"
                  hint="Pre-ticked. Will receive a personalised, warm message."
                  dotClass="bg-green-500"
                  candidates={known}
                  picked={pickedKnown}
                  onToggle={(id) =>
                    setPickedKnown((s) => {
                      const n = new Set(s);
                      n.has(id) ? n.delete(id) : n.add(id);
                      return n;
                    })
                  }
                />
                <Group
                  title="LI connections — network you haven't spoken with"
                  hint="Not pre-ticked. Will receive a short LinkedIn DM."
                  dotClass="bg-blue-500"
                  candidates={li}
                  picked={pickedLi}
                  onToggle={(id) =>
                    setPickedLi((s) => {
                      const n = new Set(s);
                      n.has(id) ? n.delete(id) : n.add(id);
                      return n;
                    })
                  }
                />
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={goToStep3} disabled={matching} className="gap-1">
              Continue with {pickedKnown.size + pickedLi.size} candidate{pickedKnown.size + pickedLi.size === 1 ? "" : "s"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 3 — GENERATING */}
      {step === 2 && (
        <div className="rounded-xl border border-border bg-card/60 p-12 text-center space-y-3">
          <Sparkles className="h-8 w-8 mx-auto text-primary animate-pulse" />
          <h2 className="text-lg font-semibold">Generating all five outputs…</h2>
          <p className="text-sm text-muted-foreground">{genStage || "Writing your launch package…"}</p>
          <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto pt-4">
            <p>· Personalising {pickedKnown.size} warm message{pickedKnown.size === 1 ? "" : "s"}</p>
            <p>· Drafting {pickedLi.size} LinkedIn DM{pickedLi.size === 1 ? "" : "s"}</p>
            <p>· Writing LinkedIn post</p>
            <p>· Drafting campaign message</p>
            <p>· Writing client confirmation</p>
          </div>
        </div>
      )}

      {/* ─────────── STEP 4 — REVIEW */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {[
              { id: "known", label: `Known (${personalMsgs.length})` },
              { id: "li", label: `LI Connections (${liMsgs.length})` },
              { id: "post", label: "LinkedIn Post" },
              { id: "campaign", label: "Campaign" },
              { id: "client", label: "Client Confirmation" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setReviewTab(t.id as any)}
                className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
                  reviewTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {reviewTab === "known" && (
            <div className="space-y-3">
              {personalMsgs.length === 0 && <Empty msg="No known candidates selected." />}
              {personalMsgs.map((m) => {
                const cand = known.find((c) => c.id === m.candidate_id);
                const key = `k-${m.candidate_id}`;
                const isSkipped = skipped.has(key);
                return (
                  <MessageCard
                    key={m.candidate_id}
                    title={cand?.name || "Candidate"}
                    sub={`${cand?.job_title || "?"} @ ${cand?.current_employer || "?"}`}
                    badge={`${cand?.match_score || 0}% · Spoken to — warm`}
                    dotClass="bg-green-500"
                    subject={m.subject}
                    body={m.body}
                    isSkipped={isSkipped}
                    onChange={(field, v) =>
                      setPersonalMsgs((arr) => arr.map((x) => (x.candidate_id === m.candidate_id ? { ...x, [field]: v } : x)))
                    }
                    onSkipToggle={() =>
                      setSkipped((s) => {
                        const n = new Set(s);
                        n.has(key) ? n.delete(key) : n.add(key);
                        return n;
                      })
                    }
                    onRegenerate={() => regenerateOne(m.candidate_id, "known")}
                  />
                );
              })}
            </div>
          )}

          {reviewTab === "li" && (
            <div className="space-y-3">
              {liMsgs.length === 0 && <Empty msg="No LI connections selected." />}
              {liMsgs.map((m) => {
                const cand = li.find((c) => c.id === m.candidate_id);
                const key = `l-${m.candidate_id}`;
                const isSkipped = skipped.has(key);
                return (
                  <MessageCard
                    key={m.candidate_id}
                    title={cand?.name || "Candidate"}
                    sub={`${cand?.job_title || "?"} @ ${cand?.current_employer || "?"}`}
                    badge={`${cand?.match_score || 0}% · LI DM`}
                    dotClass="bg-blue-500"
                    body={m.body}
                    isSkipped={isSkipped}
                    onChange={(field, v) =>
                      setLiMsgs((arr) => arr.map((x) => (x.candidate_id === m.candidate_id ? { ...x, [field]: v } : x)))
                    }
                    onSkipToggle={() =>
                      setSkipped((s) => {
                        const n = new Set(s);
                        n.has(key) ? n.delete(key) : n.add(key);
                        return n;
                      })
                    }
                    onRegenerate={() => regenerateOne(m.candidate_id, "li")}
                  />
                );
              })}
            </div>
          )}

          {reviewTab === "post" && (
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
              <textarea
                value={linkedinPost}
                onChange={(e) => setLinkedinPost(e.target.value)}
                rows={14}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{linkedinPost.length} characters</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => regenerateBulk("post")} className="gap-1">
                    <RotateCw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copy(linkedinPost, "Post copied")} className="gap-1">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" asChild className="gap-1">
                    <a href="https://www.linkedin.com/feed/?shareActive=true" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Open LinkedIn
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {reviewTab === "campaign" && (
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
              <Label className="text-xs">Subject</Label>
              <Input value={campaign.subject} onChange={(e) => setCampaign((c) => ({ ...c, subject: e.target.value }))} />
              <Label className="text-xs">Body</Label>
              <textarea
                value={campaign.body}
                onChange={(e) => setCampaign((c) => ({ ...c, body: e.target.value }))}
                rows={10}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Personalisation placeholders: <code>{"{first_name}"}</code> <code>{"{current_company}"}</code></p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => regenerateBulk("campaign")} className="gap-1">
                  <RotateCw className="h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(`${campaign.subject}\n\n${campaign.body}`, "Copied for Sourcewhale")}>
                  Copy for Sourcewhale
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(`${campaign.subject}\n\n${campaign.body}`, "Copied for Interseller")}>
                  Copy for Interseller
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(campaign.body, "Plain text copied")}>
                  Copy plain
                </Button>
              </div>
            </div>
          )}

          {reviewTab === "client" && (
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
              <Label className="text-xs">Subject</Label>
              <Input value={clientEmail.subject} onChange={(e) => setClientEmail((c) => ({ ...c, subject: e.target.value }))} />
              <Label className="text-xs">Body</Label>
              <textarea
                value={clientEmail.body}
                onChange={(e) => setClientEmail((c) => ({ ...c, body: e.target.value }))}
                rows={12}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
              <div className="flex gap-2 justify-end items-center">
                <label className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
                  <Checkbox checked={clientEmailWillSend} onCheckedChange={(v) => setClientEmailWillSend(!!v)} />
                  Mark as sent when launching
                </label>
                <Button size="sm" variant="outline" onClick={() => regenerateBulk("client")} className="gap-1">
                  <RotateCw className="h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(`${clientEmail.subject}\n\n${clientEmail.body}`, "Client email copied")}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(4)} className="gap-1">
              Continue to launch <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 5 — LAUNCH */}
      {step === 4 && (
        <div className="rounded-xl border border-border bg-card/60 p-6 space-y-5">
          <h2 className="text-lg font-semibold">Ready to launch</h2>
          <ul className="space-y-3 text-sm">
            <li>① Known candidates: <b>{personalMsgs.filter((m) => !skipped.has(`k-${m.candidate_id}`)).length}</b> personal messages will be logged & added to pipeline at <b>Contact</b> stage.</li>
            <li>② LI connections: <b>{liMsgs.filter((m) => !skipped.has(`l-${m.candidate_id}`)).length}</b> DMs queued for manual sending on LinkedIn.</li>
            <li>③ LinkedIn post: <b>{linkedinPost ? "ready" : "not generated"}</b> — copy & paste into LinkedIn.</li>
            <li>④ Campaign message: <b>{campaign.body ? "ready" : "not generated"}</b> — copy into Sourcewhale/Interseller.</li>
            <li>⑤ Client confirmation: <b>{clientEmailWillSend ? "will mark as sent" : "save as draft only"}</b>.</li>
          </ul>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Spacing: emails to known candidates will be logged immediately. For real send-via-Outlook spacing (30 min / 2 hr / today), connect Outlook in Settings.
          </div>

          {launched ? (
            <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-200 space-y-2">
              <div className="flex items-center gap-2 font-medium"><Check className="h-4 w-4" /> Search launched.</div>
              <p className="text-xs">All outputs logged to the job record. Touchpoints added for every contacted candidate.</p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`/jobs?focus=${jobId}`)}>Back to job</Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/billers-workflow")}>Open Biller's Workflow</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={launch} disabled={launching} className="gap-1">
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Launch all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{msg}</div>;
}

function Group({
  title,
  hint,
  dotClass,
  candidates,
  picked,
  onToggle,
}: {
  title: string;
  hint: string;
  dotClass: string;
  candidates: MatchCandidate[];
  picked: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">· {candidates.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      {candidates.length === 0 && <p className="text-xs text-muted-foreground italic">No matches found.</p>}
      <div className="space-y-1.5">
        {candidates.map((c) => (
          <label
            key={c.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 cursor-pointer hover:bg-muted/30 transition"
          >
            <Checkbox checked={picked.has(c.id)} onCheckedChange={() => onToggle(c.id)} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">· {c.job_title || "?"} @ {c.current_employer || "?"}</span>
                <span className="ml-auto text-[11px] rounded-full bg-primary/15 text-primary px-2 py-0.5">{c.match_score}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{c.match_reason}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function MessageCard({
  title,
  sub,
  badge,
  dotClass,
  subject,
  body,
  isSkipped,
  onChange,
  onSkipToggle,
  onRegenerate,
}: {
  title: string;
  sub: string;
  badge: string;
  dotClass: string;
  subject?: string;
  body: string;
  isSkipped: boolean;
  onChange: (field: "subject" | "body", value: string) => void;
  onSkipToggle: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition ${isSkipped ? "border-border bg-muted/20 opacity-50" : "border-border bg-card/60"}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-block w-2 h-2 rounded-full mt-2 ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-xs text-muted-foreground">· {sub}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{badge}</span>
        </div>
      </div>
      {subject !== undefined && (
        <Input value={subject} onChange={(e) => onChange("subject", e.target.value)} placeholder="Subject" />
      )}
      <textarea
        value={body}
        onChange={(e) => onChange("body", e.target.value)}
        rows={subject !== undefined ? 5 : 3}
        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onSkipToggle} className="gap-1">
          {isSkipped ? "Include" : "Skip"}
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} className="gap-1">
          <RotateCw className="h-3.5 w-3.5" /> Regenerate
        </Button>
      </div>
    </div>
  );
}
