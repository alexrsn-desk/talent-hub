import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Hand, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const LAUNCH_ITEMS = [
  { key: "job_ad", label: "Job Ad / Description Published", hint: "Job spec posted to job boards or careers site" },
  { key: "linkedin_post", label: "LinkedIn Post", hint: "Personal LinkedIn post announcing the role" },
  { key: "candidate_messages", label: "Candidate Messages", hint: "Personal outreach to known / warm candidates" },
  { key: "linkedin_dms", label: "LinkedIn DMs", hint: "Direct messages to LinkedIn / wider network prospects" },
  { key: "campaign", label: "Campaign Email", hint: "Broader outreach campaign to a candidate list" },
  { key: "client_confirmation", label: "Client Confirmation", hint: "Confirmation email to client that search has kicked off" },
] as const;

type ItemKey = typeof LAUNCH_ITEMS[number]["key"];

type Row = {
  id: string;
  item_key: ItemKey;
  status: "not_started" | "done";
  completed_via: "wizard" | "manual" | null;
  completed_at: string | null;
  completed_by: string | null;
  note: string | null;
  launch_id: string | null;
  updated_at: string;
};

export function LaunchStatusSection({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [promptItem, setPromptItem] = useState<ItemKey | null>(null);
  const [promptNote, setPromptNote] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("job_launch_items" as any)
      .select("*")
      .eq("job_id", jobId);
    const map: Record<string, Row> = {};
    (data as any[] | null)?.forEach((r) => { map[r.item_key] = r as Row; });
    setRows(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, [jobId]);

  async function markManual(item: ItemKey, note: string) {
    setSaving(item);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in"); setSaving(null); return; }
    const existing = rows[item];
    const payload = {
      owner_user_id: user.id,
      job_id: jobId,
      item_key: item,
      status: "done" as const,
      completed_via: "manual" as const,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      note: note || null,
      launch_id: null,
    };
    let err;
    if (existing) {
      ({ error: err } = await supabase.from("job_launch_items" as any).update(payload).eq("id", existing.id));
    } else {
      ({ error: err } = await supabase.from("job_launch_items" as any).insert(payload));
    }
    setSaving(null);
    if (err) { toast.error(err.message); return; }
    toast.success("Marked as done");
    await load();
  }

  async function unmark(item: ItemKey) {
    const existing = rows[item];
    if (!existing) return;
    setSaving(item);
    const { error } = await supabase.from("job_launch_items" as any)
      .update({ status: "not_started", completed_via: null, completed_at: null, note: null, launch_id: null })
      .eq("id", existing.id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    await load();
  }

  function onToggle(item: ItemKey, checked: boolean) {
    const existing = rows[item];
    if (checked) {
      setPromptItem(item);
      setPromptNote(existing?.note || "");
    } else {
      unmark(item);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Launch Status</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Which launch outputs are complete — auto-ticked when done via the Job Launch wizard, or tick manually if done off-platform.
      </p>

      <ul className="divide-y divide-border">
        {LAUNCH_ITEMS.map((it) => {
          const row = rows[it.key];
          const done = row?.status === "done";
          const via = row?.completed_via;
          return (
            <li key={it.key} className="py-2.5 flex items-start gap-3">
              <Checkbox
                checked={done}
                disabled={saving === it.key}
                onCheckedChange={(v) => onToggle(it.key, !!v)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{it.label}</span>
                  {done && via === "wizard" && (
                    <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                      <Sparkles className="h-3 w-3" /> via Job Launch
                    </Badge>
                  )}
                  {done && via === "manual" && (
                    <Badge variant="outline" className="gap-1 text-[10px] h-5">
                      <Hand className="h-3 w-3" /> Marked manually
                    </Badge>
                  )}
                  {!done && (
                    <Badge variant="outline" className="gap-1 text-[10px] h-5 text-muted-foreground">
                      <Circle className="h-2.5 w-2.5" /> Not started
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>
                {done && row?.completed_at && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(row.completed_at), { addSuffix: true })}
                    {row.note && <span className="italic"> — “{row.note}”</span>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!promptItem} onOpenChange={(o) => !o && setPromptItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as done manually</DialogTitle>
            <DialogDescription>
              Add an optional note about how this was completed (e.g. "posted directly on LinkedIn, not through Desky").
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={promptNote}
            onChange={(e) => setPromptNote(e.target.value)}
            placeholder="Optional note…"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPromptItem(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!promptItem) return;
                const item = promptItem;
                const note = promptNote.trim();
                setPromptItem(null);
                setPromptNote("");
                await markManual(item, note);
              }}
            >
              Mark done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
