import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, FileText, MoreHorizontal, Star } from "lucide-react";

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  cv_url: string | null;
  stage: string;
  rejected: boolean;
};

const call = async (payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("portal-public", { body: payload });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
};

export default function PortalClient() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [emailInput, setEmailInput] = useState("");
  const [active, setActive] = useState<Candidate | null>(null);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<string>("none");
  const [feedbackStage, setFeedbackStage] = useState<string>("");
  const [noteText, setNoteText] = useState("");

  const load = async () => {
    try {
      const data = await call({ action: "client_get", token });
      setState(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Could not load this portal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveEmail = async () => {
    if (!emailInput.includes("@")) return toast.error("Enter a valid email");
    await call({ action: "client_set_email", token, email: emailInput });
    load();
  };

  const move = async (candidate: Candidate, toStage: string | null, reject = false) => {
    try {
      await call({ action: "client_move", token, candidate_id: candidate.id, to_stage: toStage, reject });
      toast.success(reject ? `${candidate.name} rejected` : `${candidate.name} moved to ${toStage}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const submitFeedback = async () => {
    if (!active || !comment.trim()) return;
    try {
      await call({
        action: "client_feedback",
        token,
        candidate_id: active.id,
        stage: feedbackStage || active.stage,
        comment,
        rating: rating === "none" ? undefined : Number(rating),
      });
      setComment("");
      setRating("none");
      toast.success("Feedback saved");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await call({ action: "client_note", token, note_text: noteText });
    setNoteText("");
    toast.success("Note added");
    load();
  };

  const candidateFeedback = useMemo(
    () => (active ? (state?.feedback ?? []).filter((f: any) => f.candidate_id === active.id) : []),
    [active, state],
  );

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );

  if (error || !state)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Link not valid</h1>
        <p className="text-sm text-slate-500">{error ?? "Please ask your recruiter for a new link."}</p>
      </div>
    );

  // Attribution gate (not access control)
  if (!state.portal.client_email)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{state.job.title}</h1>
            <p className="text-sm text-slate-500">{state.job.client_name}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Your email</Label>
            <Input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@company.com" />
            <p className="text-xs text-slate-400">Used to label your feedback — no password needed.</p>
          </div>
          <Button className="w-full" onClick={saveEmail}>
            Enter shortlist
          </Button>
        </div>
      </div>
    );

  const stages: string[] = state.stages;
  const candidates: Candidate[] = state.candidates;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3 md:px-6 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold leading-tight">{state.job.title}</h1>
            <p className="text-xs text-slate-500">{state.job.client_name} · {state.portal.client_email}</p>
          </div>
          {state.job.job_description_url && (
            <Button size="sm" variant="outline" onClick={() => window.open(state.job.job_description_url, "_blank")}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Job description
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        <Tabs defaultValue="board">
          <TabsList className="bg-white border border-slate-200">
            <TabsTrigger value="board">Shortlist</TabsTrigger>
            <TabsTrigger value="notes">Notes for agency</TabsTrigger>
            <TabsTrigger value="prep">Interview prep</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling & settings</TabsTrigger>
          </TabsList>

          {/* Kanban */}
          <TabsContent value="board" className="mt-4">
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((stage) => {
                const items = candidates.filter((c) => c.stage === stage && !c.rejected);
                return (
                  <div key={stage} className="w-[260px] shrink-0">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stage}</span>
                      <span className="text-xs text-slate-400">{items.length}</span>
                    </div>
                    <div className="space-y-2 min-h-[80px]">
                      {items.map((c) => (
                        <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <button className="text-left" onClick={() => { setActive(c); setFeedbackStage(c.stage); }}>
                              <div className="text-sm font-medium">{c.name}</div>
                              <div className="text-xs text-slate-500">
                                {(state.feedback ?? []).filter((f: any) => f.candidate_id === c.id).length} feedback
                              </div>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {stages
                                  .filter((s) => s !== c.stage)
                                  .map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => move(c, s)}>
                                      Move to {s}
                                    </DropdownMenuItem>
                                  ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600" onClick={() => move(c, null, true)}>
                                  Reject
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {c.cv_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-1 h-7 px-1 text-xs"
                              onClick={() => window.open(c.cv_url!, "_blank")}
                            >
                              View CV
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="w-[260px] shrink-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">Rejected</div>
                <div className="space-y-2">
                  {candidates
                    .filter((c) => c.rejected)
                    .map((c) => (
                      <div key={c.id} className="bg-white/70 rounded-lg border border-dashed border-slate-300 p-3">
                        <div className="text-sm text-slate-500 line-through">{c.name}</div>
                        <Button size="sm" variant="ghost" className="h-7 px-1 text-xs" onClick={() => move(c, c.stage)}>
                          Restore
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <Label className="text-xs text-slate-600">Add an update for the agency</Label>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} />
              <Button size="sm" onClick={addNote}>Add note</Button>
            </div>
            <div className="space-y-2">
              {(state.notes ?? []).map((n: any) => (
                <div key={n.id} className="bg-white rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="text-xs text-slate-400 mb-1">
                    {n.author} · {new Date(n.created_at).toLocaleString()}
                  </div>
                  {n.note_text}
                </div>
              ))}
              {(state.notes ?? []).length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
            </div>
          </TabsContent>

          {/* Interview prep & details per stage */}
          <TabsContent value="prep" className="mt-4 space-y-3">
            <p className="text-sm text-slate-500">
              Shared with the candidate once they reach that stage.
            </p>
            {stages.map((stage) => {
              const existing = (state.stage_content ?? []).find((s: any) => s.stage === stage);
              return (
                <ClientStageEditor
                  key={stage}
                  stage={stage}
                  prep={existing?.prep_content ?? ""}
                  details={existing?.interview_details ?? ""}
                  onSave={async (prep, details) => {
                    await call({ action: "client_save_stage_content", token, stage, prep_content: prep, interview_details: details });
                    toast.success(`${stage} saved`);
                    load();
                  }}
                />
              );
            })}
          </TabsContent>

          {/* Scheduling */}
          <TabsContent value="scheduling" className="mt-4 space-y-4">
            <SchedulingEditor
              calendly={state.portal.calendly_url ?? ""}
              slots={(state.portal.availability_slots ?? []) as string[]}
              onSave={async (calendly, slots) => {
                await call({ action: "client_save_scheduling", token, calendly_url: calendly, availability_slots: slots });
                toast.success("Scheduling saved");
                load();
              }}
            />
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-sm font-semibold">Candidate notifications</h3>
              <p className="text-xs text-slate-500">Managed by the agency — shown here for visibility only.</p>
              <div className="text-sm flex items-center justify-between">
                <span>Email on move to interview</span>
                <Badge variant={state.job.notify_candidate_on_interview ? "default" : "secondary"}>
                  {state.job.notify_candidate_on_interview ? "On" : "Off"}
                </Badge>
              </div>
              <div className="text-sm flex items-center justify-between">
                <span>Email on rejection</span>
                <Badge variant={state.job.notify_candidate_on_reject ? "default" : "secondary"}>
                  {state.job.notify_candidate_on_reject ? "On" : "Off"}
                </Badge>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold mb-2">Interview requests</h3>
              {(state.bookings ?? []).length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
              {(state.bookings ?? []).map((b: any) => (
                <div key={b.id} className="text-sm border-b border-slate-100 py-1.5">
                  {candidates.find((c) => c.id === b.candidate_id)?.name} — {b.slot_or_booking_ref}{" "}
                  <Badge variant="outline">{b.status}</Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Candidate detail + feedback */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{active?.name}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge variant="secondary">{active.stage}</Badge>
                {active.cv_url && (
                  <Button size="sm" variant="outline" onClick={() => window.open(active.cv_url!, "_blank")}>
                    View CV
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Feedback — tagged to stage</Label>
                <Select value={feedbackStage} onValueChange={setFeedbackStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Your thoughts…" />
                <Select value={rating} onValueChange={setRating}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rating</SelectItem>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} / 5</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={submitFeedback} disabled={!comment.trim()}>
                  Submit feedback
                </Button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto">
                {candidateFeedback.map((f: any) => (
                  <div key={f.id} className="text-sm border-b border-slate-100 pb-2">
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      {f.stage} · {new Date(f.created_at).toLocaleString()}
                      {f.rating && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="h-3 w-3" /> {f.rating}
                        </span>
                      )}
                    </div>
                    {f.comment}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientStageEditor({
  stage,
  prep,
  details,
  onSave,
}: {
  stage: string;
  prep: string;
  details: string;
  onSave: (prep: string, details: string) => Promise<void>;
}) {
  const [p, setP] = useState(prep);
  const [d, setD] = useState(details);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <h3 className="text-sm font-semibold">{stage}</h3>
      <Label className="text-xs text-slate-600">Interview details</Label>
      <Textarea value={d} onChange={(e) => setD(e.target.value)} rows={2} />
      <Label className="text-xs text-slate-600">Interview prep</Label>
      <Textarea value={p} onChange={(e) => setP(e.target.value)} rows={3} />
      <Button size="sm" variant="outline" onClick={() => onSave(p, d)}>Save</Button>
    </div>
  );
}

function SchedulingEditor({
  calendly,
  slots,
  onSave,
}: {
  calendly: string;
  slots: string[];
  onSave: (calendly: string, slots: string[]) => Promise<void>;
}) {
  const [url, setUrl] = useState(calendly);
  const [list, setList] = useState<string[]>(slots);
  const [draft, setDraft] = useState("");
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Scheduling</h3>
      <div className="space-y-1">
        <Label className="text-xs text-slate-600">Calendly (or similar) link</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendly.com/…" />
      </div>
      {!url && (
        <div className="space-y-2">
          <Label className="text-xs text-slate-600">Or offer day / time blocks</Label>
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tue 14 Oct, 10:00–12:00" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (draft.trim()) setList([...list, draft.trim()]);
                setDraft("");
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {list.map((s, i) => (
              <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setList(list.filter((_, j) => j !== i))}>
                {s} ✕
              </Badge>
            ))}
          </div>
        </div>
      )}
      <Button size="sm" onClick={() => onSave(url, list)}>Save scheduling</Button>
    </div>
  );
}
