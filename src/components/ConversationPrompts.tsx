import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lightbulb, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PromptItem = { prompt: string; rationale?: string };
type PromptData = {
  empty?: boolean;
  message?: string;
  open_with?: PromptItem[];
  build_on?: PromptItem[];
  add_value_with?: PromptItem[];
  tone_guidance?: string;
  generated_at?: string;
};

interface Props {
  entityType: "client" | "contact";
  entityId: string;
  /** Bumps when notes/touchpoints/signals change so the user knows to refresh */
  signature?: string | number;
}

const STORAGE_PREFIX = "conv-prompts:";

export function ConversationPrompts({ entityType, entityId, signature }: Props) {
  const storageKey = `${STORAGE_PREFIX}${entityType}:${entityId}`;
  const openKey = `${storageKey}:open`;

  const [open, setOpen] = useState<boolean>(false);
  const [data, setData] = useState<PromptData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load cached open state + cached prompts
  useEffect(() => {
    try {
      const o = localStorage.getItem(openKey);
      if (o !== null) setOpen(o === "1");
      const cached = localStorage.getItem(storageKey);
      if (cached) setData(JSON.parse(cached));
    } catch {}
  }, [storageKey, openKey]);

  useEffect(() => {
    try {
      localStorage.setItem(openKey, open ? "1" : "0");
    } catch {}
  }, [open, openKey]);

  const generate = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "generate-conversation-prompts",
        { body: { entity_type: entityType, entity_id: entityId } },
      );
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setData(res);
      try {
        localStorage.setItem(storageKey, JSON.stringify(res));
      } catch {}
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Could not generate prompts");
    } finally {
      setLoading(false);
    }
  };

  const lastGen = data?.generated_at
    ? new Date(data.generated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card/50">
      <div className="flex items-center justify-between px-4 py-3">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity">
          <Lightbulb className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-medium">Conversation Prompts</span>
          {lastGen && <span className="text-xs text-muted-foreground ml-1">· last generated {lastGen}</span>}
          <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Personalised to this {entityType} based on notes, signals and recent activity.
            </p>
            <Button size="sm" variant={data ? "outline" : "default"} onClick={generate} disabled={loading} className="gap-1.5 shrink-0">
              {loading ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating...</>
              ) : data ? (
                <><RefreshCw className="h-3.5 w-3.5" /> Refresh</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Generate</>
              )}
            </Button>
          </div>

          {!data && !loading && (
            <p className="text-sm text-muted-foreground italic">
              Click Generate to create personalised conversation prompts.
            </p>
          )}

          {data?.empty && (
            <p className="text-sm text-muted-foreground italic">
              {data.message || "Add notes from your first conversation to generate personalised prompts."}
            </p>
          )}

          {data && !data.empty && (
            <div className="space-y-4">
              <PromptSection title="Open with" items={data.open_with} accent="text-primary" />
              <PromptSection title="Build on" items={data.build_on} accent="text-orange-400" />
              <PromptSection title="Add value with" items={data.add_value_with} accent="text-success" />
              {data.tone_guidance && (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Tone guidance</p>
                  <p className="text-sm">{data.tone_guidance}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PromptSection({ title, items, accent }: { title: string; items?: PromptItem[]; accent: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${accent}`}>{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="rounded-md border border-border/60 px-3 py-2 bg-background/50">
            <p className="text-sm leading-snug">{item.prompt}</p>
            {item.rationale && (
              <p className="text-xs text-muted-foreground mt-1 italic">{item.rationale}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
