import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Sparkles,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

type Campaign = { campaignId: string; campaignName: string };
type Project = { projectId: string; projectName: string };

type SyncedCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  job_title: string | null;
  current_employer: string | null;
  sourcewhale_campaign_name: string | null;
  sourcewhale_stage: string | null;
  sourcewhale_status: string | null;
  sourcewhale_last_contacted: string | null;
  sourcewhale_synced_at: string | null;
};

type SortKey =
  | "name"
  | "email"
  | "current_employer"
  | "job_title"
  | "sourcewhale_campaign_name"
  | "sourcewhale_stage"
  | "sourcewhale_last_contacted";
type SortDir = "asc" | "desc";

export default function SourceWhaleContacts() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<SyncedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("sourcewhale_last_contacted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const qc = useQueryClient();

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sourcewhale-contacts?action=overview",
        { method: "GET" },
      );
      if (error) throw error;
      setCampaigns(data?.campaigns ?? []);
      setProjects(data?.projects ?? []);
      setRows(data?.synced ?? []);
      setLastFetched(new Date());
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load SourceWhale data", {
        description: err?.message ?? "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sourcewhale-contacts?action=enrich&limit=200",
        { method: "POST" },
      );
      if (error) throw error;
      const { scanned = 0, matched = 0, updated = 0, notFound = 0 } = data ?? {};
      await qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("SourceWhale sync complete", {
        description: `${matched} matched, ${updated} enriched, ${notFound} not found (of ${scanned} checked).`,
      });
      await load();
    } catch (err: any) {
      console.error(err);
      toast.error("Sync failed", { description: err?.message ?? "Unknown error" });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (campaignFilter) {
      list = list.filter((r) => r.sourcewhale_campaign_name === campaignFilter);
    }
    if (q) {
      list = list.filter((r) =>
        [r.name, r.email, r.current_employer, r.job_title, r.sourcewhale_campaign_name, r.sourcewhale_stage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, campaignFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortHeader({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead>
        <button
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          {children}
          <Icon className="h-3 w-3" />
        </button>
      </TableHead>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
            <Waves className="h-3.5 w-3.5 text-primary" />
            Integration
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">SourceWhale</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Candidates on your desk matched into SourceWhale, with campaign and outreach status.
            {lastFetched && (
              <span className="ml-2 text-xs">Last refreshed {lastFetched.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 w-72"
            />
          </div>
          <Button onClick={runSync} disabled={syncing || loading}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-2">Sync from SourceWhale</span>
          </Button>
          <Button onClick={load} disabled={loading} variant="secondary">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Campaigns</div>
          <div className="text-2xl font-semibold mt-1">{campaigns.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Projects</div>
          <div className="text-2xl font-semibold mt-1">{projects.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Matched candidates</div>
          <div className="text-2xl font-semibold mt-1">{rows.length}</div>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            Campaign
          </span>
          <button
            onClick={() => setCampaignFilter("")}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              campaignFilter === ""
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {campaigns.map((c) => (
            <button
              key={c.campaignId}
              onClick={() => setCampaignFilter(c.campaignName)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                campaignFilter === c.campaignName
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.campaignName.trim()}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortHeader k="name">Name</SortHeader>
              <SortHeader k="email">Email</SortHeader>
              <SortHeader k="current_employer">Company</SortHeader>
              <SortHeader k="job_title">Job Title</SortHeader>
              <SortHeader k="sourcewhale_campaign_name">Campaign</SortHeader>
              <SortHeader k="sourcewhale_stage">Outreach</SortHeader>
              <SortHeader k="sourcewhale_last_contacted">Last Contacted</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                  {query || campaignFilter
                    ? "No candidates match your filters."
                    : "No candidates matched into SourceWhale yet — run a sync to match your desk."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="hover:text-primary transition-colors">
                        {r.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{r.current_employer || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.job_title || "—"}</TableCell>
                  <TableCell>
                    {r.sourcewhale_campaign_name ? (
                      <Badge variant="outline">{r.sourcewhale_campaign_name.trim()}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {r.sourcewhale_stage ? (
                      <Badge variant="secondary" className="capitalize">
                        {r.sourcewhale_stage}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.sourcewhale_last_contacted
                      ? new Date(r.sourcewhale_last_contacted).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} matched candidates
      </div>
    </div>
  );
}
