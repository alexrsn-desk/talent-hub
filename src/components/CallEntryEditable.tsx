import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SignalBox } from "@/components/SignalBox";
import { useSignalsForNote, useDetectSignals } from "@/hooks/use-signals";
import { useUpdateNote, type Note } from "@/hooks/use-data";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import {
  Phone, Clock, ChevronDown, ChevronRight, Pencil, X, Save,
} from "lucide-react";

const OUTCOMES = ["Spoke", "Voicemail", "No Answer"] as const;

interface CallEntryEditableProps {
  note: Note;
  signalCount: number;
}

export function CallEntryEditable({ note, signalCount }: CallEntryEditableProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  // Edit state
  const [editContent, setEditContent] = useState(note.content);
  const [editOutcome, setEditOutcome] = useState(note.outcome || "");
  const [editDuration, setEditDuration] = useState(note.duration?.toString() || "");
  const [editTranscript, setEditTranscript] = useState(note.transcript || "");
  const [editFollowUp, setEditFollowUp] = useState(note.follow_up_date || "");

  const updateNote = useUpdateNote();
  const detectSignals = useDetectSignals();

  const isManualLog = !note.transcript;
  const outcomeColor: Record<string, string> = {
    Spoke: "bg-success/20 text-green-400",
    Voicemail: "bg-yellow-500/20 text-yellow-400",
    "No Answer": "bg-red-500/20 text-red-400",
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(note.content);
    setEditOutcome(note.outcome || "");
    setEditDuration(note.duration?.toString() || "");
    setEditTranscript(note.transcript || "");
    setEditFollowUp(note.follow_up_date || "");
    setEditing(true);
    setExpanded(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    const updates: any = {};
    const changes: string[] = [];

    if (editContent !== note.content) { updates.content = editContent; changes.push("notes"); }
    if (editOutcome !== (note.outcome || "")) { updates.outcome = editOutcome || null; changes.push("outcome"); }
    if (editDuration !== (note.duration?.toString() || "")) { updates.duration = editDuration ? parseInt(editDuration) : null; changes.push("duration"); }
    if (editTranscript !== (note.transcript || "")) { updates.transcript = editTranscript || null; changes.push("transcript"); }
    if (editFollowUp !== (note.follow_up_date || "")) { updates.follow_up_date = editFollowUp || null; changes.push("follow_up_date"); }

    if (changes.length === 0) { setEditing(false); return; }

    await updateNote.mutateAsync({ id: note.id, ...updates });

    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    await logActivity({
      action_type: "note_created",
      candidate_id: note.candidate_id,
      client_id: note.client_id,
      job_id: note.job_id,
      metadata: { edit: true, message: `Call record edited — ${dateStr}`, fields_updated: changes },
    });

    // Re-run signal detection if content or transcript changed
    if (changes.includes("notes") || changes.includes("transcript")) {
      detectSignals.mutate({ noteId: note.id });
    }

    setEditing(false);
    toast.success("Call record updated");
  };

  return (
    <div className="rounded-md bg-muted/30 border border-border/50 overflow-hidden">
      {/* Header row */}
      <div
        className="w-full flex gap-2.5 items-center px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => !editing && setExpanded(!expanded)}
      >
        <Phone className="h-3.5 w-3.5 text-green-400 shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {new Date(note.created_at).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {note.duration && !editing && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" /> {note.duration}m
            </span>
          )}
          {note.outcome && !editing && (
            <Badge variant="secondary" className={`text-[10px] h-5 ${outcomeColor[note.outcome] || ""}`}>
              {note.outcome}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] h-5 bg-muted">
            {isManualLog ? "Manual" : "Recorded"}
          </Badge>
          {signalCount > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
              {signalCount} signal{signalCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {!editing && (
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={startEdit} title="Edit call record">
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        {!editing && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        )}
      </div>

      {/* Collapsed preview */}
      {!expanded && !editing && note.content && (
        <div className="px-3 pb-2 pl-9">
          <p className="text-sm text-muted-foreground truncate">{note.content}</p>
        </div>
      )}

      {/* Expanded — edit mode */}
      {editing && (
        <div className="px-3 pb-3 pl-9 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Duration (min)</label>
              <Input
                type="number"
                value={editDuration}
                onChange={e => setEditDuration(e.target.value)}
                className="h-7 w-20 text-sm"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Outcome</label>
              <Select value={editOutcome} onValueChange={setEditOutcome}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Follow-up</label>
              <Input
                type="date"
                value={editFollowUp}
                onChange={e => setEditFollowUp(e.target.value)}
                className="h-7 w-[140px] text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Transcript</label>
            <Textarea
              value={editTranscript}
              onChange={e => setEditTranscript(e.target.value)}
              className="min-h-[80px] text-xs resize-none font-mono"
              placeholder="Paste or edit transcript..."
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={updateNote.isPending} className="gap-1">
              <Save className="h-3 w-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="gap-1">
              <X className="h-3 w-3" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Expanded — view mode */}
      {expanded && !editing && (
        <div className="px-3 pb-3 pl-9 space-y-3">
          {note.content && (
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
          )}
          {note.follow_up_date && (
            <p className="text-xs text-warning">
              Follow-up: {new Date(note.follow_up_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
          <CallExpandedContent note={note} />
        </div>
      )}
    </div>
  );
}

// Expanded content — transcript (click-to-edit) + signals
function CallExpandedContent({ note }: { note: Note }) {
  const { data: signals = [], isLoading } = useSignalsForNote(note.id);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(note.transcript || "");
  const updateNote = useUpdateNote();
  const detectSignals = useDetectSignals();

  const saveTranscript = async () => {
    if (transcriptDraft === (note.transcript || "")) { setEditingTranscript(false); return; }
    await updateNote.mutateAsync({ id: note.id, transcript: transcriptDraft || null });
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    await logActivity({
      action_type: "note_created",
      candidate_id: note.candidate_id,
      client_id: note.client_id,
      job_id: note.job_id,
      metadata: { edit: true, message: `Call record edited — ${dateStr}`, fields_updated: ["transcript"] },
    });
    detectSignals.mutate({ noteId: note.id });
    setEditingTranscript(false);
    toast.success("Transcript updated");
  };

  return (
    <>
      {(note.transcript || editingTranscript) && (
        <Collapsible open={transcriptOpen || editingTranscript} onOpenChange={v => { if (!editingTranscript) setTranscriptOpen(v); }}>
          <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
            {(transcriptOpen || editingTranscript) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Read full transcript
          </CollapsibleTrigger>
          {!transcriptOpen && !editingTranscript && note.transcript && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
              {note.transcript.split("\n").slice(0, 3).join("\n")}…
            </p>
          )}
          <CollapsibleContent>
            {editingTranscript ? (
              <div className="mt-1 space-y-2">
                <Textarea
                  value={transcriptDraft}
                  onChange={e => setTranscriptDraft(e.target.value)}
                  className="min-h-[100px] text-xs font-mono resize-none"
                  onKeyDown={e => { if (e.key === "Escape") { setEditingTranscript(false); setTranscriptDraft(note.transcript || ""); } }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveTranscript} disabled={updateNote.isPending} className="h-6 text-xs gap-1">
                    <Save className="h-3 w-3" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingTranscript(false); setTranscriptDraft(note.transcript || ""); }} className="h-6 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap cursor-pointer hover:bg-muted/30 rounded p-1 -m-1 transition-colors group/transcript"
                onClick={() => { setTranscriptDraft(note.transcript || ""); setEditingTranscript(true); }}
                title="Click to edit transcript"
              >
                {note.transcript}
                <Pencil className="h-3 w-3 inline ml-1 opacity-0 group-hover/transcript:opacity-100 transition-opacity text-muted-foreground" />
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
      {(signals.length > 0 || isLoading) && (
        <div className="pt-1">
          <SignalBox signals={signals} loading={isLoading} />
        </div>
      )}
    </>
  );
}
