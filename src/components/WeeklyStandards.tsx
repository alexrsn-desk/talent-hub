import { useMemo, useState } from "react";
import {
  useWeeklyStandards,
  useUpdateCheckin,
  useUpdateTargets,
  useResetDefaults,
  type CategoryPlate,
  type StandardProgress,
} from "@/hooks/use-weekly-standards";
import { Loader2, Minus, Plus, Check, ChevronDown, Settings2, Sparkles, Hand, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const COL = {
  bg: "rgba(255,255,255,0.02)",
  border: "rgba(255,255,255,0.06)",
  text: "#F3F6FB",
  muted: "#9AA4B2",
  dim: "#6B7280",
  green: "#27AE60",
  amber: "#F5A623",
  red: "#E74C3C",
  blue: "#3B82F6",
};

function toneFor(item: StandardProgress) {
  if (item.pct >= 1) return COL.green;
  if (item.criticallyBehind) return COL.red;
  if (item.behindPace) return COL.amber;
  return COL.blue;
}

function plateTone(p: CategoryPlate) {
  if (p.avgPct >= 1) return COL.green;
  if (p.criticallyBehind) return COL.red;
  if (p.behindPace) return COL.amber;
  return COL.blue;
}

function Ring({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 400ms ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize="13" fontWeight={700} fill={color}>
        {Math.round(p * 100)}%
      </text>
    </svg>
  );
}

function Trend({ history }: { history: { weekStart: string; pct: number }[] }) {
  if (!history?.length) return null;
  return (
    <div className="flex items-end gap-0.5 h-4">
      {history.map((h, i) => {
        const p = Math.max(0.06, Math.min(1, h.pct));
        const isCurrent = i === history.length - 1;
        const c = h.pct >= 1 ? COL.green : h.pct >= 0.7 ? COL.blue : h.pct >= 0.4 ? COL.amber : COL.red;
        return (
          <div
            key={h.weekStart}
            title={`${h.weekStart} · ${Math.round(h.pct * 100)}%`}
            className="w-1 rounded-sm"
            style={{ height: `${p * 100}%`, background: c, opacity: isCurrent ? 1 : 0.6 }}
          />
        );
      })}
    </div>
  );
}

function CalmItemRow({
  item,
  onSetValue,
}: {
  item: StandardProgress;
  onSetValue: (v: number) => void;
}) {
  const t = item.target;
  const isBool = t.unit === "boolean";
  const isAuto = t.tracking_mode === "auto";

  return (
    <div className="flex items-center gap-3 px-2.5 py-2 rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] truncate" style={{ color: COL.text }}>{t.label}</span>
          <span
            className="text-[9px] px-1.5 py-[1px] rounded uppercase tracking-wide font-semibold"
            style={{
              background: isAuto ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.06)",
              color: isAuto ? COL.blue : COL.muted,
            }}
            title={isAuto ? "Calculated automatically" : "Manual self-check"}
          >
            {isAuto ? (<><Sparkles className="h-2.5 w-2.5 inline mr-0.5" />auto</>) : (<><Hand className="h-2.5 w-2.5 inline mr-0.5" />manual</>)}
          </span>
        </div>
      </div>

      {!isAuto && isBool ? (
        <button
          onClick={() => onSetValue(item.actual >= 1 ? 0 : 1)}
          className="h-7 w-7 rounded-md flex items-center justify-center"
          style={{
            background: item.actual >= 1 ? COL.green : "rgba(255,255,255,0.05)",
            color: item.actual >= 1 ? "#0F1724" : COL.muted,
          }}
          aria-label="Toggle done"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      ) : !isAuto ? (
        <div className="flex items-center gap-1">
          <button
            className="h-6 w-6 rounded flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", color: COL.muted }}
            onClick={() => onSetValue(Math.max(0, item.actual - 1))}
            aria-label="Decrease"
          ><Minus className="h-3 w-3" /></button>
          <div className="w-6 text-center text-[12px] font-semibold" style={{ color: COL.text }}>{item.actual}</div>
          <button
            className="h-6 w-6 rounded flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.2)", color: COL.blue }}
            onClick={() => onSetValue(item.actual + 1)}
            aria-label="Increase"
          ><Plus className="h-3 w-3" /></button>
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  history,
  onSetValue,
}: {
  item: StandardProgress;
  history: { weekStart: string; pct: number }[];
  onSetValue: (v: number) => void;
}) {
  const t = item.target;
  const isBool = t.unit === "boolean";
  const isPercent = t.unit === "percent";
  const isAuto = t.tracking_mode === "auto";
  const tone = toneFor(item);
  const done = item.pct >= 1;

  const displayActual = isPercent ? `${Math.round(item.actual)}%` : String(item.actual);
  const displayTarget = isPercent ? `${t.target_value}%` : String(t.target_value);

  return (
    <div
      className="flex items-center gap-3 px-2.5 py-2 rounded-md"
      style={{
        background: done ? "rgba(39,174,96,0.06)" : item.behindPace ? "rgba(231,76,60,0.05)" : "transparent",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] truncate" style={{ color: COL.text }}>{t.label}</span>
          <span
            className="text-[9px] px-1.5 py-[1px] rounded uppercase tracking-wide font-semibold"
            style={{
              background: isAuto ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.06)",
              color: isAuto ? COL.blue : COL.muted,
            }}
            title={isAuto ? "Calculated automatically" : "Manual self-check"}
          >
            {isAuto ? (<><Sparkles className="h-2.5 w-2.5 inline mr-0.5" />auto</>) : (<><Hand className="h-2.5 w-2.5 inline mr-0.5" />manual</>)}
          </span>
        </div>
        <div className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: COL.muted }}>
          <span style={{ color: tone, fontWeight: 600 }}>{displayActual}</span>
          <span>/ {displayTarget}</span>
          {!isPercent && item.behindPace && !done && (
            <span style={{ color: COL.amber }}>· behind pace</span>
          )}
        </div>
      </div>

      <Trend history={history} />

      {isAuto ? (
        <div className="text-[10px] px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.04)", color: COL.dim }}>
          live
        </div>
      ) : isBool ? (
        <button
          onClick={() => onSetValue(item.actual >= 1 ? 0 : 1)}
          className="h-7 w-7 rounded-md flex items-center justify-center"
          style={{
            background: item.actual >= 1 ? COL.green : "rgba(255,255,255,0.05)",
            color: item.actual >= 1 ? "#0F1724" : COL.muted,
          }}
          aria-label="Toggle done"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            className="h-6 w-6 rounded flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", color: COL.muted }}
            onClick={() => onSetValue(Math.max(0, item.actual - 1))}
            aria-label="Decrease"
          ><Minus className="h-3 w-3" /></button>
          <div className="w-6 text-center text-[12px] font-semibold" style={{ color: COL.text }}>{item.actual}</div>
          <button
            className="h-6 w-6 rounded flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.2)", color: COL.blue }}
            onClick={() => onSetValue(item.actual + 1)}
            aria-label="Increase"
          ><Plus className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  );
}

function Plate({
  plate,
  history,
  expanded,
  showProgress,
  onToggle,
  onSetValue,
}: {
  plate: CategoryPlate;
  history: Record<string, { weekStart: string; pct: number }[]>;
  expanded: boolean;
  showProgress: boolean;
  onToggle: () => void;
  onSetValue: (key: string, v: number) => void;
}) {
  const tone = plateTone(plate);
  const wobble = showProgress && plate.criticallyBehind;
  const dim = showProgress && plate.behindPace && plate.avgPct < 0.5;
  const componentNames = plate.items.map((i) => i.target.label).join(" · ");

  return (
    <div
      className={`rounded-xl transition-all ${wobble ? "animate-[wobble_2.2s_ease-in-out_infinite]" : ""}`}
      style={{
        background: COL.bg,
        border: `1px solid ${showProgress && plate.behindPace ? tone + "55" : COL.border}`,
        opacity: dim ? 0.72 : 1,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {showProgress && <Ring pct={plate.avgPct} color={tone} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: COL.text }}>
              {plate.label}
            </div>
            {showProgress && plate.criticallyBehind && (
              <span className="text-[10px] px-1.5 py-[1px] rounded font-semibold" style={{ background: COL.red + "22", color: COL.red }}>
                slipping
              </span>
            )}
            {showProgress && plate.avgPct >= 1 && (
              <span className="text-[10px] px-1.5 py-[1px] rounded font-semibold" style={{ background: COL.green + "22", color: COL.green }}>
                on target
              </span>
            )}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: COL.muted }}>
            {showProgress
              ? `${plate.items.filter((i) => i.pct >= 1).length}/${plate.items.length} targets hit`
              : componentNames}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 transition-transform" style={{ color: COL.dim, transform: expanded ? "rotate(180deg)" : "none" }} />
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-0.5" style={{ borderTop: `1px solid ${COL.border}` }}>
          <div className="h-2" />
          {plate.items.length === 0 ? (
            <div className="text-[11px] px-2 py-2" style={{ color: COL.dim }}>No targets configured.</div>
          ) : (
            plate.items.map((it) =>
              showProgress ? (
                <ItemRow
                  key={it.target.key}
                  item={it}
                  history={history[it.target.key] || []}
                  onSetValue={(v) => onSetValue(it.target.key, v)}
                />
              ) : (
                <CalmItemRow
                  key={it.target.key}
                  item={it}
                  onSetValue={(v) => onSetValue(it.target.key, v)}
                />
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

export function WeeklyStandards() {
  const { data, isLoading } = useWeeklyStandards(6);
  const setVal = useUpdateCheckin();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const behindPlates = useMemo(() => (data?.plates || []).filter((p) => p.behindPace).length, [data]);
  const total = data?.plates.length || 0;

  const weekLabel = useMemo(() => {
    if (!data?.weekStart) return "";
    const d = new Date(data.weekStart + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [data?.weekStart]);

  if (isLoading || !data) {
    return (
      <div className="px-6 pt-4">
        <div className="h-24 rounded-xl flex items-center justify-center" style={{ background: COL.bg, border: `1px solid ${COL.border}` }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: COL.muted }} />
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes wobble {
          0%, 100% { transform: translateX(0) rotate(0); }
          20% { transform: translateX(-2px) rotate(-0.4deg); }
          40% { transform: translateX(2px) rotate(0.4deg); }
          60% { transform: translateX(-1px) rotate(-0.2deg); }
          80% { transform: translateX(1px) rotate(0.2deg); }
        }
      `}</style>
      <div className="px-6 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COL.text }}>
              Weekly standards
            </div>
            <div className="text-[11px]" style={{ color: COL.dim }}>
              Week of {weekLabel} ·
              {behindPlates === 0 ? (
                <span style={{ color: COL.green }}> on pace across the board</span>
              ) : (
                <span style={{ color: COL.amber }}> {behindPlates}/{total} plates behind pace</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[11px] px-2 py-1 rounded inline-flex items-center gap-1"
            style={{ background: "rgba(255,255,255,0.04)", color: COL.muted }}
          >
            <Settings2 className="h-3 w-3" /> Targets
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.plates.map((p) => (
            <Plate
              key={p.category}
              plate={p}
              history={data.history}
              expanded={!!expanded[p.category]}
              onToggle={() => setExpanded((e) => ({ ...e, [p.category]: !e[p.category] }))}
              onSetValue={(key, v) => setVal.mutate({ target_key: key, value: v }, {
                onError: (err: any) => toast.error(err?.message || "Failed to save"),
              })}
            />
          ))}
        </div>
      </div>

      <TargetSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function TargetSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useWeeklyStandards(1);
  const update = useUpdateTargets();
  const reset = useResetDefaults();
  const [draft, setDraft] = useState<Record<string, { target_value: number; enabled: boolean }>>({});

  const targets = data?.targets || [];

  const getDraft = (key: string, fallback: { target_value: number; enabled: boolean }) =>
    draft[key] || fallback;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Weekly targets</DialogTitle>
          <DialogDescription>
            Edit the number for each target, or turn a target off. Auto-tracked targets are calculated from Desky data — you can't check those manually. Manual targets never auto-complete.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2">
          {(["marketing", "bd", "candidates", "jobs"] as const).map((cat) => {
            const list = targets.filter((t) => t.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{cat}</div>
                <div className="space-y-1.5">
                  {list.map((t) => {
                    const d = getDraft(t.key, { target_value: Number(t.target_value), enabled: t.enabled });
                    return (
                      <div key={t.key} className="flex items-center gap-3 rounded-md border px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{t.label}</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                            {t.tracking_mode === "auto" ? "auto-tracked" : "manual check-in"} · {t.unit}
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={d.target_value}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [t.key]: { ...d, target_value: Number(e.target.value) },
                            }))
                          }
                          className="w-20 h-8"
                        />
                        <Switch
                          checked={d.enabled}
                          onCheckedChange={(v) =>
                            setDraft((prev) => ({ ...prev, [t.key]: { ...d, enabled: v } }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => reset.mutate(undefined, {
              onSuccess: () => { setDraft({}); toast.success("Reset to suggested defaults"); },
              onError: (e: any) => toast.error(e?.message || "Failed"),
            })}
            disabled={reset.isPending}
          >
            {reset.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Reset to defaults
          </Button>
          <Button
            onClick={() => {
              const updates = Object.entries(draft).map(([key, v]) => ({
                key,
                target_value: v.target_value,
                enabled: v.enabled,
              }));
              if (updates.length === 0) { onOpenChange(false); return; }
              update.mutate(updates, {
                onSuccess: () => { setDraft({}); onOpenChange(false); toast.success("Targets saved"); },
                onError: (e: any) => toast.error(e?.message || "Failed"),
              });
            }}
            disabled={update.isPending}
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
