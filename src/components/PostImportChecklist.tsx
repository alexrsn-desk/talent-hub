import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Check, Link2, AlertTriangle, Users, Loader2, ChevronDown, ChevronUp, UserCheck,
} from "lucide-react";
import {
  ImportError, DuplicateCandidate, NameReviewItem, detectDuplicateCandidates, downloadErrorReport,
} from "@/lib/csv-import";

interface Props {
  unmatchedJobs: { id: string; title: string }[];
  errors: ImportError[];
  nameReviewItems?: NameReviewItem[];
  /** Called when user finishes / dismisses the checklist */
  onDismiss?: () => void;
  /** Compact mode for settings page */
  compact?: boolean;
}

export function PostImportChecklist({ unmatchedJobs: initialUnmatched, errors, nameReviewItems: initialNameReview, onDismiss, compact }: Props) {
  const [unmatchedJobs, setUnmatchedJobs] = useState(initialUnmatched);
  const [allClients, setAllClients] = useState<{ id: string; company_name: string }[]>([]);
  const [jobClientLinks, setJobClientLinks] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [nameReviews, setNameReviews] = useState<(NameReviewItem & { firstName: string; lastName: string })[]>(
    (initialNameReview || []).map(n => ({ ...n, firstName: n.suggestedFirst, lastName: n.suggestedLast }))
  );
  const [loadingDupes, setLoadingDupes] = useState(true);
  const [expandErrors, setExpandErrors] = useState(false);
  const [expandDupes, setExpandDupes] = useState(false);
  const [expandJobs, setExpandJobs] = useState(false);
  const [expandNames, setExpandNames] = useState(nameReviews.length > 0);
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: clients }, dupes] = await Promise.all([
        supabase.from("clients").select("id, company_name").order("company_name"),
        detectDuplicateCandidates(),
      ]);
      setAllClients(clients || []);
      setDuplicates(dupes);
      setLoadingDupes(false);
    })();
  }, []);

  const linkJob = async (jobId: string, clientId: string) => {
    const { error } = await supabase.from("jobs").update({ client_id: clientId }).eq("id", jobId);
    if (error) { toast.error(error.message); return; }
    toast.success("Job linked to client");
    setUnmatchedJobs(prev => prev.filter(j => j.id !== jobId));
  };

  const mergeDuplicate = async (keep: string, remove: string) => {
    setMerging(remove);
    // Move candidate_jobs from remove to keep
    await supabase.from("candidate_jobs").update({ candidate_id: keep } as any).eq("candidate_id", remove);
    // Move notes from remove to keep
    await supabase.from("notes").update({ candidate_id: keep } as any).eq("candidate_id", remove);
    // Delete the duplicate
    const { error } = await supabase.from("candidates").delete().eq("id", remove);
    if (error) { toast.error(error.message); setMerging(null); return; }
    toast.success("Duplicate merged");
    setDuplicates(prev => prev.filter(d => d.id1 !== remove && d.id2 !== remove));
    setMerging(null);
  };

  const dismissDuplicate = (id1: string, id2: string) => {
    setDuplicates(prev => prev.filter(d => !(d.id1 === id1 && d.id2 === id2)));
  };

  const totalIssues = unmatchedJobs.length + errors.length + duplicates.length;
  const allResolved = totalIssues === 0 && !loadingDupes;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="text-center space-y-1 pb-2">
          <h2 className="text-lg font-semibold">Post-import checklist</h2>
          <p className="text-xs text-muted-foreground">Resolve these items to finish your data migration</p>
        </div>
      )}

      {loadingDupes && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning for duplicate records…
        </div>
      )}

      {unmatchedJobs.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <button
              onClick={() => setExpandJobs(p => !p)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {unmatchedJobs.length} job{unmatchedJobs.length > 1 ? "s" : ""} need linking to a client
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{unmatchedJobs.length}</Badge>
                {expandJobs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {expandJobs && (
              <div className="space-y-2 pt-2 border-t border-border">
                {unmatchedJobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3">
                    <span className="text-sm flex-1 truncate">{job.title}</span>
                    <Select
                      value={jobClientLinks[job.id] || ""}
                      onValueChange={val => setJobClientLinks(p => ({ ...p, [job.id]: val }))}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Select client…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allClients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      disabled={!jobClientLinks[job.id]}
                      onClick={() => linkJob(job.id, jobClientLinks[job.id])}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {errors.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <button
              onClick={() => setExpandErrors(p => !p)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">
                  {errors.length} record{errors.length > 1 ? "s" : ""} failed to import
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">{errors.length}</Badge>
                {expandErrors ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {expandErrors && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {errors.map((err, i) => (
                    <div key={i} className="text-xs p-2 bg-muted/30 rounded">
                      <span className="text-muted-foreground">Row {err.row}:</span>{" "}
                      <span className="text-destructive">{err.reason}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => downloadErrorReport(errors, "all")}
                >
                  Download error report
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {duplicates.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <button
              onClick={() => setExpandDupes(p => !p)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">
                  {duplicates.length} possible duplicate candidate{duplicates.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-yellow-500/10">{duplicates.length}</Badge>
                {expandDupes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {expandDupes && (
              <div className="space-y-3 pt-2 border-t border-border">
                {duplicates.map(d => (
                  <div key={`${d.id1}-${d.id2}`} className="p-3 bg-muted/20 rounded-lg space-y-2">
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {d.email1 && <span>{d.email1}</span>}
                      {d.email2 && d.email2 !== d.email1 && (
                        <>
                          <span className="text-muted-foreground/40">vs</span>
                          <span>{d.email2}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        disabled={merging === d.id2}
                        onClick={() => mergeDuplicate(d.id1, d.id2)}
                      >
                        {merging === d.id2 ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Merge (keep first)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        disabled={merging === d.id1}
                        onClick={() => mergeDuplicate(d.id2, d.id1)}
                      >
                        {merging === d.id1 ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Merge (keep second)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => dismissDuplicate(d.id1, d.id2)}
                      >
                        Not a duplicate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {allResolved && (
        <Card className="border-primary/30">
          <CardContent className="p-4 text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-medium">All items resolved</p>
            <p className="text-xs text-muted-foreground">Your data is clean and ready to use.</p>
          </CardContent>
        </Card>
      )}

      {onDismiss && (
        <div className="flex justify-center pt-2">
          <Button onClick={onDismiss}>
            {allResolved ? "Continue" : "I'll finish this later"}
          </Button>
        </div>
      )}
    </div>
  );
}
