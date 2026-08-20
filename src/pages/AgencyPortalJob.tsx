import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, FileText, Link2, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { AgencyFeedbackThread } from "@/components/portal/AgencyFeedbackThread";
import {
  CandidateEmailBulkBar,
  CandidateEmailPreview,
} from "@/components/portal/AgencyEmailPanels";
import { PortalAppShell } from "@/components/portal/PortalAppShell";
import { supabase } from "@/integrations/supabase/client";
import { notifyCandidateCreated, setRejectionEmailMode } from "@/lib/agency.functions";

function copy(url: string) {
  navigator.clipboard.writeText(url);
  toast.success("Link copied");
}

export default function AgencyPortalJob() {
  const { jobId = "" } = useParams();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newHeadline, setNewHeadline] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [panel, setPanel] = useState<{ id: string; tab: "pack" | "feedback" | "emails" } | null>(
    null,
  );

  useEffect(() => {
    document.title = "Job pipeline — Agency Portal";
  }, []);

  const job = useQuery({
    queryKey: ["portal-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_jobs")
        .select("*, portal_client_portals(access_token, id)")
        .eq("id", jobId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const agencyDefaults = useQuery({
    queryKey: ["portal-agency-notify-defaults"],
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_agency_settings")
        .select("notify_candidate_interview, notify_candidate_rejection")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const candidates = useQuery({
    queryKey: ["portal-candidates", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_candidates")
        .select(
          "*, portal_candidate_portals(id, access_token, job_pack, prep_material, interview_details)",
        )
        .eq("job_id", jobId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const addCandidate = useMutation({
    mutationFn: async () => {
      let cvPath: string | null = null;
      if (cvFile) {
        cvPath = `${jobId}/${crypto.randomUUID()}-${cvFile.name}`;
        const { error } = await supabase.storage.from("cvs").upload(cvPath, cvFile);
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from("portal_candidates")
        .insert({
          job_id: jobId,
          name: newName,
          email: newEmail || null,
          headline: newHeadline || null,
          client_notes: newClientNotes || null,
          cv_path: cvPath,
        })
        .select("id")
        .single();
      if (error) throw error;

      const source = copyFrom
        ? (() => {
            const r = candidates.data?.find((c) => c.id === copyFrom)
              ?.portal_candidate_portals as any;
            return Array.isArray(r) ? r[0] : r;
          })()
        : null;
      const { error: pErr } = await supabase.from("portal_candidate_portals").insert({
        candidate_id: data.id,
        job_pack: source?.job_pack ?? job.data?.job_spec ?? null,
        prep_material: source?.prep_material ?? null,
        interview_details: source?.interview_details ?? null,
      });
      if (pErr) throw pErr;
      await notifyCandidateCreated({ data: { candidateId: data.id } }).catch(() => undefined);
    },
    onSuccess: () => {
      toast.success("Candidate added");
      setNewName("");
      setNewEmail("");
      setNewHeadline("");
      setNewClientNotes("");
      setCvFile(null);
      qc.invalidateQueries({ queryKey: ["portal-candidates", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadSpec = useMutation({
    mutationFn: async (file: File) => {
      const path = `${jobId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("job-specs").upload(path, file);
      if (error) throw error;
      const { error: jErr } = await supabase
        .from("portal_jobs")
        .update({ job_spec_path: path, job_spec_filename: file.name })
        .eq("id", jobId);
      if (jErr) throw jErr;
    },
    onSuccess: () => {
      toast.success("Job description attached");
      qc.invalidateQueries({ queryKey: ["portal-job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openSpec = async (path: string) => {
    const { data } = await supabase.storage.from("job-specs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const saveJob = useMutation({
    mutationFn: async (patch: {
      company_info?: string;
      job_spec?: string;
      stages?: string[];
      notify_candidate_interview?: boolean | null;
      notify_candidate_rejection?: boolean | null;
    }) => {
      const { error } = await supabase.from("portal_jobs").update(patch).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["portal-job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePack = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { job_pack?: string; prep_material?: string; interview_details?: string };
    }) => {
      const { error } = await supabase
        .from("portal_candidate_portals")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Portal updated");
      qc.invalidateQueries({ queryKey: ["portal-candidates", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectionMode = useMutation({
    mutationFn: (mode: "template" | "ai") => setRejectionEmailMode({ data: { jobId, mode } }),
    onSuccess: () => {
      toast.success("Rejection wording updated");
      qc.invalidateQueries({ queryKey: ["portal-job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ensureClientPortal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("portal_client_portals").insert({ job_id: jobId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-job", jobId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const cpRel = job.data?.portal_client_portals as any;
  const clientToken = (Array.isArray(cpRel) ? cpRel[0] : cpRel)?.access_token;

  if (!job.data) {
    return (
      <PortalAppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PortalAppShell>
    );
  }

  return (
    <PortalAppShell>
      <Link
        to="/agency-portal"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All jobs
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            {job.data.client_name}
          </p>
          <h1 className="text-3xl font-semibold">{job.data.title}</h1>
        </div>
      </div>

      {/* Client portal link */}
      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Client portal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One link for this job. Anyone with it can review candidates and move the board.
        </p>
        {clientToken ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 text-sm">
              {origin}/portal/{clientToken}
            </code>
            <button
              onClick={() => copy(`${origin}/portal/${clientToken}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Copy className="size-4" /> Copy
            </button>
          </div>
        ) : (
          <button
            onClick={() => ensureClientPortal.mutate()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Link2 className="size-4" /> Generate client portal link
          </button>
        )}
      </section>

      {/* Job spec + stages */}
      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Job spec &amp; pipeline</h2>
        <div className="mt-4 grid gap-4">
          <div>
            <label className="text-sm font-medium">Company info</label>
            <textarea
              defaultValue={job.data.company_info ?? ""}
              rows={3}
              onBlur={(e) => saveJob.mutate({ company_info: e.target.value })}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Job spec</label>
            <textarea
              defaultValue={job.data.job_spec ?? ""}
              rows={6}
              onBlur={(e) => saveJob.mutate({ job_spec: e.target.value })}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Job description attachment</label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input bg-card px-3 py-2 text-sm text-muted-foreground">
                <Upload className="size-4" />
                {uploadSpec.isPending ? "Uploading…" : "Upload PDF or DOCX"}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadSpec.mutate(f);
                  }}
                />
              </label>
              {job.data.job_spec_path && (
                <button
                  type="button"
                  onClick={() => openSpec(job.data.job_spec_path!)}
                  className="inline-flex items-center gap-2 text-sm text-accent underline-offset-4 hover:underline"
                >
                  <FileText className="size-4" />
                  {job.data.job_spec_filename ?? "Current attachment"}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Downloadable from both the client and candidate portals.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Pipeline stages (comma separated)</label>
            <input
              defaultValue={job.data.stages.join(", ")}
              onBlur={(e) =>
                saveJob.mutate({
                  stages: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Rejected is always available as a side-state.
            </p>
          </div>
        </div>
      </section>

      {/* Candidate email notifications */}
      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Candidate emails for this job</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Off by default. Only your team can change these — clients see the status read-only.
        </p>
        <div className="mt-5 space-y-4">
          <NotifyRow
            label="Email the candidate when they reach an Interview stage"
            hint="Includes the booking link or slots, plus newly unlocked details and prep."
            value={job.data.notify_candidate_interview}
            fallback={agencyDefaults.data?.notify_candidate_interview ?? false}
            onChange={(v) => saveJob.mutate({ notify_candidate_interview: v })}
          />
          <NotifyRow
            label="Email the candidate when they're rejected"
            hint="A short, kind note. Client feedback is never included."
            value={job.data.notify_candidate_rejection}
            fallback={agencyDefaults.data?.notify_candidate_rejection ?? false}
            onChange={(v) => saveJob.mutate({ notify_candidate_rejection: v })}
          />

          <div className="rounded-lg bg-surface p-4">
            <p className="text-sm font-medium">Rejection email wording</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Template is identical every time. AI writes a short, kind note tailored to the role
              and how far they got — never quoting client feedback.
            </p>
            <div className="mt-3 flex gap-2">
              {(
                [
                  ["template", "Template"],
                  ["ai", "AI worded"],
                ] as const
              ).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => rejectionMode.mutate(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    (job.data?.rejection_email_mode ?? "template") === key
                      ? "bg-primary text-primary-foreground"
                      : "border border-input hover:bg-secondary"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Candidates */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Candidates</h2>

        <form
          className="panel mt-4 grid gap-4 p-6 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCandidate.mutate();
          }}
        >
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email (optional)</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Headline</label>
            <input
              value={newHeadline}
              onChange={(e) => setNewHeadline(e.target.value)}
              placeholder="8 yrs Node/Go, ex-Monzo"
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">CV</label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input bg-card px-3 py-2 text-sm text-muted-foreground">
              <Upload className="size-4" />
              {cvFile ? cvFile.name : "Upload PDF or DOCX"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Client-ready notes</label>
            <textarea
              value={newClientNotes}
              onChange={(e) => setNewClientNotes(e.target.value)}
              rows={3}
              placeholder="Summary the client can read: strengths, salary expectations, notice period…"
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown on the client portal card. Never visible to the candidate.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Duplicate job pack from</label>
            <select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="">Start from the job spec</option>
              {candidates.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  Copy pack, prep and details from {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              disabled={addCandidate.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="size-4" /> Add candidate
            </button>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {candidates.data?.map((c) => {
            const rel = c.portal_candidate_portals as any;
            const portal = Array.isArray(rel) ? rel[0] : rel;
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.headline ?? "—"} ·{" "}
                      <span className={c.rejected ? "text-destructive" : "text-accent"}>
                        {c.rejected ? "Rejected" : c.current_stage}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {portal && (
                      <button
                        onClick={() => copy(`${origin}/candidate/${portal.access_token}`)}
                        className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-secondary"
                      >
                        <Copy className="size-4" /> Candidate link
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      {isOpen ? "Close" : "Job pack"}
                    </button>
                  </div>
                </div>

                {isOpen && portal && (
                  <div className="mt-5 grid gap-4 border-t border-border pt-5">
                    <div>
                      <label className="text-sm font-medium">Job pack</label>
                      <textarea
                        defaultValue={portal.job_pack ?? ""}
                        rows={5}
                        onBlur={(e) =>
                          savePack.mutate({ id: portal.id, patch: { job_pack: e.target.value } })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Prep material</label>
                      <textarea
                        defaultValue={portal.prep_material ?? ""}
                        rows={5}
                        placeholder="Interview format, sample questions, tips, links…"
                        onBlur={(e) =>
                          savePack.mutate({
                            id: portal.id,
                            patch: { prep_material: e.target.value },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Interview stage details</label>
                      <textarea
                        defaultValue={portal.interview_details ?? ""}
                        rows={3}
                        onBlur={(e) =>
                          savePack.mutate({
                            id: portal.id,
                            patch: { interview_details: e.target.value },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Changes save when you click outside a field.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </PortalAppShell>
  );
}

function NotifyRow({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean | null;
  fallback: boolean;
  onChange: (v: boolean | null) => void;
}) {
  const current = value === null ? "inherit" : value ? "on" : "off";
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 flex gap-2">
        {(
          [
            ["inherit", `Use agency default (${fallback ? "on" : "off"})`],
            ["on", "On"],
            ["off", "Off"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key === "inherit" ? null : key === "on")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              current === key
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-secondary"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
