import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, ExternalLink, Briefcase, TrendingUp, AlertTriangle, ArrowRightLeft, Clock } from "lucide-react";
import { useCompanyIntel, useEnrichCompany, type CompanySignal } from "@/hooks/use-company-intel";

const signalIcon = (t?: string) => {
  if (t === "growth") return <TrendingUp className="h-3.5 w-3.5 text-green-400" />;
  if (t === "risk") return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
  return <ArrowRightLeft className="h-3.5 w-3.5 text-yellow-400" />;
};

const signalDot = (t?: string) =>
  t === "growth" ? "bg-success/20 text-green-400" :
  t === "risk" ? "bg-destructive/20 text-red-400" :
  "bg-yellow-500/20 text-yellow-400";

export function CompanyIntelPanel({ clientId, companyName }: { clientId: string; companyName: string }) {
  const { data: intel, isLoading } = useCompanyIntel(clientId);
  const enrich = useEnrichCompany();

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading intelligence…</div>;

  if (!intel) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
        <Sparkles className="h-6 w-6 mx-auto text-primary" />
        <div>
          <h3 className="font-medium">No intelligence yet</h3>
          <p className="text-sm text-muted-foreground">
            Run AI research to populate funding, hiring signals, tech stack and recent news for {companyName}.
          </p>
        </div>
        <Button onClick={() => enrich.mutate(clientId)} disabled={enrich.isPending}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          {enrich.isPending ? "Researching…" : "Enrich with AI"}
        </Button>
        <p className="text-xs text-muted-foreground">~£0.04 per enrichment · counts against your monthly budget</p>
      </div>
    );
  }

  const signals = intel.recent_signals || [];
  const jobs = intel.current_job_postings || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Last enriched {intel.last_enriched_at ? new Date(intel.last_enriched_at).toLocaleString("en-GB") : "—"}
        </div>
        <Button size="sm" variant="outline" onClick={() => enrich.mutate(clientId)} disabled={enrich.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${enrich.isPending ? "animate-spin" : ""}`} />
          {enrich.isPending ? "Refreshing…" : "Refresh intelligence"}
        </Button>
      </div>

      {/* Overview */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Overview</h3>
        {intel.description && <p className="text-sm">{intel.description}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Field label="Size" value={intel.employee_count} />
          <Field label="Founded" value={intel.year_founded?.toString()} />
          <Field label="HQ" value={intel.headquarters} />
          <Field label="Industry" value={intel.industry} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {intel.website && (
            <a href={intel.website} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Website
            </a>
          )}
          {intel.linkedin_url && (
            <a href={intel.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> LinkedIn
            </a>
          )}
        </div>
      </section>

      {/* Funding */}
      {(intel.funding_stage || intel.funding_amount || intel.total_funding) && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Funding</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Field label="Latest stage" value={intel.funding_stage} />
            <Field label="Amount" value={intel.funding_amount} />
            <Field label="Date" value={intel.funding_date} />
            <Field label="Total raised" value={intel.total_funding} />
            <Field label="Last valuation" value={intel.last_valuation} />
            <Field label="Revenue" value={intel.revenue_range} />
          </div>
          {intel.funding_lead_investors?.length ? (
            <p className="text-xs text-muted-foreground">
              Lead investors: <span className="text-foreground">{intel.funding_lead_investors.join(", ")}</span>
            </p>
          ) : null}
        </section>
      )}

      {/* Recent signals */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Recent signals</h3>
        {signals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notable events found.</p>
        ) : (
          <ul className="space-y-2">
            {signals.map((s: CompanySignal, i: number) => (
              <li key={i} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{signalIcon(s.signal_type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.headline}</span>
                      {s.date && <span className="text-xs text-muted-foreground">· {s.date}</span>}
                      {s.category && <Badge variant="secondary" className={`text-[10px] ${signalDot(s.signal_type)}`}>{s.category}</Badge>}
                    </div>
                    {s.bd_implication && (
                      <p className="text-xs text-muted-foreground mt-1">BD signal: {s.bd_implication}</p>
                    )}
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        Source
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Current hiring */}
      {jobs.length > 0 && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Current hiring
          </h3>
          <ul className="text-sm space-y-1">
            {jobs.map((j, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{j.count ?? 1}</Badge>
                <span>{j.title}</span>
                {j.department && <span className="text-xs text-muted-foreground">· {j.department}</span>}
                {j.location && <span className="text-xs text-muted-foreground">· {j.location}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tech stack */}
      {intel.tech_stack?.length ? (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Tech stack</h3>
          <div className="flex flex-wrap gap-1.5">
            {intel.tech_stack.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
