import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, RefreshCw, ExternalLink, Briefcase, TrendingUp, AlertTriangle,
  ArrowRightLeft, Clock, CheckCircle2, Pencil, ShieldCheck, ShieldAlert, Bot, Check, X,
} from "lucide-react";
import {
  useCompanyIntel, useEnrichCompany, useUpdateIntelField,
  TRACKED_INTEL_FIELDS, type TrackedIntelField, type CompanySignal,
} from "@/hooks/use-company-intel";

const signalIcon = (t?: string) => {
  if (t === "growth") return <TrendingUp className="h-3.5 w-3.5 text-green-400" />;
  if (t === "risk") return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
  return <ArrowRightLeft className="h-3.5 w-3.5 text-yellow-400" />;
};

const signalDot = (t?: string) =>
  t === "growth" ? "bg-success/20 text-green-400" :
  t === "risk" ? "bg-destructive/20 text-red-400" :
  "bg-yellow-500/20 text-yellow-400";

const FIELD_LABELS: Record<TrackedIntelField, string> = {
  official_name: "Official name",
  website: "Website",
  linkedin_url: "LinkedIn",
  headquarters: "HQ",
  year_founded: "Founded",
  employee_count: "Size",
  industry: "Industry",
  description: "Description",
  funding_stage: "Latest stage",
  funding_amount: "Amount",
  funding_date: "Date",
  total_funding: "Total raised",
  last_valuation: "Last valuation",
  revenue_range: "Revenue",
};

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
  const status = (intel.field_status || {}) as Record<string, "unconfirmed" | "confirmed" | "manual">;

  // Overall verification status
  const populated = TRACKED_INTEL_FIELDS.filter((f) => {
    const v = (intel as any)[f];
    return v !== null && v !== undefined && v !== "";
  });
  const counts = populated.reduce(
    (acc, f) => {
      const s = status[f] || "unconfirmed";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { unconfirmed: 0, confirmed: 0, manual: 0 } as Record<string, number>,
  );
  const total = populated.length;
  const verifiedCount = counts.confirmed + counts.manual;

  let banner: { icon: JSX.Element; label: string; cls: string };
  if (total === 0) {
    banner = { icon: <Bot className="h-4 w-4" />, label: "No data captured yet", cls: "bg-muted/40 text-muted-foreground border-border" };
  } else if (verifiedCount === total) {
    banner = { icon: <ShieldCheck className="h-4 w-4" />, label: "Verified profile", cls: "bg-success/10 text-green-400 border-success/30" };
  } else if (verifiedCount === 0) {
    banner = { icon: <Bot className="h-4 w-4" />, label: "AI estimated — please verify", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
  } else {
    banner = { icon: <ShieldAlert className="h-4 w-4" />, label: `Partially verified (${verifiedCount}/${total})`, cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${banner.cls}`}>
          {banner.icon}
          {banner.label}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {intel.last_enriched_at ? new Date(intel.last_enriched_at).toLocaleString("en-GB") : "—"}
          </div>
          <Button size="sm" variant="outline" onClick={() => enrich.mutate(clientId)} disabled={enrich.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${enrich.isPending ? "animate-spin" : ""}`} />
            {enrich.isPending ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Overview */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Overview</h3>
        <VerifiableField intel={intel} field="description" multiline />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <VerifiableField intel={intel} field="employee_count" />
          <VerifiableField intel={intel} field="year_founded" />
          <VerifiableField intel={intel} field="headquarters" />
          <VerifiableField intel={intel} field="industry" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <VerifiableField intel={intel} field="website" />
          <VerifiableField intel={intel} field="linkedin_url" />
        </div>
      </section>

      {/* Funding */}
      {(intel.funding_stage || intel.funding_amount || intel.total_funding) && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Funding</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <VerifiableField intel={intel} field="funding_stage" />
            <VerifiableField intel={intel} field="funding_amount" />
            <VerifiableField intel={intel} field="funding_date" />
            <VerifiableField intel={intel} field="total_funding" />
            <VerifiableField intel={intel} field="last_valuation" />
            <VerifiableField intel={intel} field="revenue_range" />
          </div>
          {intel.funding_lead_investors?.length ? (
            <p className="text-xs text-muted-foreground pt-1">
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

function VerifiableField({
  intel,
  field,
  multiline,
}: {
  intel: any;
  field: TrackedIntelField;
  multiline?: boolean;
}) {
  const value = intel[field];
  const status = (intel.field_status?.[field] as "unconfirmed" | "confirmed" | "manual" | undefined);
  const update = useUpdateIntelField();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));

  const isEmpty = value === null || value === undefined || value === "";
  const effectiveStatus: "unconfirmed" | "confirmed" | "manual" = isEmpty
    ? "manual"
    : (status || "unconfirmed");

  const renderValue = () => {
    if (isEmpty) return <span className="text-muted-foreground">—</span>;
    if (field === "website" || field === "linkedin_url") {
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
          <ExternalLink className="h-3 w-3 shrink-0" /> {String(value)}
        </a>
      );
    }
    return <span className="break-words">{String(value)}</span>;
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{FIELD_LABELS[field]}</div>
        {multiline ? (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="text-sm" />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            type={field === "year_founded" ? "number" : "text"}
            className="h-8 text-sm"
          />
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              const v: any = field === "year_founded" ? (draft ? Number(draft) : null) : draft.trim() || null;
              update.mutate(
                {
                  intelId: intel.id,
                  clientId: intel.client_id,
                  field,
                  value: v,
                  action: "manual",
                  currentStatus: intel.field_status || {},
                },
                { onSuccess: () => setEditing(false) },
              );
            }}
            disabled={update.isPending}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(false); setDraft(value == null ? "" : String(value)); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-1">
      <div className="text-muted-foreground">{FIELD_LABELS[field]}</div>
      <div className="text-sm text-foreground">{renderValue()}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {!isEmpty && effectiveStatus === "unconfirmed" && (
          <>
            <span className="inline-flex items-center gap-1 text-amber-300">
              <AlertTriangle className="h-3 w-3" /> AI estimated
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  intelId: intel.id,
                  clientId: intel.client_id,
                  field,
                  action: "confirm",
                  currentStatus: intel.field_status || {},
                })
              }
            >
              <Check className="h-3 w-3 mr-1" /> Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </>
        )}
        {!isEmpty && effectiveStatus === "confirmed" && (
          <>
            <span className="inline-flex items-center gap-1 text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Confirmed
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </>
        )}
        {(isEmpty || effectiveStatus === "manual") && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3 mr-1" /> {isEmpty ? "Add" : "Edit"}
          </Button>
        )}
      </div>
    </div>
  );
}
