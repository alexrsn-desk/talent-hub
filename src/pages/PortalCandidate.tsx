import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Lock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { candidateRequestSlot, getCandidatePortal } from "@/lib/portal.functions";

export default function CandidatePortal() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Your application pack";
  }, []);

  const portal = useQuery({
    queryKey: ["candidate-portal", token],
    queryFn: () => getCandidatePortal({ data: { token } }),
  });

  const requestSlot = useMutation({
    mutationFn: (slotLabel: string) => candidateRequestSlot({ data: { token, slot: slotLabel } }),
    onSuccess: () => {
      toast.success("Request sent — your recruiter will confirm shortly.");
      qc.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: () => toast.error("Could not send request"),
  });

  if (portal.isLoading) {
    return <Center text="Loading your pack…" />;
  }
  if (!portal.data) {
    return <Center text="This link isn't valid any more. Ask your recruiter for a new one." />;
  }

  const p = portal.data;
  const sched = p.scheduling;
  const requestedSlot = p.booking?.slot ?? null;

  return (
    <div className="portal-scope min-h-screen bg-surface text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-accent">
            <Building2 className="size-3.5" />
            {p.job.clientName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{p.job.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hi {p.candidate.name.split(" ")[0]} — here's everything for your application.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Where you are</h2>
          <ol className="mt-5 space-y-4">
            {p.stages.map((stage, i) => {
              const done = stage.reached && !stage.current;
              return (
                <li key={stage.label} className="flex items-center gap-3">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      done
                        ? "bg-accent/15 text-accent"
                        : stage.current
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="size-4" /> : i + 1}
                  </span>
                  <span
                    className={
                      stage.current
                        ? "font-medium"
                        : done
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }
                  >
                    {stage.label}
                  </span>
                  {stage.current && (
                    <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      You are here
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {p.job.companyInfo && (
          <CollapsibleProse title="About the company" body={p.job.companyInfo} />
        )}
        {p.job.jobSpec && <CollapsibleProse title="The role" body={p.job.jobSpec} />}

        {p.job.jobSpecUrl && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold">Job description</h2>
            <a
              href={p.job.jobSpecUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm text-accent underline-offset-4 hover:underline"
            >
              <FileText className="size-4" />
              {p.job.jobSpecFilename ?? "Download the job description"}
            </a>
          </section>
        )}

        {p.pack.jobPack && <CollapsibleProse title="Your job pack" body={p.pack.jobPack} />}

        {/* Interview details always sit above prep. */}
        {p.pack.interviewDetails && (
          <Prose title="Interview details" body={p.pack.interviewDetails} />
        )}
        {p.pack.prepMaterial && <Prose title="Interview prep" body={p.pack.prepMaterial} />}

        {p.stageContent.map((s) => (
          <section key={s.stage} className="panel p-6">
            <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-accent">
              <Lock className="size-3.5" /> Unlocked: {s.stage}
            </p>
            {s.interviewDetails && (
              <div className="mt-4">
                <h2 className="text-lg font-semibold">Interview details</h2>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {s.interviewDetails}
                </div>
              </div>
            )}
            {s.prepMaterial && (
              <div className="mt-5">
                <h2 className="text-lg font-semibold">Interview prep</h2>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {s.prepMaterial}
                </div>
              </div>
            )}
          </section>
        ))}

        {sched?.calendlyUrl && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold">Book your interview</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a time that suits you — it confirms instantly.
            </p>
            <a
              href={sched.calendlyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Open booking page <ExternalLink className="size-4" />
            </a>
          </section>
        )}

        {sched && !sched.calendlyUrl && sched.slots.length > 0 && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold">Request an interview slot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose what works — your recruiter will confirm by email.
            </p>
            <div className="mt-4 space-y-2">
              {sched.slots.map((s) => {
                const requested = requestedSlot === s.label;
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                      chosen === s.label ? "border-accent bg-accent/5" : "border-border bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="slot"
                      disabled={requested}
                      checked={chosen === s.label}
                      onChange={() => setChosen(s.label)}
                    />
                    <CalendarCheck className="size-4 text-accent" />
                    {s.label}
                    {requested && (
                      <span className="ml-auto text-xs text-muted-foreground">Requested</span>
                    )}
                  </label>
                );
              })}
            </div>
            <button
              disabled={!chosen || requestSlot.isPending}
              onClick={() => chosen && requestSlot.mutate(chosen)}
              className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Request this slot
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function CollapsibleProse({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {open ? (
          <ChevronUp className="size-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="whitespace-pre-wrap px-6 pb-6 text-sm leading-relaxed text-foreground/90">
          {body}
        </div>
      )}
    </section>
  );
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {body}
      </div>
    </section>
  );
}

function Center({ text }: { text: string }) {
  return (
    <div className="portal-scope flex min-h-screen items-center justify-center bg-surface px-4">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
