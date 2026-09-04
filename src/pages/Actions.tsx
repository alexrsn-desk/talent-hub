import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, ChevronDown, Clock, Loader2, MoreVertical, Phone, Quote, RefreshCw, Briefcase, CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { markItemDone, snoozeItem } from "@/hooks/use-billers-workflow";
import { useActionItems, type ActionItem, type ActionTone } from "@/hooks/use-action-items";
import { useResolveBriefItem } from "@/hooks/use-brief-items";
import { TodoList } from "@/components/TodoList";
import { cn } from "@/lib/utils";

const toneDot: Record<ActionTone, string> = {
  red: "bg-destructive",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
};

const toneBar: Record<ActionTone, string> = {
  red: "border-l-destructive",
  amber: "border-l-amber-500",
  green: "border-l-emerald-500",
};

function ActionRow({
  item, expanded, onToggle, onLog, onDone, onSnooze,
}: {
  item: ActionItem;
  expanded: boolean;
  onToggle: () => void;
  onLog: (it: ActionItem) => void;
  onDone: (it: ActionItem) => void;
  onSnooze: (it: ActionItem, days: 1 | 3 | 7) => void;
}) {
  const nav = useNavigate();
  const canLog = !!(item.logEntityType && item.logEntityId && item.logEntityName);

  return (
    <div className={cn("border-l-2", expanded ? toneBar[item.tone] : "border-l-transparent")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onToggle(); } }}
        className="group flex min-h-[42px] cursor-pointer items-center gap-3 px-3 transition-colors hover:bg-muted/40"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", toneDot[item.tone])} aria-hidden />
        <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:inline sm:w-[128px] truncate">
          {item.source}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
        <span className="hidden max-w-[34%] truncate text-[12px] text-muted-foreground md:inline">
          {item.why}
        </span>
        <div className="shrink-0 flex items-center gap-2 opacity-70 transition-opacity group-hover:opacity-100">
          {canLog && (
            <button
              onClick={(e) => { e.stopPropagation(); onLog(item); }}
              className="inline-flex items-center gap-1 text-[11px] hover:underline"
              title="Log a call or touchpoint"
            >
              <Phone className="h-3 w-3" /> Log
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDone(item); }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
          >
            <Check className="h-3 w-3" /> Done
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
                aria-label="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.href && (
                <>
                  <DropdownMenuItem onClick={() => nav(item.href!)}>Open</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSnooze(item, 1)}><Clock className="mr-2 h-3.5 w-3.5" /> 1 day</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 3)}><Clock className="mr-2 h-3.5 w-3.5" /> 3 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 7)}><Clock className="mr-2 h-3.5 w-3.5" /> 1 week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded ? "" : "-rotate-90")}
            aria-hidden
          />
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 px-6 pb-3 pt-1">
          {item.why && <p className="text-[12px] text-muted-foreground md:hidden">{item.why}</p>}
          {item.sourceQuote && (
            <div className="flex gap-2 rounded bg-muted/50 px-2.5 py-2 text-[12px] italic">
              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <div>
                “{item.sourceQuote}”
                {item.sourceLabel && (
                  <div className="mt-1 text-[10px] not-italic uppercase tracking-wide text-muted-foreground">
                    {item.sourceLabel}
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="text-[12px] font-medium text-primary">→ {item.action}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canLog && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => onLog(item)}>
                <Phone className="h-3 w-3" /> Call / log touchpoint
              </Button>
            )}
            {item.candidateId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                onClick={() => nav(`/candidates?candidateId=${item.candidateId}`)}
              >
                <Briefcase className="h-3 w-3" /> Add to job
              </Button>
            )}
            {item.href && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => nav(item.href!)}>
                Open
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => onDone(item)}>
              <Check className="h-3 w-3" /> Done
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => onSnooze(item, 3)}>
              <Clock className="h-3 w-3" /> Snooze 3 days
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActionsPage() {
  const { items, isLoading, isFetching, refetch } = useActionItems();
  const resolveBrief = useResolveBriefItem();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logItem, setLogItem] = useState<ActionItem | null>(null);

  const visible = useMemo(() => items.filter((i) => !hidden.has(i.id)), [items, hidden]);
  const urgent = visible.filter((i) => i.tone === "red").length;

  const hide = (id: string) => setHidden((prev) => new Set(prev).add(id));

  const handleDone = (it: ActionItem) => {
    markItemDone(it.id);
    if (it.briefItemId) resolveBrief.mutate(it.briefItemId);
    hide(it.id);
  };
  const handleSnooze = (it: ActionItem, days: 1 | 3 | 7) => {
    snoozeItem(it.id, days);
    hide(it.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Actions</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Everything worth doing, most urgent first{urgent > 0 ? ` — ${urgent} need attention today` : ""}.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      <section className="rounded-xl border border-border bg-card">
        {isLoading && visible.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
            <p className="text-sm font-medium">Nothing needs you right now.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Good moment to build the bench or open new conversations.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((it) => (
              <ActionRow
                key={it.id}
                item={it}
                expanded={expandedId === it.id}
                onToggle={() => setExpandedId((p) => (p === it.id ? null : it.id))}
                onLog={setLogItem}
                onDone={handleDone}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}
      </section>

      {/* Manual tasks stay alongside the generated list */}
      <TodoList />

      {logItem && logItem.logEntityType && logItem.logEntityId && logItem.logEntityName && (
        <LogTouchpointModal
          open={!!logItem}
          onOpenChange={(o) => {
            if (!o) {
              const current = logItem;
              setLogItem(null);
              handleDone(current);
              refetch();
            }
          }}
          entityType={logItem.logEntityType}
          entityId={logItem.logEntityId}
          entityName={logItem.logEntityName}
        />
      )}
    </div>
  );
}
