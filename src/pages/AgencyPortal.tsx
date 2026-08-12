import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Copy, ExternalLink, Download, ArrowLeft } from "lucide-react";
import { PORTAL_STAGE_NAMES } from "@/lib/portal-stages";

type PortalJob = {
  id: string;
  title: string;
  client_name: string | null;
  status: string;
  job_description_file: string | null;
  notify_candidate_on_interview: boolean;
  notify_candidate_on_reject: boolean;
};
type PortalCandidate = {
  id: string;
  name: string;
  email: string | null;
  cv_file: string | null;
  stage: string;
  rejected: boolean;
  created_at: string;
};

export default function AgencyPortal() {
  const { jobId } = useParams<{ jobId: string }>();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [job, setJob] = useState<PortalJob | null>(null);
  const [candidates, setCandidates] = useState<PortalCandidate[]>([]);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [candTokens, setCandTokens] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [stageContent, setStageContent] = useState<any[]>([]);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [dupFrom, setDupFrom] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");

  const load = async () => {
    if (!jobId) return;
    const { data: j, error } = await supabase.from("portal_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error || !j) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setJob(j as PortalJob);

    const [{ data: cands }, { data: cp }, { data: sc }, { data: nts }] = await Promise.all([
      supabase.from("portal_candidates").select("*").eq("job_id", jobId).order("created_at"),
      supabase.from("portal_client_portals").select("access_token").eq("job_id", jobId).maybeSingle(),
      supabase.from("portal_job_stage_content").select("*").eq("job_id", jobId),
      supabase.from("portal_job_notes").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
    ]);
    setCandidates((cands ?? []) as PortalCandidate[]);
    setClientToken(cp?.access_token ?? null);
    setStageContent(sc ?? []);
    setNotes(nts ?? []);

    const ids = (cands ?? []).map((c: any) => c.id);
    if (ids.length) {
      const [{ data: tokens }, { data: fb }, { data: hist }, { data: bk }] = await Promise.all([
        supabase.from("portal_candidate_portals").select("candidate_id,access_token").in("candidate_id", ids),
        supabase.from("portal_feedback").select("*").in("candidate_id", ids).order("created_at", { ascending: false }),
        supabase.from("portal_stage_history").select("*").in("candidate_id", ids).order("created_at", { ascending: false }),
        supabase.from("portal_interview_bookings").select("*").in("candidate_id", ids).order("created_at", { ascending: false }),
      ]);
      setCandTokens(Object.fromEntries((tokens ?? []).map((t: any) => [t.candidate_id, t.access_token])));
      setFeedback(fb ?? []);
      setHistory(hist ?? []);
      setBookings(bk ?? []);
    } else {
      setCandTokens({});
      setFeedback([]);
      setHistory([]);
      setBookings([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const nameById = useMemo(
    () => Object.fromEntries(candidates.map((c) => [c.id, c.name])),
    [candidates],
  );

  const uploadFile = async (file: File, prefix: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const path = `${auth.user?.id}/${prefix}-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("portal-files").upload(path, file);
    if (error) throw error;
    return path;
  };

  const addCandidate = async () => {
    if (!newName.trim() || !jobId) return;
    setSaving(true);
    try {
      let cvPath: string | null = null;
      if (cvFile) cvPath = await uploadFile(cvFile, "cv");
      const { data: created, error } = await supabase
        .from("portal_candidates")
        .insert({ job_id: jobId, name: newName.trim(), email: newEmail.trim() || null, cv_file: cvPath })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("portal_candidate_portals").insert({ candidate_id: created.id });
      await supabase.from("portal_stage_history").insert({
        candidate_id: created.id,
        from_stage: null,
        to_stage: PORTAL_STAGE_NAMES[0],
        changed_by: "agency",
      });

      // Duplicate job pack / prep / interview details from another candidate
      if (dupFrom !== "none") {
        const { data: src } = await supabase
          .from("portal_candidate_stage_overrides")
          .select("stage,prep_content,interview_details")
          .eq("candidate_id", dupFrom);
        if (src?.length) {
          await supabase
            .from("portal_candidate_stage_overrides")
            .insert(src.map((s) => ({ ...s, candidate_id: created.id })));
        }
      }

      setNewName("");
      setNewEmail("");
      setCvFile(null);
      setDupFrom("none");
      toast.success("Candidate added — portal link generated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not add candidate");
    } finally {
      setSaving(false);
    }
  };

  const moveCandidate = async (c: PortalCandidate, to: string) => {
    await supabase.from("portal_candidates").update({ stage: to, rejected: false }).eq("id", c.id);
    await supabase
      .from("portal_stage_history")
      .insert({ candidate_id: c.id, from_stage: c.stage, to_stage: to, changed_by: "agency" });
    load();
  };

  const toggleReject = async (c: PortalCandidate) => {
    await supabase.from("portal_candidates").update({ rejected: !c.rejected }).eq("id", c.id);
    await supabase.from("portal_stage_history").insert({
      candidate_id: c.id,
      from_stage: c.stage,
      to_stage: c.rejected ? c.stage : "Rejected",
      changed_by: "agency",
    });
    load();
  };

  const setNotify = async (field: "notify_candidate_on_interview" | "notify_candidate_on_reject", value: boolean) => {
    if (!job) return;
    const patch =
      field === "notify_candidate_on_interview"
        ? { notify_candidate_on_interview: value }
        : { notify_candidate_on_reject: value };
    await supabase.from("portal_jobs").update(patch).eq("id", job.id);
    setJob({ ...job, [field]: value });
  };

  const uploadJd = async (file: File) => {
    if (!job) return;
    try {
      const path = await uploadFile(file, "jd");
      await supabase.from("portal_jobs").update({ job_description_file: path }).eq("id", job.id);
      setJob({ ...job, job_description_file: path });
      toast.success("Job description uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    }
  };

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("portal-files").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const saveStageContent = async (stage: string, prep: string, details: string) => {
    if (!jobId) return;
    await supabase
      .from("portal_job_stage_content")
      .upsert({ job_id: jobId, stage, prep_content: prep, interview_details: details }, { onConflict: "job_id,stage" });
    toast.success(`${stage} content saved`);
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied");
  };

  const exportCsv = () => {
    const rows = feedback
      .filter((f) => stageFilter === "all" || f.stage === stageFilter)
      .map((f) => [
        nameById[f.candidate_id] ?? f.candidate_id,
        f.stage,
        f.rating ?? "",
        (f.comment ?? "").replace(/"/g, '""'),
        f.client_email ?? "",
        new Date(f.created_at).toISOString(),
      ]);
    const csv = [
      ["Candidate", "Stage", "Rating", "Comment", "Client email", "Timestamp"],
      ...rows,
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `portal-feedback-${job?.title ?? "job"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activityFeed = useMemo(() => {
    const items = [
      ...history.map((h) => ({
        at: h.created_at,
        text: `${nameById[h.candidate_id] ?? "Candidate"} moved ${h.from_stage ? `${h.from_stage} → ` : "→ "}${h.to_stage}`,
        who: h.changed_by,
        kind: "Stage change",
      })),
      ...feedback.map((f) => ({
        at: f.created_at,
        text: `Feedback on ${nameById[f.candidate_id] ?? "candidate"} at ${f.stage}`,
        who: f.client_email ?? "client",
        kind: "Feedback",
      })),
      ...bookings.map((b) => ({
        at: b.created_at,
        text: `${nameById[b.candidate_id] ?? "Candidate"} requested ${b.slot_or_booking_ref}`,
        who: "candidate",
        kind: "Interview booking",
      })),
    ];
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [history, feedback, bookings, nameById]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  if (denied || !job)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">Portal not available</h1>
        <p className="text-sm text-muted-foreground">
          This portal doesn't exist, or it belongs to another user.
        </p>
        <Button asChild variant="outline">
          <Link to="/jobs">Back to jobs</Link>
        </Button>
      </div>
    );

  const clientUrl = clientToken ? `${window.location.origin}/portal/${clientToken}` : null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/jobs" className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-1">
              <ArrowLeft className="h-3 w-3" /> Desky
            </Link>
            <h1 className="text-xl font-semibold">{job.title}</h1>
            <p className="text-sm text-muted-foreground">
              {job.client_name || "No client name"} · Agency Dashboard
            </p>
          </div>
          {clientUrl && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(clientUrl)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Client link
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(clientUrl, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open client portal
              </Button>
            </div>
          )}
        </div>

        <Tabs defaultValue="candidates">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="content">Stage content</TabsTrigger>
            <TabsTrigger value="reporting">Reporting</TabsTrigger>
            <TabsTrigger value="log">Notification log</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* ── Candidates ───────────────────────────────── */}
          <TabsContent value="candidates" className="mt-4 space-y-6">
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-medium">Add candidate</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} />
                <Select value={dupFrom} onValueChange={setDupFrom}>
                  <SelectTrigger>
                    <SelectValue placeholder="Duplicate prep from…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No duplication</SelectItem>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Duplicate from {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addCandidate} disabled={saving || !newName.trim()} size="sm">
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Add candidate
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>CV</TableHead>
                    <TableHead>Candidate portal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No candidates yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {candidates.map((c) => {
                    const token = candTokens[c.id];
                    const url = token ? `${window.location.origin}/candidate-portal/${token}` : null;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.email || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <Select value={c.stage} onValueChange={(v) => moveCandidate(c, v)}>
                            <SelectTrigger className="w-[180px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PORTAL_STAGE_NAMES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {c.cv_file ? (
                            <Button size="sm" variant="ghost" onClick={() => openFile(c.cv_file!)}>
                              View CV
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {url ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => copy(url)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => window.open(url, "_blank")}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={c.rejected ? "destructive" : "outline"}
                            onClick={() => toggleReject(c)}
                          >
                            {c.rejected ? "Rejected" : "Active"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-medium">General notes from client</h2>
              {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="text-sm border-b border-border pb-2">
                  <div className="text-xs text-muted-foreground">
                    {n.author} · {new Date(n.created_at).toLocaleString()}
                  </div>
                  {n.note_text}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Stage content ────────────────────────────── */}
          <TabsContent value="content" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Job-level interview details and prep per stage. Candidates only see a stage once they reach it.
            </p>
            {PORTAL_STAGE_NAMES.map((stage) => {
              const existing = stageContent.find((s) => s.stage === stage);
              return (
                <StageContentEditor
                  key={stage}
                  stage={stage}
                  prep={existing?.prep_content ?? ""}
                  details={existing?.interview_details ?? ""}
                  onSave={saveStageContent}
                />
              );
            })}
          </TabsContent>

          {/* ── Reporting ────────────────────────────────── */}
          <TabsContent value="reporting" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {PORTAL_STAGE_NAMES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
            {PORTAL_STAGE_NAMES.filter((s) => stageFilter === "all" || s === stageFilter).map((stage) => {
              const items = feedback.filter((f) => f.stage === stage);
              if (!items.length) return null;
              return (
                <div key={stage} className="border border-border rounded-lg p-4 space-y-2">
                  <h3 className="text-sm font-medium">
                    {stage} <Badge variant="secondary">{items.length}</Badge>
                  </h3>
                  {items.map((f) => (
                    <div key={f.id} className="text-sm border-b border-border pb-2">
                      <div className="text-xs text-muted-foreground">
                        {nameById[f.candidate_id]} · {f.client_email ?? "client"} ·{" "}
                        {new Date(f.created_at).toLocaleString()} {f.rating ? `· ${f.rating}/5` : ""}
                      </div>
                      {f.comment}
                    </div>
                  ))}
                </div>
              );
            })}
            {feedback.length === 0 && <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>}
          </TabsContent>

          {/* ── Notification log ─────────────────────────── */}
          <TabsContent value="log" className="mt-4">
            <div className="border border-border rounded-lg divide-y divide-border">
              {activityFeed.length === 0 && (
                <p className="text-sm text-muted-foreground p-4">No activity yet.</p>
              )}
              {activityFeed.map((a, i) => (
                <div key={i} className="p-3 text-sm flex flex-wrap gap-2 items-center">
                  <Badge variant="outline">{a.kind}</Badge>
                  <span>{a.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.who} · {new Date(a.at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Settings ─────────────────────────────────── */}
          <TabsContent value="settings" className="mt-4 space-y-6">
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-medium">Job description</h2>
              {job.job_description_file ? (
                <Button size="sm" variant="outline" onClick={() => openFile(job.job_description_file!)}>
                  View current file
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No job description uploaded.</p>
              )}
              <Input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && uploadJd(e.target.files[0])}
              />
            </div>

            <div className="border border-border rounded-lg p-4 space-y-4">
              <h2 className="text-sm font-medium">Candidate notifications</h2>
              <p className="text-xs text-muted-foreground">
                Off by default. Only the agency can change these — the client sees them read-only.
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notify candidate when moved to interview</Label>
                <Switch
                  checked={job.notify_candidate_on_interview}
                  onCheckedChange={(v) => setNotify("notify_candidate_on_interview", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notify candidate on rejection</Label>
                <Switch
                  checked={job.notify_candidate_on_reject}
                  onCheckedChange={(v) => setNotify("notify_candidate_on_reject", v)}
                />
              </div>
            </div>

            <PortalAccountSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StageContentEditor({
  stage,
  prep,
  details,
  onSave,
}: {
  stage: string;
  prep: string;
  details: string;
  onSave: (stage: string, prep: string, details: string) => void;
}) {
  const [p, setP] = useState(prep);
  const [d, setD] = useState(details);
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">{stage}</h3>
      <div className="space-y-1">
        <Label className="text-xs">Interview details</Label>
        <Textarea value={d} onChange={(e) => setD(e.target.value)} rows={3} placeholder="Who, when, format, location / link" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Interview prep</Label>
        <Textarea value={p} onChange={(e) => setP(e.target.value)} rows={4} placeholder="How to prepare, what to expect" />
      </div>
      <Button size="sm" variant="outline" onClick={() => onSave(stage, p, d)}>
        Save {stage}
      </Button>
    </div>
  );
}

function PortalAccountSettings() {
  const [notificationEmail, setNotificationEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [keys, setKeys] = useState<any[]>([]);
  const [keyName, setKeyName] = useState("");
  const [scope, setScope] = useState("read");

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const [{ data: s }, { data: k }] = await Promise.all([
      supabase.from("portal_settings").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("portal_api_keys").select("*").order("created_at", { ascending: false }),
    ]);
    setNotificationEmail(s?.notification_email ?? auth.user.email ?? "");
    setWebhookUrl(s?.webhook_url ?? "");
    setKeys(k ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase
      .from("portal_settings")
      .upsert({ user_id: auth.user.id, notification_email: notificationEmail, webhook_url: webhookUrl || null });
    toast.success("Settings saved");
  };

  const createKey = async () => {
    if (!keyName.trim()) return;
    const { error } = await supabase.from("portal_api_keys").insert({ name: keyName.trim(), scope });
    if (error) return toast.error(error.message);
    setKeyName("");
    toast.success("API key created");
    load();
  };

  const revoke = async (id: string) => {
    await supabase.from("portal_api_keys").update({ revoked: true }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">Notifications & webhook</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Notification email</Label>
            <Input value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Outbound webhook URL</Label>
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://example.com/hooks/portal"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Webhook delivery is scheduled for a later phase — the URL is stored now.</p>
        <Button size="sm" variant="outline" onClick={save}>
          Save settings
        </Button>
      </div>

      <div className="border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">API keys</h2>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-[220px]" placeholder="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="read_write">Read & write</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={createKey}>
            Generate key
          </Button>
        </div>
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-border pb-2">
            <span className="font-medium">{k.name}</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{k.api_key}</code>
            <Badge variant="secondary">{k.scope}</Badge>
            {k.revoked ? (
              <Badge variant="destructive">Revoked</Badge>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
        {keys.length === 0 && <p className="text-xs text-muted-foreground">No API keys yet.</p>}
      </div>
    </div>
  );
}
