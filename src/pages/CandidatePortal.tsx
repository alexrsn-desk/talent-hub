import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CandidatePortalData = {
  candidate_first_name: string | null;
  rejected: boolean;
  job: { title: string; location: string | null; description: string | null };
  company_name: string | null;
  current_step: string | null;
  steps: { key: string; label: string; current: boolean }[];
  stage_content: { stage: string; interview_details: string | null; prep_material: string | null }[];
  scheduling: { calendly_url: string | null; slots: string[] } | null;
};

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`portal-panel p-6 ${className}`}>{children}</div>;
}

export default function CandidatePortal({ tokenOverride }: { tokenOverride?: string } = {}) {
  const params = useParams();
  const token = tokenOverride ?? params.token ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidate-portal", token],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("candidate-portal", { body: { token } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as CandidatePortalData;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="portal-root flex min-h-screen items-center justify-center bg-muted">
        <p className="text-[14px] text-muted-foreground">Loading your update…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="portal-root flex min-h-screen items-center justify-center bg-muted px-4">
        <p className="text-center text-[14px] text-muted-foreground">
          This link isn't valid any more. Ask your recruiter for a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="portal-root min-h-screen bg-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 lg:py-10">
          {data.company_name && (
            <p className="text-[12px] font-medium uppercase tracking-wide text-accent">{data.company_name}</p>
          )}
          <h1 className="mt-1 text-[24px] font-semibold text-foreground">{data.job.title}</h1>
          {data.job.location && (
            <p className="mt-1 text-[14px] text-muted-foreground">{data.job.location}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
        <Panel>
          <p className="text-[16px] text-foreground">
            {data.candidate_first_name ? `Hi ${data.candidate_first_name} — ` : ""}
            {data.rejected
              ? "your recruiter will be in touch about this role. There's nothing to action here right now."
              : `you're currently at: ${data.current_step}.`}
          </p>

          {!data.rejected && (
            <ol className="mt-5 space-y-3">
              {data.steps.map((s) => (
                <li key={s.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                      s.current ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className={`text-[14px] ${s.current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                    {s.current && " — you are here"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {!data.rejected && data.job.description && (
          <Panel>
            <h2 className="text-[18px] font-semibold text-foreground">The role</h2>
            <p className="mt-3 whitespace-pre-wrap text-[14px] text-muted-foreground">{data.job.description}</p>
          </Panel>
        )}

        {data.stage_content.map((c) => (
          <Panel key={c.stage}>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
              <FileText className="h-4 w-4 text-accent" />
              {c.stage}
            </h2>
            {c.interview_details && (
              <div className="mt-3">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Details</p>
                <p className="mt-1 whitespace-pre-wrap text-[14px] text-foreground">{c.interview_details}</p>
              </div>
            )}
            {c.prep_material && (
              <div className="mt-4">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">How to prepare</p>
                <p className="mt-1 whitespace-pre-wrap text-[14px] text-foreground">{c.prep_material}</p>
              </div>
            )}
          </Panel>
        ))}

        {data.scheduling && (
          <Panel>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-accent" />
              Book your slot
            </h2>
            {data.scheduling.calendly_url && (
              <a
                href={data.scheduling.calendly_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[14px] text-accent hover:underline"
              >
                Open the booking link
              </a>
            )}
            {Array.isArray(data.scheduling.slots) && data.scheduling.slots.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {data.scheduling.slots.map((s, i) => (
                  <li key={i} className="text-[14px] text-foreground">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-muted-foreground">
              Reply to your recruiter to confirm — they'll lock the time in with the client.
            </p>
          </Panel>
        )}
      </main>
    </div>
  );
}
