import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Loader2, MessageSquare, PhoneCall, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type DecayAlert,
  decayStatusLabel,
  useResolveDecayAlert,
  useSnoozeDecayAlert,
} from "@/hooks/use-decay";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";

interface Props {
  alert: DecayAlert;
  entityName: string;
  company?: string | null;
  /** For contact-type alerts, the parent client id so we can log a touchpoint */
  clientId?: string | null;
  compact?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  matching_candidates: "Matching candidates",
  previous_context: "Previous conversation",
  market_intel: "Market intel",
  candidate_intel: "Candidate intel",
  bd_signal: "BD signal",
};

export function DecayAlertCard({ alert, entityName, company, clientId, compact }: Props) {
  const meta = decayStatusLabel(alert.status);
  const snooze = useSnoozeDecayAlert();
  const resolve = useResolveDecayAlert();
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const channelGuess = (alert.channel_suggestion || "").toLowerCase().includes("whatsapp")
    ? "WhatsApp"
    : (alert.channel_suggestion || "").toLowerCase().includes("call")
      ? "Phone"
      : (alert.channel_suggestion || "").toLowerCase().includes("linkedin")
        ? "LinkedIn"
        : "Email";

  const handleDraft = async () => {
    if (!alert.reason) return;
    setDrafting(true);
    setDraftOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-decay-message", {
        body: {
          entity_name: entityName,
          company,
          channel: channelGuess,
          reason: alert.reason,
          approach: alert.suggested_approach,
          days_since_contact: alert.days_since_contact,
        },
      });
      if (error) throw error;
      setDraft(data?.message || "");
    } catch (e: any) {
      toast.error(e?.message || "Could not draft message");
    } finally {
      setDrafting(false);
    }
  };

  const handleSnooze = async (days: number) => {
    await snooze.mutateAsync({ id: alert.id, days });
    toast.success(`Snoozed for ${days === 7 ? "1 week" : days === 14 ? "2 weeks" : "1 month"}`);
  };

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} p-3 sm:p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
              {meta.dot} {meta.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Last contact: {alert.days_since_contact} days ago
            </span>
            {alert.reason_source && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                {SOURCE_LABELS[alert.reason_source] || alert.reason_source}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold truncate">
            {entityName}{company ? ` — ${company}` : ""}
          </div>
        </div>
      </div>

      {alert.reason && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Why now is a good time</div>
            <div className="text-sm leading-snug mt-0.5">{alert.reason}</div>
          </div>
          {alert.suggested_approach && !compact && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Suggested approach</div>
              <div className="text-sm text-foreground/90 mt-0.5">{alert.suggested_approach}</div>
            </div>
          )}
          {alert.channel_suggestion && !compact && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Channel</div>
              <div className="text-sm text-foreground/90 mt-0.5">{alert.channel_suggestion}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="default" onClick={() => setLogOpen(true)} className="gap-1">
          <PhoneCall className="h-3.5 w-3.5" /> Log touchpoint
        </Button>
        <Button size="sm" variant="outline" onClick={handleDraft} className="gap-1">
          <Sparkles className="h-3.5 w-3.5" /> Draft with AI
        </Button>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => handleSnooze(7)} className="gap-1 text-xs">
            <CalendarClock className="h-3 w-3" /> 1w
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleSnooze(14)} className="gap-1 text-xs">
            <CalendarClock className="h-3 w-3" /> 2w
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleSnooze(30)} className="gap-1 text-xs">
            <CalendarClock className="h-3 w-3" /> 1m
          </Button>
        </div>
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Draft message — {entityName}
            </DialogTitle>
          </DialogHeader>
          {drafting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(draft);
                toast.success("Copied to clipboard");
              }}
              disabled={!draft}
            >
              Copy
            </Button>
            <Button onClick={handleDraft} disabled={drafting} variant="ghost">
              Re-draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogTouchpointModal
        open={logOpen}
        onOpenChange={(o) => {
          setLogOpen(o);
          if (!o) resolve.mutate(alert.id);
        }}
        entityType="client"
        entityId={
          alert.entity_type === "client" ? alert.entity_id : (clientId || alert.entity_id)
        }
        entityName={entityName}
      />
    </div>
  );
}
