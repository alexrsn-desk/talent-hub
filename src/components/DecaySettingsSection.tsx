import { useEffect, useState } from "react";
import { Heart, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDecaySettings, useSaveDecaySettings, useRunDecayScan } from "@/hooks/use-decay";
import { toast } from "sonner";

export function DecaySettingsSection() {
  const { data, isLoading } = useDecaySettings();
  const save = useSaveDecaySettings();
  const scan = useRunDecayScan();
  const [form, setForm] = useState({
    enabled: true,
    threshold_key: 21,
    threshold_active: 14,
    threshold_bd: 30,
    threshold_general: 60,
  });

  useEffect(() => {
    if (data) setForm({
      enabled: data.enabled,
      threshold_key: data.threshold_key,
      threshold_active: data.threshold_active,
      threshold_bd: data.threshold_bd,
      threshold_general: data.threshold_general,
    });
  }, [data]);

  const handleSave = async () => {
    await save.mutateAsync(form);
    toast.success("Decay settings saved");
  };

  return (
    <div className="pt-6 border-t border-border space-y-3">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-400" />
        <h2 className="text-sm font-medium">Relationship decay alerts</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Alerts only surface once the AI has a genuine reason to make contact —
        never just a reminder to check in.
      </p>

      <div className="flex items-center gap-2 pt-2">
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => setForm({ ...form, enabled: v })}
        />
        <span className="text-sm">Enabled</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <ThresholdField
          label="Key Relationships"
          help="Highest sensitivity"
          value={form.threshold_key}
          onChange={(v) => setForm({ ...form, threshold_key: v })}
        />
        <ThresholdField
          label="Active Clients"
          help="Currently working roles together"
          value={form.threshold_active}
          onChange={(v) => setForm({ ...form, threshold_active: v })}
        />
        <ThresholdField
          label="BD Pipeline"
          help="Targets and prospects"
          value={form.threshold_bd}
          onChange={(v) => setForm({ ...form, threshold_bd: v })}
        />
        <ThresholdField
          label="General contacts"
          help="Lower sensitivity"
          value={form.threshold_general}
          onChange={(v) => setForm({ ...form, threshold_general: v })}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        <Button onClick={handleSave} disabled={save.isPending || isLoading} className="gap-1">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
          {scan.isPending ? "Scanning…" : "Run scan now"}
        </Button>
      </div>
    </div>
  );
}

function ThresholdField({
  label, help, value, onChange,
}: { label: string; help: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-[11px] text-muted-foreground">{help}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">days</span>
      </div>
    </div>
  );
}
