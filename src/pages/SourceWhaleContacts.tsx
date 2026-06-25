import { useEffect, useMemo, useState } from "react";
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
  RefreshCw,
  Search,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

type Contact = Record<string, any> & {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  company?: string;
  job_title?: string;
  status?: string;
  created_at?: string;
};

type SortKey = "name" | "email" | "company" | "job_title" | "status" | "created_at";
type SortDir = "asc" | "desc";

function normalize(raw: any): Contact[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.contacts)) return raw.contacts;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function displayName(c: Contact) {
  return (
    c.name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.full_name ||
    "—"
  );
}

export default function SourceWhaleContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sourcewhale-contacts", {
        method: "GET",
      });
      if (error) throw error;
      setContacts(normalize(data));
      setLastFetched(new Date());
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load SourceWhale contacts", {
        description: err?.message ?? "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = contacts.map((c) => ({
      raw: c,
      name: displayName(c),
      email: c.email ?? "",
      company: c.company ?? c.company_name ?? "",
      job_title: c.job_title ?? c.title ?? "",
      status: c.status ?? c.state ?? "",
      created_at: c.created_at ?? c.createdAt ?? "",
    }));

    const matched = q
      ? rows.filter((r) =>
          [r.name, r.email, r.company, r.job_title, r.status]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : rows;

    const sorted = [...matched].sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [contacts, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
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
          <h1 className="text-3xl font-semibold tracking-tight">SourceWhale Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live view of contacts pulled from the SourceWhale Public API.
            {lastFetched && (
              <span className="ml-2 text-xs">
                Last refreshed {lastFetched.toLocaleTimeString()}
              </span>
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortHeader k="name">Name</SortHeader>
              <SortHeader k="email">Email</SortHeader>
              <SortHeader k="company">Company</SortHeader>
              <SortHeader k="job_title">Job Title</SortHeader>
              <SortHeader k="status">Status</SortHeader>
              <SortHeader k="created_at">Created</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                  {query
                    ? "No contacts match your search."
                    : "No contacts returned from SourceWhale."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, i) => (
                <TableRow key={r.raw.id ?? `${r.email}-${i}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.email ? (
                      <a
                        href={`mailto:${r.email}`}
                        className="hover:text-primary transition-colors"
                      >
                        {r.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{r.company || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.job_title || "—"}</TableCell>
                  <TableCell>
                    {r.status ? (
                      <Badge variant="secondary" className="capitalize">
                        {r.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} of {contacts.length} contacts
      </div>
    </div>
  );
}
