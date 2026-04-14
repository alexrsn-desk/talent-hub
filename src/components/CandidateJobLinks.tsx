import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCandidateJobs, useJobs, useCreateCandidateJob, useDeleteCandidateJob, useUpdateCandidateJob } from "@/hooks/use-data";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STAGES = ["Applied", "Screening", "Submitted", "Interviewing", "Offered", "Placed", "Rejected"];

export function CandidateJobLinks({ candidateId }: { candidateId: string }) {
  const { data: links = [] } = useCandidateJobs(candidateId);
  const { data: jobs = [] } = useJobs();
  const createLink = useCreateCandidateJob();
  const deleteLink = useDeleteCandidateJob();
  const updateLink = useUpdateCandidateJob();
  const [adding, setAdding] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");

  const linkedJobIds = links.map(l => l.job_id);
  const availableJobs = jobs.filter(j => !linkedJobIds.includes(j.id));

  const handleAdd = async () => {
    if (!selectedJobId) return;
    await createLink.mutateAsync({ candidate_id: candidateId, job_id: selectedJobId });
    setAdding(false);
    setSelectedJobId("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Linked Jobs</h3>
        <Button variant="ghost" size="sm" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3 mr-1" /> Link Job
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3">
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select a job..." /></SelectTrigger>
            <SelectContent>
              {availableJobs.map(j => (
                <SelectItem key={j.id} value={j.id}>
                  {j.title} {(j.clients as any)?.company_name ? `(${(j.clients as any).company_name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedJobId}>Add</Button>
        </div>
      )}

      <div className="space-y-2">
        {links.map(link => (
          <div key={link.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{link.jobs?.title || "Unknown"}</span>
              {(link.jobs?.clients as any)?.company_name && (
                <span className="text-muted-foreground ml-1">· {(link.jobs?.clients as any).company_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select defaultValue={link.stage} onValueChange={(v) => updateLink.mutate({ id: link.id, stage: v })}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLink.mutate(link.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {links.length === 0 && <p className="text-sm text-muted-foreground">No linked jobs</p>}
      </div>
    </div>
  );
}
