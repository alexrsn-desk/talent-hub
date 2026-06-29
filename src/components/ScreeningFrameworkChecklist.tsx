import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Sparkles, MessageSquare, Check } from "lucide-react";
import {
  FRAMEWORK_SECTIONS,
  sectionsCompleteCount,
} from "@/lib/screening-framework";
import {
  useScreeningFramework,
  useUpsertScreeningItem,
  useClearScreeningItem,
} from "@/hooks/use-screening-framework";
import { cn } from "@/lib/utils";

interface Props {
  candidateId: string;
  /** Compact mode renders tighter — used inside the Call Prep right panel. */
  compact?: boolean;
  defaultExpandedSection?: number;
}

export function ScreeningFrameworkChecklist({ candidateId, compact, defaultExpandedSection = 1 }: Props) {
  const { data: items = [], isLoading } = useScreeningFramework(candidateId);
  const upsert = useUpsertScreeningItem();
  const clear = useClearScreeningItem();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ [defaultExpandedSection]: true });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});

  const byKey = useMemo(() => {
    const m = new Map<string, typeof items[number]>();
    for (const it of items) m.set(it.item_key, it);
    return m;
  }, [items]);

  const completeness = sectionsCompleteCount(items.map((i) => ({ item_key: i.item_key, value: i.value })));

  const toggleChecked = async (section: number, key: string, currentlyChecked: boolean) => {
    if (currentlyChecked) {
      await clear.mutateAsync({ candidate_id: candidateId, item_key: key });
    } else {
      // Mark as captured with empty value placeholder so completeness still counts only when value present.
      // Use "✓ covered" as default value so the checkbox reflects that the recruiter covered it on the call.
      await upsert.mutateAsync({
        candidate_id: candidateId,
        section,
        item_key: key,
        value: "✓ covered",
        source: "manual",
      });
    }
  };

  const saveNote = async (section: number, key: string) => {
    const note = drafts[key] ?? byKey.get(key)?.notes ?? "";
    const existing = byKey.get(key);
    await upsert.mutateAsync({
      candidate_id: candidateId,
      section,
      item_key: key,
      value: existing?.value ?? "✓ covered",
      notes: note,
      source: "manual",
    });
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  return (
    <div className={cn("space-y-2", compact ? "" : "space-y-3")}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Screening Framework</h3>
        <Badge variant="outline" className="text-xs">
          {completeness.complete}/{completeness.total} sections
        </Badge>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {FRAMEWORK_SECTIONS.map((sec) => {
        const sectionItems = sec.items;
        const captured = sectionItems.filter((i) => !!byKey.get(i.key)).length;
        const allCovered = captured === sectionItems.length;
        const isOpen = !!expanded[sec.id];
        return (
          <Collapsible
            key={sec.id}
            open={isOpen}
            onOpenChange={(o) => setExpanded((p) => ({ ...p, [sec.id]: o }))}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full text-left rounded border border-border bg-muted/20 hover:bg-muted/30 px-2.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="text-sm font-medium truncate">{sec.id}. {sec.title}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {allCovered && <Check className="h-3.5 w-3.5 text-green-500" />}
                <span className="text-[11px] text-muted-foreground">{captured}/{sectionItems.length}</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1.5 pt-1.5 pb-2 space-y-1">
              {sec.caption && (
                <p className="text-[11px] text-muted-foreground italic px-1">{sec.caption}</p>
              )}
              {sectionItems.map((item) => {
                const row = byKey.get(item.key);
                const isChecked = !!row;
                const showAI = row?.source === "ai" || row?.source === "transcript";
                const showNote = !!showNotes[item.key] || (row?.notes && row.notes.length > 0);
                return (
                  <div key={item.key} className="rounded hover:bg-muted/20 px-1.5 py-1">
                    <label className="flex items-start gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleChecked(sec.id, item.key, isChecked)}
                        className="mt-0.5 shrink-0 h-4 w-4"
                      />
                      <span className={cn("flex-1 leading-snug", isChecked && "text-muted-foreground")}>
                        {item.label}
                        {showAI && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowNotes((p) => ({ ...p, [item.key]: !p[item.key] }));
                        }}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label="Add note"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    </label>
                    {row?.value && row.value !== "✓ covered" && (
                      <p className="ml-6 mt-0.5 text-[11px] text-foreground/80 whitespace-pre-wrap">{row.value}</p>
                    )}
                    {showNote && (
                      <div className="ml-6 mt-1 space-y-1">
                        <Textarea
                          value={drafts[item.key] ?? row?.notes ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                          placeholder="Jot a note for this point…"
                          className="text-xs min-h-[56px]"
                        />
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2"
                            onClick={() => saveNote(sec.id, item.key)}
                            disabled={upsert.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                            onClick={() => {
                              setShowNotes((p) => ({ ...p, [item.key]: false }));
                              setDrafts((d) => { const n = { ...d }; delete n[item.key]; return n; });
                            }}>
                            Close
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
