import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Sparkles, FileText, AlertTriangle, Copy as CopyIcon,
  Loader2, Search, Check, Download, Wand2, Trash2, X, ChevronRight,
} from "lucide-react";
import { detectDuplicateCandidates, DuplicateCandidate } from "@/lib/csv-import";
import { cn } from "@/lib/utils";

// ── Shared types ───────────────────────────────────────────────────
interface CandidateLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_employer: string | null;
  job_title: string | null;
  summary: string | null;
  salary_current: number | null;
  salary_expectation: number | null;
}

interface NoteRow {
  id: string;
  candidate_id: string;
  content: string;
  created_at: string;
  activity_type: string;
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  TOOL 1 — Move first note to Summary                            ║
// ╚══════════════════════════════════════════════════════════════════╝
interface MoveCandidate {
  candidate: { id: string; name: string };
  note: NoteRow;
}

function MoveNotesToSummary() {
  const [scanning, setScanning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [items, setItems] = useState<MoveCandidate[] | null>(null);
  const [actions, setActions] = useState<Record<string, "move" | "keep" | "skip">>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const { data: candidates, error: cErr } = await supabase
        .from("candidates")
        .select("id, name, summary")
        .or("summary.is.null,summary.eq.");
      if (cErr) throw cErr;
      const ids = (candidates || []).map(c => c.id);
      if (ids.length === 0) { setItems([]); return; }

      const { data: notes, error: nErr } = await supabase
        .from("notes")
        .select("id, candidate_id, content, created_at, activity_type")
        .in("candidate_id", ids)
        .order("created_at", { ascending: true });
      if (nErr) throw nErr;

      const firstNoteByCand = new Map<string, NoteRow>();
      for (const n of (notes || []) as NoteRow[]) {
        if (!firstNoteByCand.has(n.candidate_id)) firstNoteByCand.set(n.candidate_id, n);
      }

      const matched: MoveCandidate[] = [];
      for (const c of candidates || []) {
        const n = firstNoteByCand.get(c.id);
        if (n && (n.content || "").trim().length > 100) {
          matched.push({ candidate: { id: c.id, name: c.name }, note: n });
        }
      }
      setItems(matched);
      // default action: move
      const defaults: Record<string, "move" | "keep" | "skip"> = {};
      matched.forEach(m => { defaults[m.candidate.id] = "move"; });
      setActions(defaults);
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const setAll = (action: "move" | "keep" | "skip") => {
    if (!items) return;
    const next: Record<string, "move" | "keep" | "skip"> = {};
    items.forEach(m => { next[m.candidate.id] = action; });
    setActions(next);
  };

  const moveCount = items?.filter(m => actions[m.candidate.id] === "move").length || 0;

  const runMove = async () => {
    if (!items) return;
    setMoving(true);
    let updated = 0; let failed = 0;
    try {
      for (const m of items) {
        if (actions[m.candidate.id] !== "move") continue;
        const summaryText = m.note.content.trim();
        const { error: uErr } = await supabase
          .from("candidates")
          .update({ summary: summaryText } as any)
          .eq("id", m.candidate.id);
        if (uErr) { failed++; continue; }
        // Update note label / activity type tag in content
        const newContent = `[Imported from Vincere — moved to Summary]\n\n${m.note.content}`;
        await supabase
          .from("notes")
          .update({ content: newContent } as any)
          .eq("id", m.note.id);
        updated++;
      }
      toast.success(`Moved summary on ${updated} candidate${updated === 1 ? "" : "s"}${failed ? ` — ${failed} failed` : ""}`);
      // remove processed
      setItems(prev => (prev || []).filter(m => actions[m.candidate.id] !== "move"));
    } catch (e: any) {
      toast.error(e.message || "Move failed");
    } finally {
      setMoving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Many records imported from Vincere have a candidate overview as their first note. This tool moves that
        content to the Summary field. The original note stays in the Notes tab, relabelled.
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          {scanning ? "Scanning…" : "Scan for candidates with notes but no summary"}
        </Button>
      </div>

      {items && items.length === 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
          No matching candidates found — every candidate either already has a summary, or their first note is short.
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{items.length}</strong> candidate{items.length === 1 ? "" : "s"} found
              · <strong className="text-foreground">{moveCount}</strong> queued to move
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setAll("move")}>Move all</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll("skip")}>Skip all</Button>
            </div>
          </div>

          <div className="rounded-md border border-border divide-y divide-border max-h-[420px] overflow-y-auto">
            {items.map(m => {
              const action = actions[m.candidate.id] || "move";
              const preview = m.note.content.trim().slice(0, 140);
              return (
                <div key={m.candidate.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.candidate.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        "{preview}{m.note.content.length > 140 ? "…" : ""}"
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {(["move", "keep", "skip"] as const).map(a => (
                      <Button
                        key={a}
                        size="sm"
                        variant={action === a ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setActions(prev => ({ ...prev, [m.candidate.id]: a }))}
                      >
                        {a === "move" ? "Move to Summary" : a === "keep" ? "Keep in Notes" : "Skip"}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={moveCount === 0 || moving} onClick={() => setConfirmOpen(true)}>
              {moving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Apply ({moveCount})
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move first note to Summary?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the Summary field on {moveCount} candidate{moveCount === 1 ? "" : "s"}. Notes are kept and relabelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runMove(); }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  TOOL 2 — Find missing summaries (AI generate)                  ║
// ╚══════════════════════════════════════════════════════════════════╝
interface MissingSummaryRow {
  candidate: CandidateLite;
  preview?: string;
  loading?: boolean;
  error?: string;
  selected: boolean;
}

function MissingSummaries() {
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<MissingSummaryRow[] | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, name, email, phone, current_employer, job_title, summary, salary_current, salary_expectation")
        .or("summary.is.null,summary.eq.")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []).map(c => ({ candidate: c as CandidateLite, selected: true })));
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const toggleAll = (sel: boolean) => {
    setRows(prev => (prev || []).map(r => ({ ...r, selected: sel })));
  };

  const generateAll = async () => {
    if (!rows) return;
    const targets = rows.filter(r => r.selected && !r.preview);
    if (targets.length === 0) { toast.info("Nothing to generate — all selected rows already have a preview."); return; }
    setGenerating(true);
    try {
      for (const row of targets) {
        setRows(prev => (prev || []).map(r =>
          r.candidate.id === row.candidate.id ? { ...r, loading: true, error: undefined } : r
        ));
        try {
          const { data, error } = await supabase.functions.invoke("generate-candidate-summary", {
            body: { candidate: row.candidate, mode: "overview" },
          });
          if (error) throw error;
          const summary = (data?.summary as string) || "";
          setRows(prev => (prev || []).map(r =>
            r.candidate.id === row.candidate.id ? { ...r, preview: summary, loading: false } : r
          ));
        } catch (e: any) {
          setRows(prev => (prev || []).map(r =>
            r.candidate.id === row.candidate.id ? { ...r, loading: false, error: e.message || "Failed" } : r
          ));
        }
      }
      toast.success("Previews generated — review then save.");
    } finally {
      setGenerating(false);
    }
  };

  const saveAll = async () => {
    if (!rows) return;
    const toSave = rows.filter(r => r.selected && r.preview && r.preview.trim());
    if (toSave.length === 0) { toast.info("Nothing to save."); return; }
    setSaving(true);
    let saved = 0;
    try {
      for (const r of toSave) {
        const { error } = await supabase
          .from("candidates")
          .update({ summary: r.preview } as any)
          .eq("id", r.candidate.id);
        if (!error) saved++;
      }
      toast.success(`Saved summary on ${saved} candidate${saved === 1 ? "" : "s"}`);
      setRows(prev => (prev || []).filter(r => !(r.selected && r.preview)));
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selCount = rows?.filter(r => r.selected).length || 0;
  const previewCount = rows?.filter(r => r.selected && r.preview).length || 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Lists every candidate without a summary. Generate AI previews, review, then save in bulk.
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          {scanning ? "Scanning…" : "Find candidates without a summary"}
        </Button>
      </div>

      {rows && rows.length === 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
          Every candidate already has a summary 🎉
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{rows.length}</strong> candidate{rows.length === 1 ? "" : "s"} ·
              <strong className="text-foreground"> {selCount}</strong> selected ·
              <strong className="text-foreground"> {previewCount}</strong> with preview
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Clear</Button>
            </div>
          </div>

          <div className="rounded-md border border-border divide-y divide-border max-h-[480px] overflow-y-auto">
            {rows.map(r => (
              <div key={r.candidate.id} className="p-3 flex items-start gap-3">
                <Checkbox
                  checked={r.selected}
                  onCheckedChange={(v) =>
                    setRows(prev => (prev || []).map(x =>
                      x.candidate.id === r.candidate.id ? { ...x, selected: !!v } : x
                    ))
                  }
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.candidate.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[r.candidate.job_title, r.candidate.current_employer].filter(Boolean).join(" · ") || "No role info"}
                  </div>
                  {r.loading && (
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                    </div>
                  )}
                  {r.error && (
                    <div className="text-xs text-destructive mt-1.5">{r.error}</div>
                  )}
                  {r.preview && (
                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap leading-relaxed">
                      {r.preview}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={generateAll} disabled={generating || selCount === 0}>
              {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Generate previews ({selCount})
            </Button>
            <Button size="sm" onClick={saveAll} disabled={saving || previewCount === 0}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Save ({previewCount})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  TOOL 3 — Incomplete profiles                                   ║
// ╚══════════════════════════════════════════════════════════════════╝
interface IncompleteRow {
  id: string;
  name: string;
  status: string;
  missing: string[];
  selected: boolean;
}

function IncompleteProfiles() {
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [rows, setRows] = useState<IncompleteRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "red" | "amber">("all");

  const scan = async () => {
    setScanning(true);
    try {
      const { data: candidates, error } = await supabase
        .from("candidates")
        .select("id, name, status, email, phone, salary_current, salary_expectation, summary");
      if (error) throw error;
      const ids = (candidates || []).map(c => c.id);

      const [{ data: tags }, { data: notes }] = await Promise.all([
        supabase.from("candidate_tags").select("candidate_id").in("candidate_id", ids),
        supabase.from("notes").select("candidate_id").in("candidate_id", ids),
      ]);
      const tagSet = new Set((tags || []).map(t => t.candidate_id));
      const noteSet = new Set((notes || []).map(n => n.candidate_id));

      const out: IncompleteRow[] = [];
      for (const c of candidates || []) {
        const missing: string[] = [];
        if (!c.email && !c.phone) missing.push("contact");
        if (!c.salary_current && !c.salary_expectation) missing.push("salary");
        if (!tagSet.has(c.id)) missing.push("tags");
        if (!noteSet.has(c.id)) missing.push("notes");
        if (!c.summary || !c.summary.trim()) missing.push("summary");
        if (missing.length > 0) {
          out.push({ id: c.id, name: c.name, status: c.status, missing, selected: false });
        }
      }
      out.sort((a, b) => b.missing.length - a.missing.length);
      setRows(out);
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const filtered = (rows || []).filter(r => {
    if (filter === "red") return r.missing.length >= 3;
    if (filter === "amber") return r.missing.length > 0 && r.missing.length <= 2;
    return true;
  });

  const selectedIds = filtered.filter(r => r.selected).map(r => r.id);

  const setAllSel = (sel: boolean) => {
    setRows(prev => (prev || []).map(r => {
      const inFilter = filter === "all"
        || (filter === "red" && r.missing.length >= 3)
        || (filter === "amber" && r.missing.length > 0 && r.missing.length <= 2);
      return inFilter ? { ...r, selected: sel } : r;
    }));
  };

  const tagAsNeedsEnrichment = async () => {
    if (selectedIds.length === 0) return;
    setWorking(true);
    try {
      // ensure tag definition exists
      const label = "Needs Enrichment";
      const category = "Status";
      let { data: existing } = await supabase
        .from("tag_definitions")
        .select("id")
        .eq("label", label)
        .eq("category", category)
        .maybeSingle();
      let tagId = existing?.id;
      if (!tagId) {
        const { data: ins, error } = await supabase
          .from("tag_definitions")
          .insert({ label, category } as any)
          .select("id")
          .single();
        if (error) throw error;
        tagId = ins.id;
      }
      const inserts = selectedIds.map(cid => ({ candidate_id: cid, tag_definition_id: tagId, source: "manual" }));
      const { error: tErr } = await supabase.from("candidate_tags").insert(inserts as any);
      if (tErr && !`${tErr.message}`.includes("duplicate")) throw tErr;
      toast.success(`Tagged ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to tag");
    } finally {
      setWorking(false);
    }
  };

  const archiveSelected = async () => {
    if (selectedIds.length === 0) return;
    setWorking(true);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ status: "Archived" } as any)
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(`Archived ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"}`);
      setRows(prev => (prev || []).filter(r => !selectedIds.includes(r.id)));
    } catch (e: any) {
      toast.error(e.message || "Archive failed");
    } finally {
      setWorking(false);
    }
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = ["Name", "Status", "Missing fields"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const cells = [r.name, r.status, r.missing.join("; ")].map(v =>
        `"${(v || "").replace(/"/g, '""')}"`
      );
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incomplete-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Find candidates with thin profiles — missing contact info, salary, tags, notes or summary. Use bulk actions to clean up.
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          {scanning ? "Scanning…" : "Find incomplete profiles"}
        </Button>
      </div>

      {rows && rows.length === 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
          No incomplete profiles — every candidate has the basics.
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5">
              {(["all", "red", "amber"] as const).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? `All (${rows.length})`
                    : f === "red" ? `Red — 3+ missing (${rows.filter(r => r.missing.length >= 3).length})`
                    : `Amber — 1–2 missing (${rows.filter(r => r.missing.length > 0 && r.missing.length <= 2).length})`}
                </Button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setAllSel(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => setAllSel(false)}>Clear</Button>
            </div>
          </div>

          <div className="rounded-md border border-border divide-y divide-border max-h-[480px] overflow-y-auto">
            {filtered.map(r => {
              const severity = r.missing.length >= 3 ? "red" : "amber";
              return (
                <div key={r.id} className="p-3 flex items-start gap-3">
                  <Checkbox
                    checked={r.selected}
                    onCheckedChange={(v) =>
                      setRows(prev => (prev || []).map(x =>
                        x.id === r.id ? { ...x, selected: !!v } : x
                      ))
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">{r.status}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.missing.map(m => (
                        <span
                          key={m}
                          className={cn(
                            "text-[10px] rounded px-1.5 py-0.5",
                            severity === "red"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-amber-500/15 text-amber-500"
                          )}
                        >
                          missing {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export list
            </Button>
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0 || working} onClick={tagAsNeedsEnrichment}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> Tag as Needs Enrichment ({selectedIds.length})
            </Button>
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0 || working} onClick={archiveSelected}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Archive ({selectedIds.length})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  TOOL 4 — Find duplicates                                       ║
// ╚══════════════════════════════════════════════════════════════════╝
interface DupePair {
  pair: DuplicateCandidate;
  a: CandidateLite | null;
  b: CandidateLite | null;
}

function FindDuplicates() {
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [pairs, setPairs] = useState<DupePair[] | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      const dupes = await detectDuplicateCandidates();
      if (dupes.length === 0) { setPairs([]); return; }

      const ids = Array.from(new Set(dupes.flatMap(d => [d.id1, d.id2])));
      const { data: cands } = await supabase
        .from("candidates")
        .select("id, name, email, phone, current_employer, job_title, summary, salary_current, salary_expectation")
        .in("id", ids);
      const byId = new Map<string, CandidateLite>();
      (cands || []).forEach(c => byId.set(c.id, c as CandidateLite));

      setPairs(dupes.map(d => ({
        pair: d,
        a: byId.get(d.id1) || null,
        b: byId.get(d.id2) || null,
      })));
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const merge = async (keepId: string, removeId: string) => {
    setWorking(true);
    try {
      // best field merge: copy any non-null fields from removeId into keepId where keep is null/empty
      const { data: keep } = await supabase
        .from("candidates").select("*").eq("id", keepId).single();
      const { data: remove } = await supabase
        .from("candidates").select("*").eq("id", removeId).single();
      if (keep && remove) {
        const fillable = ["email", "phone", "linkedin_url", "current_employer", "job_title",
          "location", "salary_current", "salary_expectation", "notice_period", "availability", "summary"];
        const patch: Record<string, any> = {};
        for (const f of fillable) {
          if ((keep as any)[f] == null || `${(keep as any)[f]}`.trim() === "") {
            const v = (remove as any)[f];
            if (v != null && `${v}`.trim() !== "") patch[f] = v;
          }
        }
        if (Object.keys(patch).length > 0) {
          await supabase.from("candidates").update(patch as any).eq("id", keepId);
        }
      }
      // reassign children
      await supabase.from("candidate_jobs").update({ candidate_id: keepId } as any).eq("candidate_id", removeId);
      await supabase.from("notes").update({ candidate_id: keepId } as any).eq("candidate_id", removeId);
      // tags — avoid duplicates
      const { data: removeTags } = await supabase
        .from("candidate_tags").select("tag_definition_id").eq("candidate_id", removeId);
      const { data: keepTags } = await supabase
        .from("candidate_tags").select("tag_definition_id").eq("candidate_id", keepId);
      const haveTags = new Set((keepTags || []).map(t => t.tag_definition_id));
      const newTagInserts = (removeTags || [])
        .filter(t => !haveTags.has(t.tag_definition_id))
        .map(t => ({ candidate_id: keepId, tag_definition_id: t.tag_definition_id, source: "manual" }));
      if (newTagInserts.length > 0) {
        await supabase.from("candidate_tags").insert(newTagInserts as any);
      }
      await supabase.from("candidate_tags").delete().eq("candidate_id", removeId);
      // activity log
      await supabase.from("activity_log").update({ candidate_id: keepId } as any).eq("candidate_id", removeId);
      // delete losing record
      const { error } = await supabase.from("candidates").delete().eq("id", removeId);
      if (error) throw error;
      toast.success("Records merged");
      setPairs(prev => (prev || []).filter(p => p.pair.id1 !== removeId && p.pair.id2 !== removeId
        && p.pair.id1 !== keepId && p.pair.id2 !== keepId
        ? true
        : !(p.pair.id1 === removeId || p.pair.id2 === removeId)));
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    } finally {
      setWorking(false);
    }
  };

  const dismiss = (pair: DuplicateCandidate) => {
    setPairs(prev => (prev || []).filter(p => !(p.pair.id1 === pair.id1 && p.pair.id2 === pair.id2)));
  };

  const deleteB = async (removeId: string, pair: DuplicateCandidate) => {
    setWorking(true);
    try {
      await supabase.from("candidate_jobs").delete().eq("candidate_id", removeId);
      await supabase.from("candidate_tags").delete().eq("candidate_id", removeId);
      await supabase.from("notes").delete().eq("candidate_id", removeId);
      await supabase.from("activity_log").delete().eq("candidate_id", removeId);
      const { error } = await supabase.from("candidates").delete().eq("id", removeId);
      if (error) throw error;
      toast.success("Record deleted");
      dismiss(pair);
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setWorking(false);
    }
  };

  const renderSide = (c: CandidateLite | null) => (
    <div className="rounded-md border border-border p-3 text-xs space-y-1 bg-muted/20">
      {!c ? (
        <div className="text-muted-foreground italic">Record not found</div>
      ) : (
        <>
          <div className="text-sm font-medium">{c.name}</div>
          {c.job_title && <div className="text-muted-foreground">{c.job_title}{c.current_employer ? ` · ${c.current_employer}` : ""}</div>}
          {c.email && <div>{c.email}</div>}
          {c.phone && <div>{c.phone}</div>}
          {(c.salary_current || c.salary_expectation) && (
            <div className="text-muted-foreground">
              {c.salary_current ? `Now £${c.salary_current.toLocaleString()}` : ""}
              {c.salary_current && c.salary_expectation ? " · " : ""}
              {c.salary_expectation ? `Want £${c.salary_expectation.toLocaleString()}` : ""}
            </div>
          )}
          {c.summary && <div className="text-muted-foreground line-clamp-2 mt-1">{c.summary}</div>}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Finds candidates that look like duplicates (same email, name, or phone). Review side-by-side and merge —
        notes, tags and pipeline positions move into the kept record.
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          {scanning ? "Scanning…" : "Check for duplicate candidates"}
        </Button>
      </div>

      {pairs && pairs.length === 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
          No likely duplicates found 🎉
        </div>
      )}

      {pairs && pairs.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            <strong className="text-foreground">{pairs.length}</strong> potential duplicate pair{pairs.length === 1 ? "" : "s"}
          </div>

          {pairs.map(p => (
            <div key={`${p.pair.id1}-${p.pair.id2}`} className="rounded-md border border-border p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderSide(p.a)}
                {renderSide(p.b)}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={working} onClick={() => merge(p.pair.id1, p.pair.id2)}>
                  Merge — keep A
                </Button>
                <Button size="sm" variant="outline" disabled={working} onClick={() => merge(p.pair.id2, p.pair.id1)}>
                  Merge — keep B
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(p.pair)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Not a duplicate
                </Button>
                <Button size="sm" variant="ghost" disabled={working} onClick={() => deleteB(p.pair.id2, p.pair)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete B
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Container                                                       ║
// ╚══════════════════════════════════════════════════════════════════╝
export function TidyUp() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" /> Tidy Up
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fix common data quality issues left behind by your previous CRM. Each tool runs only when you trigger it.
        </p>
      </div>

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="t1" className="border border-border rounded-md px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              Move notes to Summary
              <span className="text-xs text-muted-foreground font-normal">— first note moved into the Summary field</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <MoveNotesToSummary />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="t2" className="border border-border rounded-md px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Find missing summaries
              <span className="text-xs text-muted-foreground font-normal">— generate AI summaries for empty profiles</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <MissingSummaries />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="t3" className="border border-border rounded-md px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Find incomplete profiles
              <span className="text-xs text-muted-foreground font-normal">— surface candidates with thin data</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <IncompleteProfiles />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="t4" className="border border-border rounded-md px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2 text-sm">
              <CopyIcon className="h-4 w-4 text-primary" />
              Find duplicates
              <span className="text-xs text-muted-foreground font-normal">— detect and merge duplicate candidates</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <FindDuplicates />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
