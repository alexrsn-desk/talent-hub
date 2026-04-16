import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotes, useCreateNote, type Note } from "@/hooks/use-data";
import { useSignalCounts } from "@/hooks/use-signals";
import { NoteCard } from "@/components/NoteCard";
import {
  Send, Phone, Mail, Users, MessageSquare, Globe, FileText, Smartphone, MessageCircle,
  PhoneCall, Clock, ChevronDown, ChevronRight,
} from "lucide-react";

const CALL_ACTIVITY_TYPES = ["Call"];

const NOTE_ACTIVITY_TYPES = [
  { value: "Note", label: "Note", icon: FileText },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Text Message", label: "Text", icon: Smartphone },
  { value: "WhatsApp", label: "WhatsApp", icon: MessageCircle },
  { value: "LinkedIn Message", label: "LinkedIn", icon: Globe },
  { value: "Follow-up", label: "Follow-up", icon: MessageSquare },
] as const;

const ALL_ACTIVITY_TYPES = [
  { value: "Note", label: "Note", icon: FileText },
  { value: "Call", label: "Call", icon: Phone },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Text Message", label: "Text", icon: Smartphone },
  { value: "WhatsApp", label: "WhatsApp", icon: MessageCircle },
  { value: "Meeting", label: "Meeting", icon: Users },
  { value: "LinkedIn Message", label: "LinkedIn", icon: Globe },
  { value: "Follow-up", label: "Follow-up", icon: MessageSquare },
] as const;

interface ProfileTabsProps {
  entityType: "candidate" | "client" | "job";
  entityId: string;
}

export function ProfileTabs({ entityType, entityId }: ProfileTabsProps) {
  const { data: notes = [] } = useNotes(entityType, entityId);
  const createNote = useCreateNote();
  const { data: signalCounts = {} } = useSignalCounts();
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("Note");

  const manualNotes = notes.filter(n => !CALL_ACTIVITY_TYPES.includes(n.activity_type));
  const callNotes = notes.filter(n => CALL_ACTIVITY_TYPES.includes(n.activity_type));

  const callSignalCount = callNotes.reduce((sum, n) => sum + (signalCounts[n.id] || 0), 0);

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    const payload: any = { content: noteContent.trim(), activity_type: noteType };
    if (entityType === "candidate") payload.candidate_id = entityId;
    if (entityType === "client") payload.client_id = entityId;
    if (entityType === "job") payload.job_id = entityId;
    await createNote.mutateAsync(payload);
    setNoteContent("");
  };

  return (
    <Tabs defaultValue="notes">
      <TabsList>
        <TabsTrigger value="notes">Notes ({manualNotes.length})</TabsTrigger>
        <TabsTrigger value="calls" className="gap-1.5">
          Calls & Transcripts ({callNotes.length})
          {callSignalCount > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">{callSignalCount}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="activity">Activity ({notes.length})</TabsTrigger>
      </TabsList>

      {/* NOTES TAB */}
      <TabsContent value="notes" className="mt-4 space-y-3">
        <div className="flex gap-2 items-start">
          <Select value={noteType} onValueChange={setNoteType}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_ACTIVITY_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Add a note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="min-h-[60px] resize-none flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleAddNote(); }}
          />
          <Button size="icon" variant="ghost" onClick={handleAddNote} disabled={!noteContent.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {manualNotes.map(n => (
            <NoteCard key={n.id} note={n} unactionedCount={signalCounts[n.id] || 0} />
          ))}
          {manualNotes.length === 0 && <p className="text-sm text-muted-foreground py-4">No notes yet</p>}
        </div>
      </TabsContent>

      {/* CALLS & TRANSCRIPTS TAB */}
      <TabsContent value="calls" className="mt-4 space-y-2">
        {callNotes.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <PhoneCall className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No call records yet</p>
            <p className="text-xs text-muted-foreground">Use Log Touchpoint to record calls, or connect Fireflies for automatic transcripts</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {callNotes.map(n => (
              <CallEntry key={n.id} note={n} signalCount={signalCounts[n.id] || 0} />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ACTIVITY TAB */}
      <TabsContent value="activity" className="mt-4 space-y-1.5">
        <p className="text-xs text-muted-foreground mb-2">Complete chronological history of this record</p>
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {notes.map(n => (
            <NoteCard key={n.id} note={n} unactionedCount={signalCounts[n.id] || 0} />
          ))}
          {notes.length === 0 && <p className="text-sm text-muted-foreground py-4">No activity yet</p>}
        </div>
      </TabsContent>
    </Tabs>
  );
}

// Call entry component for the Calls & Transcripts tab
function CallEntry({ note, signalCount }: { note: Note; signalCount: number }) {
  const [expanded, setExpanded] = useState(false);

  const isManualLog = !note.transcript;
  const outcomeColor: Record<string, string> = {
    Spoke: "bg-success/20 text-green-400",
    Voicemail: "bg-yellow-500/20 text-yellow-400",
    "No Answer": "bg-red-500/20 text-red-400",
  };

  return (
    <div className="rounded-md bg-muted/30 border border-border/50 overflow-hidden">
      <button
        className="w-full flex gap-2.5 items-center px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Phone className="h-3.5 w-3.5 text-green-400 shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {new Date(note.created_at).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {note.duration && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" /> {note.duration}m
            </span>
          )}
          {note.outcome && (
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
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>

      {!expanded && note.content && (
        <div className="px-3 pb-2 pl-9">
          <p className="text-sm text-muted-foreground truncate">{note.content}</p>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pl-9 space-y-3">
          {note.content && (
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
          )}
          {note.follow_up_date && (
            <p className="text-xs text-warning">
              Follow-up: {new Date(note.follow_up_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
          {/* Use NoteCard's signal/transcript logic by embedding it */}
          <CallExpandedContent note={note} />
        </div>
      )}
    </div>
  );
}

// Expanded content for call entries — transcript + signals
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SignalBox } from "@/components/SignalBox";
import { useSignalsForNote } from "@/hooks/use-signals";

function CallExpandedContent({ note }: { note: Note }) {
  const { data: signals = [], isLoading } = useSignalsForNote(note.id);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <>
      {note.transcript && (
        <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
          <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
            {transcriptOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Read full transcript
          </CollapsibleTrigger>
          {!transcriptOpen && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
              {note.transcript.split("\n").slice(0, 3).join("\n")}…
            </p>
          )}
          <CollapsibleContent>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{note.transcript}</p>
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
