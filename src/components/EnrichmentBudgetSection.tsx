import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEnrichmentUsage } from "@/hooks/use-company-intel";
import { Sparkles } from "lucide-react";

export function EnrichmentBudgetSection() {
  const { user } = useAuth();
  const { data: usage } = useEnrichmentUsage();
  const [budgetGbp, setBudgetGbp] = useState<string>("10.00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("enrichment_budget_pence")
        .eq("user_id", user.id).maybeSingle();
      const pence = (data as any)?.enrichment_budget_pence ?? 1000;
      setBudgetGbp((pence / 100).toFixed(2));
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const pence = Math.max(0, Math.round(parseFloat(budgetGbp) * 100));
    const { error } = await supabase
      .from("recruiter_profiles")
      .update({ enrichment_budget_pence: pence } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Enrichment budget saved");
  };

  const spentPence = usage?.spent_pence ?? 0;
  const budgetPence = Math.round(parseFloat(budgetGbp || "0") * 100);
  const pct = budgetPence ? Math.min(100, (spentPence / budgetPence) * 100) : 0;

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <h2 className="text-sm font-medium flex items-center gap-2">
        <Sparkles className="h-4 w-4" /> Company Intelligence budget
      </h2>
      <p className="text-xs text-muted-foreground">
        AI enrichment costs ~£0.04 per company. Bulk enrichment stops automatically when this monthly budget is reached.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs">Monthly budget (£)</Label>
          <Input
            type="number" min="0" step="1"
            value={budgetGbp}
            onChange={(e) => setBudgetGbp(e.target.value)}
            className="w-32"
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <div className="text-xs text-muted-foreground ml-auto">
          This month: £{(spentPence / 100).toFixed(2)} of £{budgetGbp} ({usage?.count ?? 0} enrichments)
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
