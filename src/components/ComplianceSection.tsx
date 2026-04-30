import { useMemo, useState } from "react";
import { ShieldCheck, Download, Loader2, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComplianceAudits, useComplianceLog, useDncCounts, useStaleCandidates } from "@/hooks/use-compliance";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ComplianceSection() {
  const { data: counts, isLoading: cl } = useDncCounts();
  const { data: log = [] } = useComplianceLog();
  const { data: audits = [] } = useComplianceAudits();
  const { data: stale = [] } = useStaleCandidates();
  const [busy, setBusy] = useState<string | null>(null);

  const lastAudit = audits[0];
  const nextDue = lastAudit?.next_due_date
    ? new Date(lastAudit.next_due_date).toLocaleDateString()
    : "Not yet run";
  const lastAuditDate = lastAudit?.completed_at
    ? new Date(lastAudit.completed_at).toLocaleDateString()
    : lastAudit?.started_at
      ? new Date(lastAudit.started_at).toLocaleDateString()
      : "Never";

  const deletionLog = useMemo(() => log.filter((l) => l.action === "gdpr_deleted"), [log]);

  const exportDnc = async () => {
    setBusy("dnc");
    try {
      const [{ data: cands = [] }, { data: cons = [] }] = await Promise.all([
        supabase.from("candidates").select("id, name, email, dnc_reason, dnc_channel, dnc_set_at").eq("do_not_contact", true),
        supabase.from("contacts").select("id, name, email, dnc_reason, dnc_channel, dnc_set_at").eq("do_not_contact", true),
      ]);
      const rows = [
        ...(cands ?? []).map((c: any) => ({ entity_type: "candidate", ...c })),
        ...(cons ?? []).map((c: any) => ({ entity_type: "contact", ...c })),
      ];
      if (rows.length === 0) { toast.info("No Do Not Contact records to export."); return; }
      downloadCsv(`do-not-contact-${new Date().toISOString().slice(0,10)}.csv`, toCsv(rows));
      toast.success("Exported");
    } finally { setBusy(null); }
  };

  const exportDeletions = () => {
    if (deletionLog.length === 0) { toast.info("No deletion log entries to export."); return; }
    const rows = deletionLog.map((l) => ({
      action: l.action,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      name_at_deletion: l.entity_name_snapshot ?? "",
      reason: l.reason ?? "",
      created_at: l.created_at,
    }));
    downloadCsv(`gdpr-deletion-log-${new Date().toISOString().slice(0,10)}.csv`, toCsv(rows));
  };

  const startAudit = async () => {
    setBusy("audit");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("compliance_audits").insert({
        user_id: user.id,
        records_reviewed: stale.length,
      });
      toast.success("Audit started — review records below");
    } finally { setBusy(null); }
  };

  return (
    <div className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Compliance</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        GDPR-aware tools to honour Do Not Contact and data deletion requests across Desky.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Do Not Contact records" value={cl ? "—" : counts?.dncTotal ?? 0} />
        <Stat label="Deletion requests completed" value={counts?.deletions ?? 0} />
        <Stat label="Last data audit" value={lastAuditDate} />
        <Stat label="Next audit due" value={nextDue} />
      </div>

      {stale.length >= 1 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
          <div className="flex items-center gap-2 font-medium text-amber-500">
            <FileWarning className="h-4 w-4" />
            GDPR Data Audit — Action Suggested
          </div>
          <p className="text-amber-200/90 text-xs leading-relaxed">
            You have <span className="font-semibold">{stale.length}</span> candidate{stale.length === 1 ? "" : "s"} who have not been
            updated in 24+ months. Under GDPR you should review whether you have a legitimate reason to retain their data.
          </p>
          <Button size="sm" variant="outline" disabled={busy === "audit"} onClick={startAudit}>
            {busy === "audit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start audit"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportDnc} disabled={busy === "dnc"}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Do Not Contact list (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportDeletions}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Deletion log (CSV)
        </Button>
      </div>

      {log.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">When</th>
                <th className="text-left px-3 py-2 font-medium">Action</th>
                <th className="text-left px-3 py-2 font-medium">Entity</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 20).map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{new Date(l.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-1.5">{prettyAction(l.action)}</td>
                  <td className="px-3 py-1.5">{l.entity_name_snapshot ?? `${l.entity_type}: ${l.entity_id.slice(0,8)}`}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function prettyAction(a: string) {
  switch (a) {
    case "dnc_enabled": return "Do Not Contact set";
    case "dnc_disabled": return "Do Not Contact removed";
    case "gdpr_deleted": return "GDPR deletion";
    case "audit_kept": return "Audit — kept";
    case "audit_archived": return "Audit — archived";
    case "audit_deleted": return "Audit — deleted";
    default: return a;
  }
}
