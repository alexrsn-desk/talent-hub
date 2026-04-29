import { useState, useEffect } from "react";
import { Settings2, Loader2, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSignalPreferences, useUpdateSignalPreferences } from "@/hooks/use-signal-preferences";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SIGNALS_BY_CATEGORY,
  SignalCategoryKey,
} from "@/lib/signal-categories";

export function SignalConfigurationSection() {
  const { data: prefs, isLoading } = useSignalPreferences();
  const update = useUpdateSignalPreferences();

  const [enabledCats, setEnabledCats] = useState<Record<SignalCategoryKey, boolean>>({
    revenue: true, pipeline: true, bd: true, admin: false, missing_action: true,
  });
  const [enabledSignals, setEnabledSignals] = useState<Record<string, boolean>>({});
  const [dailyLimit, setDailyLimit] = useState(8);
  const [showLow, setShowLow] = useState(false);
  const [expandedCat, setExpandedCat] = useState<SignalCategoryKey | null>(null);

  useEffect(() => {
    if (!prefs) return;
    setEnabledCats(prefs.enabled_categories);
    setEnabledSignals(prefs.enabled_signals);
    setDailyLimit(prefs.daily_limit);
    setShowLow(prefs.show_low_confidence);
  }, [prefs]);

  const handleSave = async () => {
    try {
      const limit = Math.max(3, Math.min(20, dailyLimit));
      await update.mutateAsync({
        enabled_categories: enabledCats,
        enabled_signals: enabledSignals,
        daily_limit: limit,
        show_low_confidence: showLow,
      });
      toast.success("Signal preferences saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  if (isLoading) {
    return (
      <div className="pt-6 border-t border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const categories = Object.keys(SIGNALS_BY_CATEGORY) as SignalCategoryKey[];

  return (
    <div className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Signal Configuration</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose which signals you want to see. Toggle whole categories or individual types.
      </p>

      {/* Daily limit + low confidence */}
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="text-sm font-medium">Daily signal limit</label>
            <p className="text-xs text-muted-foreground">
              We show your most urgent signals up to this limit. Others available via Show all.
            </p>
          </div>
          <Input
            type="number"
            min={3}
            max={20}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseInt(e.target.value) || 8)}
            className="w-20 text-center"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div>
            <label className="text-sm font-medium">Show low confidence signals</label>
            <p className="text-xs text-muted-foreground">
              By default we hide signals where the AI isn't confident. Turn this on to see them.
            </p>
          </div>
          <Switch checked={showLow} onCheckedChange={setShowLow} />
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((cat) => {
          const open = expandedCat === cat;
          const catOn = enabledCats[cat];
          return (
            <div key={cat} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-muted/20">
                <button
                  onClick={() => setExpandedCat(open ? null : cat)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                  <span className={`text-sm font-medium ${CATEGORY_COLORS[cat]}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({SIGNALS_BY_CATEGORY[cat].filter((s) => enabledSignals[s]).length}/
                    {SIGNALS_BY_CATEGORY[cat].length})
                  </span>
                </button>
                <Switch
                  checked={catOn}
                  onCheckedChange={(v) => setEnabledCats({ ...enabledCats, [cat]: v })}
                />
              </div>

              {open && (
                <div className={`p-3 space-y-2 ${!catOn ? "opacity-50 pointer-events-none" : ""}`}>
                  {SIGNALS_BY_CATEGORY[cat].map((sig) => (
                    <div key={sig} className="flex items-center justify-between text-sm">
                      <span>{sig}</span>
                      <Switch
                        checked={!!enabledSignals[sig]}
                        onCheckedChange={(v) =>
                          setEnabledSignals({ ...enabledSignals, [sig]: v })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={update.isPending} size="sm">
        {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Save signal preferences
      </Button>
    </div>
  );
}
