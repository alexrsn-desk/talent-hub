import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, UserPlus, ArrowLeft } from "lucide-react";
import {
  useCandidates,
  useCreateCandidateJob,
  useCreateCandidate,
  type CandidateJob,
  type Candidate,
} from "@/hooks/use-data";
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
  const [mode, setMode] = useState<"search" | "create">("search");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    job_title: "",
    current_employer: "",
    contact: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const { data: candidates = [] } = useCandidates();
  const { data: aggregates } = useSearchAggregates();
  const createCandidateJob = useCreateCandidateJob();
  const createCandidate = useCreateCandidate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setMode("search");
      setForm({ first_name: "", last_name: "", job_title: "", current_employer: "", contact: "" });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (mode === "create") setTimeout(() => firstNameRef.current?.focus(), 30);
  }, [mode]);

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

  const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);
  const canCreate =
    form.first_name.trim().length > 0 && form.last_name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) {
      toast.error("First and last name required");
      return;
    }
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const name = `${first} ${last}`.replace(/\s+/g, " ");
    const contact = form.contact.trim();
    const payload: any = {
      name,
      first_name: first,
      last_name: last,
      job_title: form.job_title.trim() || null,
      current_employer: form.current_employer.trim() || null,
      email: contact && isEmail(contact) ? contact : null,
      phone: contact && !isEmail(contact) ? contact : null,
      status: "New",
      source: "manual",
    };
    try {
      const created = await createCandidate.mutateAsync(payload);
      await createCandidateJob.mutateAsync({
        candidate_id: (created as any).id,
        job_id: jobId,
        stage,
        source: "manual",
      });
      toast.success(`${name} created and added to ${stage}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create candidate");
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
        {mode === "search" ? (
          <>
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
            <div className="max-h-64 overflow-y-auto pb-1">
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
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setMode("create")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors text-primary"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Create new candidate
              </button>
            </div>
          </>
        ) : (
          <div className="p-3 space-y-2">
            <button
              type="button"
              onClick={() => setMode("search")}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to search
            </button>
            <div className="grid grid-cols-2 gap-2">
              <Input
                ref={firstNameRef}
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="First name"
                className="h-8 text-xs"
              />
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="Last name"
                className="h-8 text-xs"
              />
            </div>
            <Input
              value={form.job_title}
              onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              placeholder="Current job title"
              className="h-8 text-xs"
            />
            <Input
              value={form.current_employer}
              onChange={(e) => setForm((f) => ({ ...f, current_employer: e.target.value }))}
              placeholder="Current employer"
              className="h-8 text-xs"
            />
            <Input
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Email or phone"
              className="h-8 text-xs"
            />
            <Button
              onClick={handleCreate}
              disabled={!canCreate || createCandidate.isPending || createCandidateJob.isPending}
              className="w-full h-8 text-xs"
            >
              {createCandidate.isPending || createCandidateJob.isPending ? "Adding..." : "Add to pipeline"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
