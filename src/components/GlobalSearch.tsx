import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Users, UserCircle, Building2, Briefcase, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Result = {
  id: string;
  type: "candidate" | "contact" | "client" | "job" | "note";
  title: string;
  subtitle?: string;
  href: string;
  snippet?: string;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd/Ctrl+K to open
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const like = `%${term}%`;
        const [cand, cont, cli, jobs, notes] = await Promise.all([
          supabase.from("candidates").select("id,name,job_title,current_employer").or(`name.ilike.${like},job_title.ilike.${like},current_employer.ilike.${like}`).limit(8),
          supabase.from("contacts").select("id,name,job_title,client_id").or(`name.ilike.${like},job_title.ilike.${like}`).limit(8),
          supabase.from("clients").select("id,company_name,sector").or(`company_name.ilike.${like},sector.ilike.${like}`).limit(8),
          supabase.from("jobs").select("id,title,location,client_id").or(`title.ilike.${like},location.ilike.${like}`).limit(8),
          supabase.from("notes").select("id,content,candidate_id,client_id,job_id,created_at").ilike("content", like).order("created_at", { ascending: false }).limit(8),
        ]);
        const out: Result[] = [];
        for (const c of (cand.data || []) as any[]) {
          out.push({ id: c.id, type: "candidate", title: c.name, subtitle: [c.job_title, c.current_employer].filter(Boolean).join(" — "), href: "/candidates" });
        }
        for (const c of (cont.data || []) as any[]) {
          out.push({ id: c.id, type: "contact", title: c.name, subtitle: c.job_title || "", href: "/contacts" });
        }
        for (const c of (cli.data || []) as any[]) {
          out.push({ id: c.id, type: "client", title: c.company_name, subtitle: c.sector || "", href: "/clients" });
        }
        for (const j of (jobs.data || []) as any[]) {
          out.push({ id: j.id, type: "job", title: j.title, subtitle: j.location || "", href: "/jobs" });
        }
        for (const n of (notes.data || []) as any[]) {
          const idx = (n.content || "").toLowerCase().indexOf(term.toLowerCase());
          const snippet = idx >= 0 ? "…" + (n.content || "").slice(Math.max(0, idx - 40), idx + 80) + "…" : (n.content || "").slice(0, 100);
          const href = n.candidate_id ? "/candidates" : n.client_id ? "/clients" : n.job_id ? "/jobs" : "/";
          out.push({ id: n.id, type: "note", title: "Note", snippet, href });
        }
        setResults(out);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q, open]);

  const grouped = useMemo(() => {
    const g: Record<Result["type"], Result[]> = { candidate: [], contact: [], client: [], job: [], note: [] };
    results.forEach(r => g[r.type].push(r));
    return g;
  }, [results]);

  const groupMeta: { key: Result["type"]; label: string; icon: any }[] = [
    { key: "candidate", label: "Candidates", icon: Users },
    { key: "contact", label: "Contacts", icon: UserCircle },
    { key: "client", label: "Clients", icon: Building2 },
    { key: "job", label: "Jobs", icon: Briefcase },
    { key: "note", label: "Notes", icon: FileText },
  ];

  const totalResults = results.length;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30); }}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border px-2.5 py-1.5 bg-muted/20 hover:bg-muted/40 transition"
        aria-label="Global search"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search everything</span>
        <kbd className="hidden sm:inline ml-2 text-[10px] px-1 py-0.5 rounded bg-background border border-border">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl bg-card rounded-lg border border-border shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative border-b border-border">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search candidates, contacts, clients, jobs, notes…"
                className="w-full bg-transparent px-9 py-3 text-sm outline-none"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {!q.trim() ? (
                <p className="text-sm text-muted-foreground p-4">Start typing to search across everything</p>
              ) : totalResults === 0 && !loading ? (
                <p className="text-sm text-muted-foreground p-4">No results for "{q}"</p>
              ) : (
                groupMeta.map(({ key, label, icon: Icon }) => grouped[key].length > 0 && (
                  <div key={key} className="py-1">
                    <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Icon className="h-3 w-3" /> {label} ({grouped[key].length})
                    </div>
                    {grouped[key].map(r => (
                      <button
                        key={`${r.type}:${r.id}`}
                        className="w-full text-left px-3 py-2 hover:bg-muted/40 transition flex flex-col gap-0.5"
                        onClick={() => { navigate(r.href); setOpen(false); }}
                      >
                        <span className="text-sm font-medium truncate">{r.title}</span>
                        {r.subtitle && <span className="text-xs text-muted-foreground truncate">{r.subtitle}</span>}
                        {r.snippet && <span className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</span>}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
