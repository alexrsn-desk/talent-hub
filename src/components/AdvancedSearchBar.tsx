import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, SlidersHorizontal, Sparkles, Save, Bookmark, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  SENIORITY_LEVELS, LAST_CONTACT_BUCKETS,
  inferSeniority, matchesLastContact, type LastContactBucket, type Seniority,
} from "@/lib/advanced-filters";
import { useSavedSearches, useCreateSavedSearch, useDeleteSavedSearch } from "@/hooks/use-saved-searches";

export type SearchScope = "candidate" | "contact";

export type CandidateFilters = {
  job_title: string;
  current_employer: string;
  sector: string;
  seniority: Seniority | "any";
  status: string;
  last_contact: LastContactBucket;
  in_pipeline: "any" | "yes" | "no";
  location: string;
  salary_min: string;
  salary_max: string;
};
export type ContactFilters = {
  company: string;
  job_title: string;
  sector: string;
  status: string;
  last_contact: LastContactBucket;
  has_open_roles: "any" | "yes" | "no";
};

export const EMPTY_CANDIDATE_FILTERS: CandidateFilters = {
  job_title: "", current_employer: "", sector: "",
  seniority: "any", status: "any", last_contact: "any",
  in_pipeline: "any", location: "", salary_min: "", salary_max: "",
};
export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  company: "", job_title: "", sector: "",
  status: "any", last_contact: "any", has_open_roles: "any",
};

export type SearchableRecord = {
  id: string;
  type: SearchScope;
  name: string;
  job_title?: string | null;
  company?: string | null;        // candidate.current_employer or contact's client.company_name
  sector?: string | null;
  location?: string | null;
  status?: string | null;
  salary?: number | null;
  last_contacted?: string | null; // ISO date
  in_pipeline?: boolean;
  has_open_roles?: boolean;
  notes_excerpt?: string | null;
  summary?: string | null;
  note?: string | null;
};

export type AiMatch = { id: string; reason: string; tier?: "full" | "partial" };

function activeFilterCount(scope: SearchScope, f: any): number {
  let n = 0;
  if (scope === "candidate") {
    const c = f as CandidateFilters;
    if (c.job_title) n++;
    if (c.current_employer) n++;
    if (c.sector) n++;
    if (c.seniority !== "any") n++;
    if (c.status !== "any") n++;
    if (c.last_contact !== "any") n++;
    if (c.in_pipeline !== "any") n++;
    if (c.location) n++;
    if (c.salary_min || c.salary_max) n++;
  } else {
    const c = f as ContactFilters;
    if (c.company) n++;
    if (c.job_title) n++;
    if (c.sector) n++;
    if (c.status !== "any") n++;
    if (c.last_contact !== "any") n++;
    if (c.has_open_roles !== "any") n++;
  }
  return n;
}

export function applyCandidateFilters(records: SearchableRecord[], q: string, f: CandidateFilters): SearchableRecord[] {
  const ql = q.trim().toLowerCase();
  return records.filter(r => {
    if (ql) {
      const blob = `${r.name} ${r.job_title || ""} ${r.company || ""} ${r.location || ""} ${r.notes_excerpt || ""}`.toLowerCase();
      if (!blob.includes(ql)) return false;
    }
    if (f.job_title && !(r.job_title || "").toLowerCase().includes(f.job_title.toLowerCase())) return false;
    if (f.current_employer && !(r.company || "").toLowerCase().includes(f.current_employer.toLowerCase())) return false;
    if (f.sector && !(r.sector || "").toLowerCase().includes(f.sector.toLowerCase())) return false;
    if (f.location && !(r.location || "").toLowerCase().includes(f.location.toLowerCase())) return false;
    if (f.seniority !== "any" && inferSeniority(r.job_title) !== f.seniority) return false;
    if (f.status !== "any" && r.status !== f.status) return false;
    if (!matchesLastContact(r.last_contacted, f.last_contact)) return false;
    if (f.in_pipeline === "yes" && !r.in_pipeline) return false;
    if (f.in_pipeline === "no" && r.in_pipeline) return false;
    const sMin = f.salary_min ? parseInt(f.salary_min) : null;
    const sMax = f.salary_max ? parseInt(f.salary_max) : null;
    if (sMin !== null && (!r.salary || r.salary < sMin)) return false;
    if (sMax !== null && (!r.salary || r.salary > sMax)) return false;
    return true;
  });
}

export function applyContactFilters(records: SearchableRecord[], q: string, f: ContactFilters): SearchableRecord[] {
  const ql = q.trim().toLowerCase();
  return records.filter(r => {
    if (ql) {
      const blob = `${r.name} ${r.job_title || ""} ${r.company || ""} ${r.notes_excerpt || ""}`.toLowerCase();
      if (!blob.includes(ql)) return false;
    }
    if (f.company && !(r.company || "").toLowerCase().includes(f.company.toLowerCase())) return false;
    if (f.job_title && !(r.job_title || "").toLowerCase().includes(f.job_title.toLowerCase())) return false;
    if (f.sector && !(r.sector || "").toLowerCase().includes(f.sector.toLowerCase())) return false;
    if (f.status !== "any" && r.status !== f.status) return false;
    if (!matchesLastContact(r.last_contacted, f.last_contact)) return false;
    if (f.has_open_roles === "yes" && !r.has_open_roles) return false;
    if (f.has_open_roles === "no" && r.has_open_roles) return false;
    return true;
  });
}

type Props = {
  scope: SearchScope;
  records: SearchableRecord[];
  query: string;
  onQueryChange: (q: string) => void;
  filters: CandidateFilters | ContactFilters;
  onFiltersChange: (f: any) => void;
  statusOptions: string[];
  aiResults: AiMatch[] | null;
  onAiResultsChange: (r: AiMatch[] | null) => void;
};

export function AdvancedSearchBar(props: Props) {
  const {
    scope, records, query, onQueryChange, filters, onFiltersChange,
    statusOptions, aiResults, onAiResultsChange,
  } = props;

  const [aiLoading, setAiLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const { data: saved = [] } = useSavedSearches(scope);
  const createSaved = useCreateSavedSearch();
  const deleteSaved = useDeleteSavedSearch();

  const filterCount = activeFilterCount(scope, filters);

  const placeholder = scope === "candidate"
    ? 'Search candidates — try "Senior DevOps engineers in London" or "PMs who mentioned fintech"'
    : 'Search contacts — try "Heads of Engineering at Series B fintechs" or "clients I haven\'t spoken to in 6 weeks"';

  const runAiSearch = async () => {
    if (!query.trim()) {
      toast.error("Type a query first");
      return;
    }
    setAiLoading(true);
    try {
      const payload = records.slice(0, 250).map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        job_title: r.job_title,
        company: r.company,
        sector: r.sector,
        location: r.location,
        status: r.status,
        last_contacted: r.last_contacted,
        notes_excerpt: r.notes_excerpt?.slice(0, 400) || null,
      }));
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: { query, scope, records: payload },
      });
      if (error) throw error;
      const matches = (data as any)?.matches || [];
      onAiResultsChange(matches);
      toast.success(`AI search found ${matches.length} match${matches.length === 1 ? "" : "es"}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("429")) toast.error("AI rate limit reached — try again shortly");
      else if (msg.includes("402")) toast.error("AI credits exhausted — add credits in workspace usage");
      else toast.error("AI search failed");
    } finally {
      setAiLoading(false);
    }
  };

  const clearAll = () => {
    onQueryChange("");
    onFiltersChange(scope === "candidate" ? EMPTY_CANDIDATE_FILTERS : EMPTY_CONTACT_FILTERS);
    onAiResultsChange(null);
  };

  const loadSaved = (s: any) => {
    onQueryChange(s.query || "");
    onFiltersChange(s.filters || (scope === "candidate" ? EMPTY_CANDIDATE_FILTERS : EMPTY_CONTACT_FILTERS));
    onAiResultsChange(null);
    toast.success(`Loaded "${s.name}"`);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    await createSaved.mutateAsync({ scope, name: saveName.trim(), query, filters });
    setSaveName(""); setSaveOpen(false);
    toast.success("Search saved");
  };

  const isAiQuery = query.trim().split(/\s+/).length >= 3;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { onQueryChange(e.target.value); if (aiResults) onAiResultsChange(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && isAiQuery) runAiSearch(); }}
            placeholder={placeholder}
            className="pl-9 pr-10"
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { onQueryChange(""); onAiResultsChange(null); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant={aiResults ? "default" : "outline"}
          size="sm"
          onClick={runAiSearch}
          disabled={aiLoading || !query.trim()}
          className="gap-1.5"
        >
          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI search
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
              {filterCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-3 max-h-[70vh] overflow-y-auto" align="end">
            {scope === "candidate"
              ? <CandidateFilterPanel filters={filters as CandidateFilters} onChange={onFiltersChange} statusOptions={statusOptions} />
              : <ContactFilterPanel filters={filters as ContactFilters} onChange={onFiltersChange} statusOptions={statusOptions} />}
            <div className="flex justify-between pt-3 border-t border-border mt-3">
              <Button size="sm" variant="ghost" onClick={() => onFiltersChange(scope === "candidate" ? EMPTY_CANDIDATE_FILTERS : EMPTY_CONTACT_FILTERS)}>Reset</Button>
              <span className="text-xs text-muted-foreground self-center">{filterCount} active</span>
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Saved
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Saved searches</DropdownMenuLabel>
            {saved.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-2">No saved searches yet</div>
            ) : saved.map(s => (
              <DropdownMenuItem key={s.id} className="flex items-center justify-between gap-2" onClick={() => loadSaved(s)}>
                <span className="truncate">{s.name}</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteSaved.mutate({ id: s.id, scope }); }}
                >
                  <X className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!query && filterCount === 0}
              onClick={() => setSaveOpen(true)}
            >
              <Save className="h-3.5 w-3.5 mr-2" /> Save current search
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {(query || filterCount > 0 || aiResults) && (
          <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
        )}
      </div>

      {aiResults && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          AI search active — showing {aiResults.length} ranked match{aiResults.length === 1 ? "" : "es"} for "{query}"
          <button className="text-primary hover:underline" onClick={() => onAiResultsChange(null)}>Show all</button>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save search</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Active DevOps candidates London"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!saveName.trim() || createSaved.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateFilterPanel({ filters, onChange, statusOptions }: {
  filters: CandidateFilters; onChange: (f: CandidateFilters) => void; statusOptions: string[];
}) {
  const upd = (k: keyof CandidateFilters, v: any) => onChange({ ...filters, [k]: v });
  return (
    <div className="space-y-3">
      <Field label="Job title contains"><Input value={filters.job_title} onChange={(e) => upd("job_title", e.target.value)} className="h-8" /></Field>
      <Field label="Current employer"><Input value={filters.current_employer} onChange={(e) => upd("current_employer", e.target.value)} className="h-8" /></Field>
      <Field label="Sector / industry"><Input value={filters.sector} onChange={(e) => upd("sector", e.target.value)} className="h-8" /></Field>
      <Field label="Seniority">
        <Select value={filters.seniority} onValueChange={(v) => upd("seniority", v as any)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {SENIORITY_LEVELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Status">
        <Select value={filters.status} onValueChange={(v) => upd("status", v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Last contacted">
        <Select value={filters.last_contact} onValueChange={(v) => upd("last_contact", v as LastContactBucket)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LAST_CONTACT_BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Currently in pipeline">
        <Select value={filters.in_pipeline} onValueChange={(v) => upd("in_pipeline", v as any)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Location"><Input value={filters.location} onChange={(e) => upd("location", e.target.value)} className="h-8" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Salary min">
          <Input type="number" value={filters.salary_min} onChange={(e) => upd("salary_min", e.target.value)} className="h-8" placeholder="e.g. 60000" />
        </Field>
        <Field label="Salary max">
          <Input type="number" value={filters.salary_max} onChange={(e) => upd("salary_max", e.target.value)} className="h-8" placeholder="e.g. 120000" />
        </Field>
      </div>
    </div>
  );
}

function ContactFilterPanel({ filters, onChange, statusOptions }: {
  filters: ContactFilters; onChange: (f: ContactFilters) => void; statusOptions: string[];
}) {
  const upd = (k: keyof ContactFilters, v: any) => onChange({ ...filters, [k]: v });
  return (
    <div className="space-y-3">
      <Field label="Company name"><Input value={filters.company} onChange={(e) => upd("company", e.target.value)} className="h-8" /></Field>
      <Field label="Job title"><Input value={filters.job_title} onChange={(e) => upd("job_title", e.target.value)} className="h-8" /></Field>
      <Field label="Sector"><Input value={filters.sector} onChange={(e) => upd("sector", e.target.value)} className="h-8" /></Field>
      <Field label="Relationship type">
        <Select value={filters.status} onValueChange={(v) => upd("status", v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Last contacted">
        <Select value={filters.last_contact} onValueChange={(v) => upd("last_contact", v as LastContactBucket)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LAST_CONTACT_BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Has open roles at company">
        <Select value={filters.has_open_roles} onValueChange={(v) => upd("has_open_roles", v as any)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
