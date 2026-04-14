import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, CheckCircle2, XCircle, HelpCircle, Briefcase, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type PortalData = {
  jobs: any[];
  candidateJobs: any[];
  feedback: any[];
  recentActivity: any[];
  interviewSlots: any[];
};

type ClientInfo = { id: string; company_name: string; contact_name: string | null };
type Branding = { agency_name: string | null; agency_logo_url: string | null; brand_color: string };

const stageColor: Record<string, string> = {
  Applied: "bg-blue-500/20 text-blue-400",
  "CV Sent": "bg-purple-500/20 text-purple-400",
  Interview: "bg-yellow-500/20 text-yellow-400",
  "Client Interested": "bg-green-500/20 text-green-400",
  "Client Rejected": "bg-red-500/20 text-red-400",
  Offer: "bg-emerald-500/20 text-emerald-400",
  Placed: "bg-cyan-500/20 text-cyan-400",
};

export default function Portal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [branding, setBranding] = useState<Branding>({ agency_name: null, agency_logo_url: null, brand_color: "#3B82F6" });
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [tab, setTab] = useState<"jobs" | "activity">("jobs");

  // Validate token
  useEffect(() => {
    if (!token) { setError("No access token provided"); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase.functions.invoke("portal-auth", {
        body: { action: "validate", token },
      });
      if (err || data?.error) { setError(data?.error || "Invalid link"); setLoading(false); return; }
      setClient(data.client);
      setClientId(data.client_id);
      if (data.branding) setBranding(data.branding);
    })();
  }, [token]);

  // Fetch portal data once authenticated
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await supabase.functions.invoke("portal-auth", {
        body: { action: "get_portal_data", client_id: clientId, token },
      });
      setPortalData(data);
      setLoading(false);
    })();
  }, [clientId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bc = branding.brand_color;

  return (
    <div className="min-h-screen bg-background">
      {/* Branded Header */}
      <header className="border-b border-border" style={{ backgroundColor: bc + "10" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.agency_logo_url && (
              <img src={branding.agency_logo_url} alt="Logo" className="h-8 w-auto rounded bg-white p-0.5" />
            )}
            <div>
              <h1 className="text-lg font-semibold">{branding.agency_name || "Client Portal"}</h1>
              <p className="text-sm text-muted-foreground">{client?.company_name}</p>
            </div>
          </div>
          <Badge variant="secondary" style={{ backgroundColor: bc + "20", color: bc }}>
            {client?.contact_name || "Client"}
          </Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tab nav */}
        <div className="flex gap-2">
          <Button
            variant={tab === "jobs" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("jobs")}
            style={tab === "jobs" ? { backgroundColor: bc } : {}}
          >
            <Briefcase className="h-4 w-4 mr-1.5" /> Jobs & Candidates
          </Button>
          <Button
            variant={tab === "activity" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("activity")}
            style={tab === "activity" ? { backgroundColor: bc } : {}}
          >
            <Clock className="h-4 w-4 mr-1.5" /> Activity Feed
          </Button>
        </div>

        {tab === "jobs" && portalData && (
          <div className="space-y-4">
            {portalData.jobs.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No active jobs at the moment.</CardContent></Card>
            ) : portalData.jobs.map((job: any) => (
              <Card key={job.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{job.title}</CardTitle>
                    <Badge variant="secondary">{job.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {job.location || "Remote"} · {job.job_type} · {job.salary_min && job.salary_max ? `£${(job.salary_min / 1000).toFixed(0)}k-£${(job.salary_max / 1000).toFixed(0)}k` : "Salary TBC"}
                  </p>
                </CardHeader>
                {selectedJob === job.id && (
                  <CardContent className="space-y-3">
                    {portalData.candidateJobs
                      .filter((cj: any) => cj.job_id === job.id)
                      .map((cj: any) => (
                        <CandidateCard
                          key={cj.id}
                          candidateJob={cj}
                          clientId={clientId!}
                          token={token!}
                          existingFeedback={portalData.feedback.filter((f: any) => f.candidate_job_id === cj.id)}
                          onFeedbackSubmitted={() => {
                            // Refresh data
                            supabase.functions.invoke("portal-auth", {
                              body: { action: "get_portal_data", client_id: clientId, token },
                            }).then(({ data }) => data && setPortalData(data));
                          }}
                        />
                      ))}
                    {portalData.candidateJobs.filter((cj: any) => cj.job_id === job.id).length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">No candidates submitted yet.</p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        {tab === "activity" && portalData && (
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
            <CardContent>
              {portalData.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <div className="space-y-3">
                  {portalData.recentActivity.map((note: any) => (
                    <div key={note.id} className="flex gap-3 text-sm">
                      <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-foreground">{note.content}</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          {new Date(note.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}{note.activity_type}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidateJob,
  clientId,
  token,
  existingFeedback,
  onFeedbackSubmitted,
}: {
  candidateJob: any;
  clientId: string;
  token: string;
  existingFeedback: any[];
  onFeedbackSubmitted: () => void;
}) {
  const candidate = candidateJob.candidates;
  const summary = candidateJob.candidate_summaries?.[0];
  const [showFeedback, setShowFeedback] = useState(false);
  const [showInterviewFeedback, setShowInterviewFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasReview = existingFeedback.some((f: any) => f.feedback_type === "review");
  const hasInterviewFeedback = existingFeedback.some((f: any) => f.feedback_type === "interview");
  const interviewPassed = candidateJob.interview_date && new Date(candidateJob.interview_date) < new Date();

  const submitReview = async (status: string, reason: string) => {
    setSubmitting(true);
    await supabase.functions.invoke("portal-auth", {
      body: {
        action: "submit_feedback",
        client_id: clientId,
        token,
        candidate_job_id: candidateJob.id,
        status,
        reason: reason || null,
        feedback_type: "review",
      },
    });
    setSubmitting(false);
    setShowFeedback(false);
    toast.success("Review submitted");
    onFeedbackSubmitted();
  };

  const submitInterviewFeedback = async (data: { rating: number; strengths: string; concerns: string; decision: string }) => {
    setSubmitting(true);
    await supabase.functions.invoke("portal-auth", {
      body: {
        action: "submit_feedback",
        client_id: clientId,
        token,
        candidate_job_id: candidateJob.id,
        rating: data.rating,
        strengths: data.strengths,
        concerns: data.concerns,
        decision: data.decision,
        feedback_type: "interview",
      },
    });
    setSubmitting(false);
    setShowInterviewFeedback(false);
    toast.success("Interview feedback submitted");
    onFeedbackSubmitted();
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">{candidate?.name || "Candidate"}</h4>
          <p className="text-sm text-muted-foreground">
            {candidate?.job_title || ""} {candidate?.current_employer ? `at ${candidate.current_employer}` : ""}
          </p>
        </div>
        <Badge className={stageColor[candidateJob.stage] || "bg-muted text-muted-foreground"}>
          {candidateJob.stage}
        </Badge>
      </div>

      {candidateJob.interview_date && (
        <p className="text-sm text-muted-foreground">
          📅 Interview: {new Date(candidateJob.interview_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {/* AI Summary */}
      {(summary?.manual_summary || summary?.ai_summary) && (
        <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap">
          {summary.manual_summary || summary.ai_summary}
        </div>
      )}

      {/* Review actions */}
      {!hasReview && !showFeedback && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => submitReview("interested", "")}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Interested
          </Button>
          <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setShowFeedback(true)}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Not Suitable
          </Button>
          <Button size="sm" variant="outline" className="text-yellow-400 border-yellow-400/30" onClick={() => setShowFeedback(true)}>
            <HelpCircle className="h-3.5 w-3.5 mr-1" /> Maybe
          </Button>
        </div>
      )}

      {hasReview && (
        <div className="text-sm">
          <Badge variant="secondary">
            {existingFeedback.find((f: any) => f.feedback_type === "review")?.status === "interested" ? "✓ Interested" :
             existingFeedback.find((f: any) => f.feedback_type === "review")?.status === "not_suitable" ? "✗ Not Suitable" : "? Maybe"}
          </Badge>
        </div>
      )}

      {showFeedback && <ReviewForm onSubmit={submitReview} submitting={submitting} onCancel={() => setShowFeedback(false)} />}

      {/* Interview feedback prompt */}
      {interviewPassed && !hasInterviewFeedback && !showInterviewFeedback && (
        <Button size="sm" onClick={() => setShowInterviewFeedback(true)} className="w-full">
          <Star className="h-3.5 w-3.5 mr-1" /> Leave Interview Feedback
        </Button>
      )}

      {showInterviewFeedback && (
        <InterviewFeedbackForm onSubmit={submitInterviewFeedback} submitting={submitting} onCancel={() => setShowInterviewFeedback(false)} />
      )}

      {hasInterviewFeedback && (
        <Badge variant="secondary" className="bg-primary/20 text-primary">Interview feedback submitted</Badge>
      )}
    </div>
  );
}

function ReviewForm({ onSubmit, submitting, onCancel }: { onSubmit: (status: string, reason: string) => void; submitting: boolean; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("not_suitable");

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex gap-2">
        <Button size="sm" variant={status === "not_suitable" ? "default" : "outline"} onClick={() => setStatus("not_suitable")}>Not Suitable</Button>
        <Button size="sm" variant={status === "maybe" ? "default" : "outline"} onClick={() => setStatus("maybe")}>Maybe</Button>
      </div>
      <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSubmit(status, reason)} disabled={submitting}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function InterviewFeedbackForm({ onSubmit, submitting, onCancel }: {
  onSubmit: (data: { rating: number; strengths: string; concerns: string; decision: string }) => void;
  submitting: boolean; onCancel: () => void;
}) {
  const [rating, setRating] = useState(3);
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [decision, setDecision] = useState("");

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-medium mb-1">Rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)} className={`p-1 rounded ${n <= rating ? "text-yellow-400" : "text-muted-foreground"}`}>
              <Star className="h-5 w-5" fill={n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Strengths</p>
        <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} placeholder="What impressed you?" />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Concerns</p>
        <Textarea value={concerns} onChange={(e) => setConcerns(e.target.value)} rows={2} placeholder="Any concerns?" />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Decision</p>
        <div className="flex gap-2">
          {[{ value: "progress", label: "Progress", color: "text-green-400" }, { value: "reject", label: "Reject", color: "text-red-400" }, { value: "offer", label: "Make Offer", color: "text-emerald-400" }].map(opt => (
            <Button key={opt.value} size="sm" variant={decision === opt.value ? "default" : "outline"} className={decision !== opt.value ? opt.color : ""} onClick={() => setDecision(opt.value)}>
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSubmit({ rating, strengths, concerns, decision })} disabled={submitting || !decision}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Feedback"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
