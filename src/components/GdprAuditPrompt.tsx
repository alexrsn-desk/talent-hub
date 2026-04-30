import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComplianceAudits, useStaleCandidates } from "@/hooks/use-compliance";

/**
 * Surfaces the 6-monthly GDPR audit prompt on the dashboard when:
 * - There are stale (24m+) candidates AND
 * - No audit has been completed in the last 6 months
 */
export function GdprAuditPrompt() {
  const { data: stale = [] } = useStaleCandidates();
  const { data: audits = [] } = useComplianceAudits();

  const last = audits[0];
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentlyAudited =
    last && (last.completed_at ? new Date(last.completed_at) > sixMonthsAgo : new Date(last.started_at) > sixMonthsAgo);

  if (recentlyAudited || stale.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-300">GDPR Data Audit — Action Required</h3>
      </div>
      <p className="text-xs text-amber-200/90 leading-relaxed">
        You have <span className="font-semibold">{stale.length}</span> candidate{stale.length === 1 ? "" : "s"} who have
        not been contacted in 24+ months. Under GDPR you should review whether you have a legitimate reason to retain
        their data.
      </p>
      <Link to="/settings">
        <Button size="sm" variant="outline">Review records</Button>
      </Link>
    </div>
  );
}
