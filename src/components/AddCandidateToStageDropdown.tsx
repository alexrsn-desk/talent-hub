import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useCandidates, useCreateCandidateJob, type CandidateJob, type Candidate } from "@/hooks/use-data";
import { useSearchAggregates } from "@/hooks/use-search-aggregates";
import { toast } from "sonner";

type Props = {
  jobId: string;
  stage: string;
  candidateJobs: CandidateJob[];
};

export function AddCandidateToStageDropdown({ jobId, stage, candidateJobs }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: candidates = [] } = useCandidates();
  const { data: aggregates } = useSearchAggregates();
  const createCandidateJob = useCreateCandidateJob();

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus after popover mounts
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Map candidate_id -> existing stage (if linked to this job)
  const linkedStage = useMemo(() => {
    const m = new Map<string, string>();
    for (const cj of candidateJobs) m.set(cj.candidate_id, cj.stage);
    return m;
  }, [candidateJobs]);

  const recencyKey = (c: Candidate) => {
    const noteLast = aggregates?.candidateNoteMeta.get(c.id)?.last;
    return noteLast || c.updated_at || c.created_at;
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...candidates];
    if (q) {
      list = list.filter((c) => {
        const hay = `${c.name} ${c.first_name || ""} ${c.last_name || ""} ${c.current_employer || ""} ${c.job_title || ""}`.toLowerCase();
        return hay.includes(q);
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list.slice(0, 10);
    }
    list.sort((a, b) => (recencyKey(b) || "").localeCompare(recencyKey(a) || ""));
    return list.slice(0, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, query, aggregates]);

  const handleSelect = async (c: Candidate) => {
    if (linkedStage.has(c.id)) return;
    try {
      await createCandidateJob.mutateAsync({
        candidate_id: c.id,
        job_id: jobId,
        stage,
        source: "manual",
      });
      toast.success(`${c.name} added`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add candidate");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates..."
            className="h-8 text-xs"
          />
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {query ? `Results (${rows.length})` : "Recently spoken to"}
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto pb-1">
          {rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No candidates found</div>
          ) : (
            rows.map((c) => {
              const existing = linkedStage.get(c.id);
              const disabled = !!existing;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-3 py-1.5 hover:bg-muted/50 transition-colors ${
                    disabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[c.job_title, c.current_employer].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {disabled && (
                    <div className="text-[10px] text-amber-500 mt-0.5">
                      Already in pipeline at {existing}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
