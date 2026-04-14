import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Phone, Users as UsersIcon, Video, CalendarIcon, Clock, ExternalLink,
  ChevronDown, Brain, FileText, Loader2, ArrowLeft, Lightbulb,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SignalBox, SignalBadge } from "@/components/SignalBox";
import { useSignalsForNote, useSignalCounts, useDetectSignals } from "@/hooks/use-signals";

type ActivityType = "Call" | "Meeting" | "Video Call";

const typeIcons: Record<string, typeof Phone> = {
  Call: Phone,
  Meeting: UsersIcon,
  "Video Call": Video,
};

const typeColors: Record<string, string> = {
  Call: "text-green-400",
  Meeting: "text-yellow-400",
  "Video Call": "text-sky-400",
};

export default function CallsMeetings() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const { data: signalCounts = {} } = useSignalCounts();
  const { data: noteSignals = [], isLoading: signalsLoading } = useSignalsForNote(selectedNote?.id);
  const detectSignals = useDetectSignals();

  // Auto-detect signals when viewing a note with content but no signals yet
  useEffect(() => {
    if (selectedNote && !signalsLoading && noteSignals.length === 0 && (selectedNote.transcript || selectedNote.content?.length > 50)) {
      detectSignals.mutate(selectedNote.id);
    }
  }, [selectedNote?.id]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["calls-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, candidates(id, name, job_title, current_employer), clients(id, company_name, contact_name)")
        .in("activity_type", ["Call", "Meeting", "Video Call"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    let result = notes;
    if (typeFilter !== "all") {
      result = result.filter((n: any) => n.activity_type === typeFilter);
    }
    if (entityFilter === "candidates") {
      result = result.filter((n: any) => n.candidate_id);
    } else if (entityFilter === "clients") {
      result = result.filter((n: any) => n.client_id);
    }
    if (dateFrom) {
      result = result.filter((n: any) => new Date(n.created_at) >= dateFrom);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      result = result.filter((n: any) => new Date(n.created_at) <= end);
    }
    return result;
  }, [notes, typeFilter, entityFilter, dateFrom, dateTo]);

  // ── Detail view ──────────────────────────────────────────────────
  if (selectedNote) {
    const note = selectedNote;
    const Icon = typeIcons[note.activity_type] || Phone;
    const color = typeColors[note.activity_type] || "text-muted-foreground";
    const isCandidate = !!note.candidate_id;
    const contactName = isCandidate ? note.candidates?.name : note.clients?.company_name;
    const contactType = isCandidate ? "Candidate" : "Client";
    const linkTo = isCandidate ? `/candidates` : `/clients`;
    const subtitle = isCandidate
      ? [note.candidates?.job_title, note.candidates?.current_employer].filter(Boolean).join(" at ")
      : note.clients?.contact_name || "";

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedNote(null)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
        </Button>

        <Card>
          <CardContent className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`mt-1 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{contactName || "Unknown"}</h2>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {contactType}
                    </span>
                  </div>
                  {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
              </div>
              <Link to={linkTo}>
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <ExternalLink className="h-3 w-3" /> View {contactType}
                </Button>
              </Link>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground border-y border-border py-3">
              <span className={`font-medium ${color}`}>{note.activity_type}</span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(new Date(note.created_at), "EEEE dd MMMM yyyy, HH:mm")}
              </span>
              {note.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {note.duration} min
                </span>
              )}
              {note.outcome && (
                <span className="bg-muted px-2 py-0.5 rounded text-xs">{note.outcome}</span>
              )}
            </div>

            {/* Notes / Content */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" /> Notes
              </h3>
              <div className="bg-muted/30 border border-border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {note.content || <span className="text-muted-foreground italic">No notes recorded</span>}
              </div>
            </div>

            {/* AI Summary */}
            {note.content && note.content.length > 50 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full justify-start">
                    <Brain className="h-3.5 w-3.5" /> AI Summary
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-4">
                    AI summary analyses the content of your logged interaction to produce a brief overview. This will be generated automatically as you log more conversations.
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Signals */}
            <SignalBox signals={noteSignals} loading={detectSignals.isPending} />

            {/* Transcript */}
            {note.transcript && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full justify-start">
                    <FileText className="h-3.5 w-3.5" /> Full Transcript
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 border border-border whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">
                    {note.transcript}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Follow-up */}
            {note.follow_up_date && (
              <div className="text-sm text-muted-foreground flex items-center gap-2 pt-2 border-t border-border">
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                Follow-up: {format(new Date(note.follow_up_date), "dd MMM yyyy")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Calls & Meetings</h1>
        <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="Call">Call</SelectItem>
            <SelectItem value="Meeting">Meeting</SelectItem>
            <SelectItem value="Video Call">Video Call</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Contact type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contacts</SelectItem>
            <SelectItem value="candidates">Candidates only</SelectItem>
            <SelectItem value="clients">Clients only</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-1" />
              {dateFrom ? format(dateFrom, "dd MMM") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-1" />
              {dateTo ? format(dateTo, "dd MMM") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {(dateFrom || dateTo || typeFilter !== "all" || entityFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setTypeFilter("all");
            setEntityFilter("all");
            setDateFrom(undefined);
            setDateTo(undefined);
          }}>
            Clear
          </Button>
        )}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No calls or meetings found for the selected filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((note: any) => {
            const Icon = typeIcons[note.activity_type] || Phone;
            const color = typeColors[note.activity_type] || "text-muted-foreground";
            const isCandidate = !!note.candidate_id;
            const contactName = isCandidate
              ? note.candidates?.name
              : note.clients?.company_name;
            const contactType = isCandidate ? "Candidate" : "Client";

            return (
              <Card
                key={note.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setSelectedNote(note)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm truncate">{contactName || "Unknown"}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {contactType}
                          </span>
                          <span className={`text-xs font-medium ${color}`}>{note.activity_type}</span>
                          {signalCounts[note.id] > 0 && <SignalBadge count={signalCounts[note.id]} />}
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 shrink-0" />
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(note.created_at), "dd MMM yyyy, HH:mm")}
                        </span>
                        {note.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {note.duration} min
                          </span>
                        )}
                        {note.outcome && (
                          <span className="bg-muted px-1.5 py-0.5 rounded">{note.outcome}</span>
                        )}
                        {note.transcript && (
                          <span className="flex items-center gap-1 text-primary">
                            <FileText className="h-3 w-3" /> Transcript
                          </span>
                        )}
                      </div>

                      {/* Preview */}
                      <p className="text-sm text-muted-foreground line-clamp-2">{note.content}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
