import { Phone, ExternalLink, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/SignalBox";
import { parseCallRef } from "@/lib/call-reference";
import type { Note } from "@/hooks/use-data";

interface CallRefCardProps {
  note: Note;
  unactionedCount: number;
  onViewTranscript: (callNoteId: string) => void;
}

const outcomeColor: Record<string, string> = {
  Spoke: "bg-success/20 text-green-400",
  Voicemail: "bg-yellow-500/20 text-yellow-400",
  "No Answer": "bg-red-500/20 text-red-400",
  "Left Voicemail": "bg-yellow-500/20 text-yellow-400",
};

export function CallRefCard({ note, unactionedCount, onViewTranscript }: CallRefCardProps) {
  const ref = parseCallRef(note.content);
  if (!ref) return null;

  return (
    <div className="rounded-md bg-muted/20 border border-border/50 px-3 py-2.5 flex items-center gap-2.5">
      <Phone className="h-3.5 w-3.5 text-green-400 shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {new Date(note.created_at).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </span>
        <span className="text-sm">Transcript added</span>
        <Badge variant="secondary" className="text-[10px] h-5 bg-muted">{ref.source}</Badge>
        {ref.duration && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" /> {ref.duration}m
          </span>
        )}
        {ref.outcome && (
          <Badge variant="secondary" className={`text-[10px] h-5 ${outcomeColor[ref.outcome] || ""}`}>
            {ref.outcome}
          </Badge>
        )}
        {unactionedCount > 0 && <SignalBadge count={unactionedCount} />}
      </div>
      <button
        onClick={() => onViewTranscript(ref.callNoteId)}
        className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0"
      >
        View transcript <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}
