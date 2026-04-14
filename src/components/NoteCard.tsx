import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SignalBox, SignalBadge } from "@/components/SignalBox";
import { useSignalsForNote } from "@/hooks/use-signals";
import { useUpdateNote, useDeleteNote, type Note } from "@/hooks/use-data";
import {
  FileText, Phone, Mail, Smartphone, MessageCircle, Users, Globe, MessageSquare,
  ChevronDown, ChevronRight, Pencil, Trash2, Clock, Check, X
} from "lucide-react";

const activityIcon: Record<string, typeof FileText> = {
  Note: FileText, Call: Phone, Email: Mail, "Text Message": Smartphone,
  WhatsApp: MessageCircle, Meeting: Users, "LinkedIn Message": Globe, "Follow-up": MessageSquare,
};

const activityColor: Record<string, string> = {
  Note: "text-muted-foreground", Call: "text-green-400", Email: "text-blue-400",
  "Text Message": "text-violet-400", WhatsApp: "text-emerald-400", Meeting: "text-yellow-400",
  "LinkedIn Message": "text-sky-400", "Follow-up": "text-orange-400",
};

export function NoteCard({ note, unactionedCount }: { note: Note; unactionedCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const { data: signals = [], isLoading: signalsLoading } = useSignalsForNote(expanded ? note.id : undefined);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const Icon = activityIcon[note.activity_type] || FileText;
  const color = activityColor[note.activity_type] || "text-muted-foreground";
  const isCallType = ["Call", "Meeting"].includes(note.activity_type);

  const handleSaveEdit = async () => {
    await updateNote.mutateAsync({ id: note.id, content: editContent });
    setEditing(false);
  };

  return (
    <div className="rounded-md bg-muted/30 border border-border/50 overflow-hidden">
      {/* Header — always visible, clickable */}
      <button
        className="w-full flex gap-2.5 items-center px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`${color} shrink-0`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium ${color}`}>{note.activity_type || "Note"}</span>
          {note.outcome && (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{note.outcome}</span>
          )}
          {isCallType && note.duration && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" /> {note.duration}m
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(note.created_at).toLocaleString()}
          </span>
          {unactionedCount > 0 && <SignalBadge count={unactionedCount} />}
        </div>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Collapsed preview */}
      {!expanded && (
        <div className="px-3 pb-2 pl-9">
          <p className="text-sm text-muted-foreground truncate">{note.content}</p>
          {note.follow_up_date && (
            <p className="text-xs text-warning mt-0.5">
              Follow-up: {new Date(note.follow_up_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* Expanded view */}
      {expanded && (
        <div className="px-3 pb-3 pl-9 space-y-3">
          {/* Note content / edit */}
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[80px] text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={handleSaveEdit} disabled={updateNote.isPending} className="gap-1">
                  <Check className="h-3 w-3" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditContent(note.content); }} className="gap-1">
                  <X className="h-3 w-3" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
          )}

          {note.follow_up_date && (
            <p className="text-xs text-warning">
              Follow-up: {new Date(note.follow_up_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}

          {/* Transcript */}
          {note.transcript && (
            <TranscriptBlock transcript={note.transcript} />
          )}

          {/* Signals */}
          {(signals.length > 0 || signalsLoading) && (
            <div className="pt-1">
              <SignalBox signals={signals} loading={signalsLoading} />
            </div>
          )}

          {/* Action buttons */}
          {!editing && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. The note and any associated signals will be removed.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteNote.mutate(note.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TranscriptBlock({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);
  const lines = transcript.split("\n");
  const preview = lines.slice(0, 3).join("\n");
  const hasMore = lines.length > 3;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Transcript
      </CollapsibleTrigger>
      {!open && hasMore && (
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{preview}…</p>
      )}
      {!open && !hasMore && (
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{transcript}</p>
      )}
      <CollapsibleContent>
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{transcript}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
