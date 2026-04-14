import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Phone, Users as UsersIcon, Video, CalendarIcon, Clock, ExternalLink,
  ChevronDown, Brain, FileText, Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";

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

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["calls-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, candidates(id, name), clients(id, company_name)")
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
            const linkTo = isCandidate
              ? `/candidates`
              : `/clients`;

            return (
              <Card key={note.id}>
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
                        </div>
                        <Link to={linkTo} className="shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
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
                      </div>

                      {/* Content */}
                      <p className="text-sm text-muted-foreground">{note.content}</p>

                      {/* Expandable sections */}
                      <div className="mt-2 space-y-1">
                        {note.content && note.content.length > 100 && (
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                                <Brain className="h-3 w-3" /> AI Summary
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded-md p-2 border border-border">
                                AI summary will be generated from conversation notes. This feature analyses the content of your logged interaction to produce a brief overview.
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {note.transcript && (
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                                <FileText className="h-3 w-3" /> Transcript
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded-md p-2 border border-border whitespace-pre-wrap font-sans">
                                {note.transcript}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
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
