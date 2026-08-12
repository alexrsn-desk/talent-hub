import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CheckCircle2, Circle, Lock, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const call = async (payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("portal-public", { body: payload });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
};

export default function PortalCandidate() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);

  const load = async () => {
    try {
      setState(await call({ action: "candidate_get", token }));
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Could not load this page");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const book = async (slot: string) => {
    try {
      await call({ action: "candidate_book", token, slot_or_booking_ref: slot });
      toast.success("Time requested — your recruiter will confirm");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
      </div>
    );

  if (error || !state)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-[#FBF8F3] p-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">This link isn't active</h1>
        <p className="text-sm text-stone-500">{error ?? "Please get in touch with your recruiter for a fresh link."}</p>
      </div>
    );

  const { candidate, job, progress, unlocked_content, scheduling, bookings } = state;
  const currentIndex = progress.indexOf(candidate.stage);

  if (candidate.rejected)
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-4 shadow-sm">
          <h1 className="text-xl font-semibold text-stone-800">Thank you, {candidate.name.split(" ")[0]}</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            After careful consideration, {job.client_name || "the company"} has decided not to progress your
            application for {job.title} at this time.
          </p>
          <p className="text-sm text-stone-600 leading-relaxed">
            We know that's disappointing to read. Thank you genuinely for the time you gave this process — your
            recruiter will stay in touch about roles that fit you well.
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-stone-800">
      <div className="max-w-2xl mx-auto p-5 md:p-10 space-y-8">
        <header className="space-y-1">
          <p className="text-sm text-stone-500">Hello {candidate.name.split(" ")[0]} — welcome to your hiring hub</p>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-sm text-stone-500">{job.client_name}</p>
        </header>

        {/* Progress */}
        <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4">Where you are</h2>
          <ol className="space-y-3">
            {progress.map((stage: string, i: number) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <li key={stage} className="flex items-center gap-3 text-sm">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : current ? (
                    <Circle className="h-4 w-4 text-stone-800 fill-stone-800/10" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-stone-300" />
                  )}
                  <span className={current ? "font-semibold" : done ? "text-stone-600" : "text-stone-400"}>
                    {stage}
                  </span>
                  {current && <span className="text-xs text-stone-500">You're here</span>}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Job pack */}
        <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">Your job pack</h2>
          <p className="text-sm text-stone-600">
            Everything you need about the role at {job.client_name || "the company"}.
          </p>
          {job.job_description_url ? (
            <Button variant="outline" size="sm" onClick={() => window.open(job.job_description_url, "_blank")}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Open job description
            </Button>
          ) : (
            <p className="text-xs text-stone-400">Your recruiter will add the job description shortly.</p>
          )}
        </section>

        {/* Scheduling — shown once at an interview stage */}
        {(scheduling.calendly_url || (scheduling.availability_slots ?? []).length > 0) && currentIndex >= 2 && (
          <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Book your interview
            </h2>
            {scheduling.calendly_url ? (
              <Button size="sm" onClick={() => window.open(scheduling.calendly_url, "_blank")}>
                Choose a time
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-stone-600">Pick a slot that suits you and we'll confirm it.</p>
                <div className="flex flex-wrap gap-2">
                  {(scheduling.availability_slots as string[]).map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => book(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {(bookings ?? []).length > 0 && (
              <p className="text-xs text-stone-500">
                Requested: {bookings[0].slot_or_booking_ref} ({bookings[0].status})
              </p>
            )}
          </section>
        )}

        {/* Progressive reveal of stage content — details above prep */}
        {unlocked_content
          .filter((u: any) => u.prep_content || u.interview_details)
          .map((u: any) => (
            <section key={u.stage} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold">{u.stage}</h2>
              {u.interview_details && (
                <div className="space-y-1">
                  <h3 className="text-xs uppercase tracking-wide text-stone-400">Interview details</h3>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-stone-700">{u.interview_details}</p>
                </div>
              )}
              {u.prep_content && (
                <div className="space-y-1">
                  <h3 className="text-xs uppercase tracking-wide text-stone-400">How to prepare</h3>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-stone-700">{u.prep_content}</p>
                </div>
              )}
            </section>
          ))}

        <p className="text-xs text-stone-400 text-center">
          More detail unlocks as you move through the process. Questions? Reply to your recruiter's email.
        </p>
      </div>
    </div>
  );
}
