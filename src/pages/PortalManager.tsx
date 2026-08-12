import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, FileText, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ClientPortal from "./ClientPortal";
import CandidatePortal from "./CandidatePortal";

const CLIENT_STAGES = ["Sent CV", "First Stage", "Second Stage", "Final Stage", "Offer", "Placed"];
const INTERVIEW_STAGES = ["First Stage", "Second Stage", "Final Stage"];

function makeToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast({ title: "Link copied" });
}

type Row = {
  id: string;
  stage: string;
  withdrawn: boolean | null;
  candidate_id: string;
  candidates: {
    name: string | null;
    job_title: string | null;
    client_ready_notes: string | null;
    cv_file_url: string | null;
  } | null;
};

export default function PortalManager() {
  const { jobId = "" } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState("manage");
  const [previewCandidateToken, setPreviewCandidateToken] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portal-manager", jobId] });

  const { data, isLoading } = useQuery({
    queryKey: ["portal-manager", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const [{ data: job }, { data: portal }] = await Promise.all([
        supabase.from("jobs").select("id, title, description, clients(company_name)").eq("id", jobId).maybeSingle(),
        supabase
          .from("client_portals")
          .select("id, access_token, notify_candidate_on_interview, notify_candidate_on_reject, job_spec_synced_at")
          .eq("job_id", jobId)
          .maybeSingle(),
      ]);

      const { data: rows } = await supabase
        .from("candidate_jobs")
        .select("id, stage, withdrawn, candidate_id, candidates(name, job_title, client_ready_notes, cv_file_url)")
        .eq("job_id", jobId);

      const cjIds = (rows ?? []).map((r: any) => r.id);
      const [{ data: candPortals }, { data: feedback }, { data: notes }, { data: stageContent }, { data: scheduling }] =
        await Promise.all([
          cjIds.length
            ? supabase.from("candidate_portals").select("candidate_job_id, access_token").in("candidate_job_id", cjIds)
            : Promise.resolve({ data: [] as any[] }),
          cjIds.length
            ? supabase.from("portal_feedback").select("id, candidate_job_id, comment, rating, client_email, created_at").in("candidate_job_id", cjIds)
            : Promise.resolve({ data: [] as any[] }),
          portal?.id
            ? supabase.from("portal_notes").select("id, author_email, body, created_at").eq("client_portal_id", portal.id).order("created_at", { ascending: false })
            : Promise.resolve({ data: [] as any[] }),
          supabase.from("portal_stage_content").select("stage, prep_material, interview_details").eq("job_id", jobId),
          supabase.from("portal_scheduling").select("calendly_url, slots").eq("job_id", jobId).maybeSingle(),
        ]);

      return {
        job,
        portal,
        rows: (rows ?? []) as unknown as Row[],
        candPortals: (candPortals ?? []) as { candidate_job_id: string; access_token: string }[],
        feedback: (feedback ?? []) as any[],
        notes: (notes ?? []) as any[],
        stageContent: (stageContent ?? []) as any[],
        scheduling: (scheduling ?? { calendly_url: null, slots: [] }) as { calendly_url: string | null; slots: any },
      };
    },
  });

  const clientUrl = data?.portal?.access_token
    ? `${window.location.origin}/portal/${data.portal.access_token}`
    : null;

  const tokenByCj = useMemo(() => {
    const m = new Map<string, string>();
    (data?.candPortals ?? []).forEach((c) => m.set(c.candidate_job_id, c.access_token));
    return m;
  }, [data]);

  const feedbackCount = (cjId: string) => (data?.feedback ?? []).filter((f) => f.candidate_job_id === cjId).length;

  /* ── mutations ─────────────────────────────────────── */

  const regenerateClient = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("client_portals")
        .upsert({ job_id: jobId, user_id: auth.user?.id, access_token: makeToken() }, { onConflict: "job_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "New client link created — the old one no longer works" });
    },
    onError: (e: Error) => toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }),
  });

  const pushCandidate = useMutation({
    mutationFn: async (cjId: string) => {
      const token = makeToken();
      const { error } = await supabase
        .from("candidate_portals")
        .upsert({ candidate_job_id: cjId, access_token: token }, { onConflict: "candidate_job_id" });
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      invalidate();
      copy(`${window.location.origin}/candidate/${token}`);
      toast({ title: "Candidate link created and copied" });
    },
    onError: (e: Error) => toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }),
  });

  const saveToggle = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { error } = await supabase.from("client_portals").update(patch).eq("job_id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved" });
    },
  });

  const saveStageContent = useMutation({
    mutationFn: async (payload: { stage: string; prep_material: string; interview_details: string }) => {
      const { error } = await supabase.from("portal_stage_content").upsert(
        {
          job_id: jobId,
          stage: payload.stage,
          prep_material: payload.prep_material || null,
          interview_details: payload.interview_details || null,
        },
        { onConflict: "job_id,stage" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved — candidates see this once they reach that stage" });
    },
  });

  const saveScheduling = useMutation({
    mutationFn: async (payload: { calendly_url: string; slots: string[] }) => {
      const { error } = await supabase
        .from("portal_scheduling")
        .upsert({ job_id: jobId, calendly_url: payload.calendly_url || null, slots: payload.slots }, { onConflict: "job_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Scheduling saved" });
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("portal_notes").insert({
        client_portal_id: data?.portal?.id,
        author_email: auth.user?.email ?? null,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Note added — visible to the client too" });
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading portal…</p>;
  }

  if (!data?.job) {
    return <p className="text-sm text-muted-foreground">This job no longer exists.</p>;
  }

  if (!data.portal) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">No portal yet for {data.job.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the portal to share a client review board and candidate progress links.
          </p>
          <Button className="mt-4" onClick={() => regenerateClient.mutate()} disabled={regenerateClient.isPending}>
            Create portal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {(data.job as any).clients?.company_name ?? "Portal manager"}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{data.job.title}</h1>
          </div>
          {clientUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(clientUrl)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy client link
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={clientUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open live
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="client">Preview: Client</TabsTrigger>
          <TabsTrigger value="candidate">Preview: Candidate</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ── MANAGE ───────────────────────────────── */}
        <TabsContent value="manage" className="space-y-6 pt-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Link status</h2>
              <Badge variant="secondary" className="text-[10px]">Live</Badge>
            </div>
            <code className="mt-3 block truncate rounded-md bg-muted px-2 py-1.5 text-xs">{clientUrl}</code>
            <p className="mt-2 text-xs text-muted-foreground">
              Job spec and CV links always read live from Desky — nothing to re-push.
              {data.portal.job_spec_synced_at
                ? ` Job spec last changed ${new Date(data.portal.job_spec_synced_at).toLocaleString()}.`
                : ""}
            </p>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Candidates on this portal</h2>
            <div className="mt-3 divide-y divide-border">
              {data.rows.filter((r) => CLIENT_STAGES.includes(r.stage) || r.withdrawn).length === 0 && (
                <p className="py-3 text-xs text-muted-foreground">
                  Nothing shared yet. Move a candidate to Sent CV or beyond and they appear here.
                </p>
              )}
              {data.rows
                .filter((r) => CLIENT_STAGES.includes(r.stage) || r.withdrawn)
                .map((r) => {
                  const t = tokenByCj.get(r.id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {r.candidates?.name ?? "Candidate"}
                          {r.withdrawn && <span className="ml-2 text-xs text-muted-foreground">(rejected)</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{r.stage}</span>
                          <span>·</span>
                          <span>{r.candidates?.cv_file_url ? "CV attached" : "No CV"}</span>
                          <span>·</span>
                          <span>{r.candidates?.client_ready_notes ? "Client Ready Notes set" : "No client notes"}</span>
                          <span>·</span>
                          <span>{feedbackCount(r.id)} feedback</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}/candidate/${t}`)}>
                              <Copy className="mr-1.5 h-3.5 w-3.5" /> Candidate link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPreviewCandidateToken(t);
                                setTab("candidate");
                              }}
                            >
                              Preview
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => pushCandidate.mutate(r.id)} disabled={pushCandidate.isPending}>
                            Push to portal
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          <StageContentEditor
            stageContent={data.stageContent}
            onSave={(payload) => saveStageContent.mutate(payload)}
            saving={saveStageContent.isPending}
          />

          <SchedulingEditor
            scheduling={data.scheduling}
            onSave={(payload) => saveScheduling.mutate(payload)}
            saving={saveScheduling.isPending}
          />

          <NotesEditor notes={data.notes} onAdd={(b) => addNote.mutate(b)} saving={addNote.isPending} />
        </TabsContent>

        {/* ── CLIENT PREVIEW ───────────────────────── */}
        <TabsContent value="client" className="pt-4">
          <PreviewFrame label="Client preview — anything you do here is real">
            <ClientPortal tokenOverride={data.portal.access_token} previewEmail="preview@desky.internal" />
          </PreviewFrame>
        </TabsContent>

        {/* ── CANDIDATE PREVIEW ────────────────────── */}
        <TabsContent value="candidate" className="pt-4">
          {previewCandidateToken ? (
            <PreviewFrame label="Candidate preview — exactly what the candidate sees">
              <CandidatePortal tokenOverride={previewCandidateToken} />
            </PreviewFrame>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick a candidate in the Manage tab and hit Preview to see their view.
            </p>
          )}
        </TabsContent>

        {/* ── SETTINGS ─────────────────────────────── */}
        <TabsContent value="settings" className="space-y-6 pt-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Candidate emails (agency only)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Off by default. The client can see whether these are on, but never who receives them.
            </p>
            <div className="mt-4 space-y-4">
              <ToggleRow
                label="Send interview invitations to candidates"
                checked={!!data.portal.notify_candidate_on_interview}
                onChange={(v) => saveToggle.mutate({ notify_candidate_on_interview: v })}
              />
              <ToggleRow
                label="Send rejection emails to candidates"
                checked={!!data.portal.notify_candidate_on_reject}
                onChange={(v) => saveToggle.mutate({ notify_candidate_on_reject: v })}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Sync</h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Job spec and CV files are read live, so edits in Desky appear immediately in both portals.
            </p>
          </section>

          <section className="rounded-lg border border-destructive/40 bg-card p-4">
            <h2 className="text-sm font-medium">Regenerate client link</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Instantly kills the old link. Anyone using it will lose access.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => regenerateClient.mutate()}
              disabled={regenerateClient.isPending}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate
            </Button>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────── */

function BackLink() {
  return (
    <Link to="/jobs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to jobs
    </Link>
  );
}

function PreviewFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="max-h-[70vh] overflow-auto">{children}</div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StageContentEditor({
  stageContent,
  onSave,
  saving,
}: {
  stageContent: any[];
  onSave: (p: { stage: string; prep_material: string; interview_details: string }) => void;
  saving: boolean;
}) {
  const [stage, setStage] = useState(INTERVIEW_STAGES[0]);
  const existing = stageContent.find((c) => c.stage === stage);
  const [details, setDetails] = useState(existing?.interview_details ?? "");
  const [prep, setPrep] = useState(existing?.prep_material ?? "");
  const [loadedFor, setLoadedFor] = useState(stage);

  if (loadedFor !== stage) {
    setLoadedFor(stage);
    setDetails(existing?.interview_details ?? "");
    setPrep(existing?.prep_material ?? "");
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Interview details & prep per stage</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Candidates only see a stage once they reach it. Clients see all of it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {INTERVIEW_STAGES.map((s) => (
          <Button key={s} size="sm" variant={s === stage ? "default" : "outline"} onClick={() => setStage(s)}>
            {s}
          </Button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <Textarea rows={3} placeholder="Interview details — who, when, format, where" value={details} onChange={(e) => setDetails(e.target.value)} />
        <Textarea rows={3} placeholder="How to prepare" value={prep} onChange={(e) => setPrep(e.target.value)} />
        <Button size="sm" onClick={() => onSave({ stage, prep_material: prep, interview_details: details })} disabled={saving}>
          Save {stage}
        </Button>
      </div>
    </section>
  );
}

function SchedulingEditor({
  scheduling,
  onSave,
  saving,
}: {
  scheduling: { calendly_url: string | null; slots: any };
  onSave: (p: { calendly_url: string; slots: string[] }) => void;
  saving: boolean;
}) {
  const [url, setUrl] = useState(scheduling.calendly_url ?? "");
  const [slots, setSlots] = useState(Array.isArray(scheduling.slots) ? scheduling.slots.join("\n") : "");

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Scheduling</h2>
      <div className="mt-3 space-y-3">
        <Input placeholder="Booking link (Calendly, etc.)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Textarea
          rows={3}
          placeholder={"One slot per line\nTue 12 Mar, 10:00"}
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
        <Button
          size="sm"
          onClick={() =>
            onSave({
              calendly_url: url.trim(),
              slots: slots.split("\n").map((s) => s.trim()).filter(Boolean),
            })
          }
          disabled={saving}
        >
          Save scheduling
        </Button>
      </div>
    </section>
  );
}

function NotesEditor({ notes, onAdd, saving }: { notes: any[]; onAdd: (b: string) => void; saving: boolean }) {
  const [body, setBody] = useState("");

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Portal notes thread</h2>
      <p className="mt-1 text-xs text-muted-foreground">Shared with the client. Keep internal notes on the candidate record.</p>
      <div className="mt-3 space-y-2">
        <Textarea rows={3} placeholder="Add a note for the client…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button
          size="sm"
          disabled={saving || !body.trim()}
          onClick={() => {
            onAdd(body.trim());
            setBody("");
          }}
        >
          Post note
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="rounded-md bg-muted p-3">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[n.author_email, new Date(n.created_at).toLocaleString()].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
