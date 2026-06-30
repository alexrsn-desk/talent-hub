import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, CheckCircle2, X, Edit3, RefreshCw,
  Send, AlertTriangle, Phone, Mail, FileDown, Clock, Users,
} from "lucide-react";

type Kind = "past_client" | "warm_prospect" | "placed_candidate" | "cold_contact" | "general";
type Bucket = "30-60" | "60-90" | "90+";

type Row = {
  kind: Kind;
  id: string;
  name: string;
  company: string;
  email: string | null;
  lastContactedDays: number;
  contextLine: string;
  touchpoints: number;
  hasPlacement: boolean;
  relationshipWarm: boolean;
};

type Draft = {
  id: string;
  type: "candidate_lead" | "market_insight" | "personal_touchpoint" | "soft_reconnect" | "no_hook";
  subject: string;
  body: string;
  reason?: string;
  status: "pending" | "skipped" | "sent";
};

const KIND_LABEL: Record<Kind, string> = {
  past_client: "Past client",
  warm_prospect: "Warm prospect",
  placed_candidate: "Placed candidate",
  cold_contact: "Cold contact",
  general: "General network",
};
const TYPE_LABEL: Record<Draft["type"], { label: string; tone: string }> = {
  candidate_lead: { label: "Candidate Lead", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  market_insight: { label: "Market Insight", tone: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  personal_touchpoint: { label: "Personal", tone: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  soft_reconnect: { label: "Soft Reconnect", tone: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  no_hook: { label: "No strong hook", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export default function ReactivationCampaign() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const initialGroup = sp.get("group") || "";

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — filters
  const [kinds, setKinds] = useState<Kind[]>(
    initialGroup === "past_clients" ? ["past_client"]
    : initialGroup === "placed_candidates" ? ["placed_candidate"]
    : initialGroup === "warm_prospects" ? ["warm_prospect"]
    : ["past_client", "warm_prospect", "placed_candidate"]
  );
  const [bucket, setBucket] = useState<Bucket>("60-90");
  const [requireRelationship, setRequireRelationship] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);

  // Step 2 — drafting
  const [drafting, setDrafting] = useState(false);
  const [candidateLeadText, setCandidateLeadText] = useState("");
  const [marketInsightText, setMarketInsightText] = useState("");

  // Step 3 — drafts
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [regenId, setRegenId] = useState<string | null>(null);

  // Step 4 — send
  const [sendMethod, setSendMethod] = useState<"outlook" | "queue" | "export">("outlook");
  const [outlookSpacing, setOutlookSpacing] = useState<"30m" | "2h" | "today">("2h");
  const [followupDays, setFollowupDays] = useState<3 | 7 | 14>(7);
  const [savedTemplate, setSavedTemplate] = useState<string>("");
  const [needTemplate, setNeedTemplate] = useState(false);
  const [templateInput, setTemplateInput] = useState("");
  const [sending, setSending] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("reactivation_email_template")
        .eq("user_id", user.id)
        .maybeSingle();
      const tpl = (data as any)?.reactivation_email_template || "";
      setSavedTemplate(tpl);
      setNeedTemplate(!tpl);
    })();
  }, [user]);

  const includedRows = useMemo(() => rows.filter(r => !excluded.has(r.id)), [rows, excluded]);

  const toggleKind = (k: Kind) =>
    setKinds(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  // ---- Step 1 → list ----
  const fetchList = async () => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase.functions.invoke("reactivation-build-list", {
        body: { kinds, lastContactBucket: bucket, requireRelationship, group: initialGroup },
      });
      if (error) throw error;
      setRows(data?.rows || []);
      setExcluded(new Set());
    } catch (e: any) {
      toast.error(e.message || "Failed to build list");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (kinds.length) fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (kinds.length) fetchList(); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join(","), bucket, requireRelationship]);

  // ---- Step 2 → draft ----
  const draftAll = async () => {
    if (!includedRows.length) {
      toast.error("Select at least one contact");
      return;
    }
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reactivation-draft-messages", {
        body: {
          rows: includedRows,
          candidateLead: candidateLeadText.trim()
            ? { name: "(candidate)", story: candidateLeadText.trim(), profile: "" }
            : null,
          marketInsight: marketInsightText.trim() || null,
        },
      });
      if (error) throw error;
      const map: Record<string, Draft> = {};
      for (const m of (data?.messages || []) as Draft[]) {
        map[m.id] = { ...m, status: "pending" };
      }
      // Fill any missing rows as no_hook
      for (const r of includedRows) {
        if (!map[r.id]) {
          map[r.id] = { id: r.id, type: "no_hook", subject: "", body: "", status: "pending" };
        }
      }
      setDrafts(map);
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "AI drafting failed");
    } finally {
      setDrafting(false);
    }
  };

  const regen = async (rowId: string) => {
    const row = includedRows.find(r => r.id === rowId);
    if (!row) return;
    setRegenId(rowId);
    try {
      const { data, error } = await supabase.functions.invoke("reactivation-draft-messages", {
        body: {
          rows: [row],
          candidateLead: candidateLeadText.trim() ? { name: "(candidate)", story: candidateLeadText.trim(), profile: "" } : null,
          marketInsight: marketInsightText.trim() || null,
        },
      });
      if (error) throw error;
      const m = (data?.messages || [])[0];
      if (m) setDrafts(prev => ({ ...prev, [rowId]: { ...m, status: prev[rowId]?.status || "pending" } }));
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setRegenId(null);
    }
  };

  // ---- Step 4 → send ----
  const persistTemplate = async () => {
    if (!user || !templateInput.trim()) return;
    await supabase
      .from("recruiter_profiles")
      .update({ reactivation_email_template: templateInput.trim() } as any)
      .eq("user_id", user.id);
    setSavedTemplate(templateInput.trim());
    setNeedTemplate(false);
    toast.success("Template saved");
  };

  const startSend = async () => {
    if (!user) return;
    const toSend = Object.values(drafts).filter(d => d.status !== "skipped" && d.type !== "no_hook" && d.body);
    if (!toSend.length) { toast.error("No messages to send"); return; }
    setSending(true);
    try {
      // Create campaign
      const { data: camp, error: cErr } = await supabase
        .from("reactivation_campaigns")
        .insert({
          owner_user_id: user.id,
          name: `Reactivation — ${new Date().toLocaleDateString("en-GB")}`,
          source_trigger: initialGroup || "manual",
          total_contacts: includedRows.length,
          sent_count: 0,
          skipped_count: Object.values(drafts).filter(d => d.status === "skipped").length,
          flagged_count: Object.values(drafts).filter(d => d.type === "no_hook").length,
          followup_days: followupDays,
          status: "in_progress",
        } as any)
        .select()
        .single();
      if (cErr) throw cErr;
      setCampaignId(camp.id);

      // Insert messages
      const rowMap = new Map(includedRows.map(r => [r.id, r]));
      const insertRows = toSend.map(d => {
        const r = rowMap.get(d.id)!;
        return {
          campaign_id: camp.id,
          owner_user_id: user.id,
          contact_kind: r.kind,
          contact_id: r.id,
          contact_name: r.name,
          contact_company: r.company,
          contact_email: r.email,
          message_type: d.type,
          subject: d.subject,
          body: d.body,
          status: "pending",
        };
      });
      const { data: inserted, error: iErr } = await supabase
        .from("reactivation_messages")
        .insert(insertRows)
        .select();
      if (iErr) throw iErr;

      if (sendMethod === "export") {
        // Build text file
        const txt = (inserted || []).map((m: any) =>
          `TO: ${m.contact_name} <${m.contact_email || "no email"}>\nSUBJECT: ${m.subject}\n\n${m.body}\n\n------------------------------\n`
        ).join("\n");
        const blob = new Blob([txt], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `reactivation-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click(); URL.revokeObjectURL(url);
        // Mark all as sent (recruiter is sending manually)
        await Promise.all((inserted || []).map((m: any) =>
          supabase.functions.invoke("reactivation-send", {
            body: { messageId: m.id, sendViaOutlook: false, followupDays },
          })
        ));
        setSentCount(inserted?.length || 0);
      } else if (sendMethod === "queue") {
        // Just leave them as pending — recruiter will work through them
        setSentCount(0);
        toast.success("Queue created — work through it in 'Manual queue' below");
      } else {
        // Outlook — send with spacing
        const total = inserted?.length || 0;
        const windowMs =
          outlookSpacing === "30m" ? 30 * 60 * 1000
          : outlookSpacing === "2h" ? 2 * 60 * 60 * 1000
          : 8 * 60 * 60 * 1000;
        const gap = total > 1 ? Math.floor(windowMs / total) : 0;
        let ok = 0;
        for (let i = 0; i < (inserted || []).length; i++) {
          const m = (inserted as any[])[i];
          const { data: res } = await supabase.functions.invoke("reactivation-send", {
            body: { messageId: m.id, sendViaOutlook: true, followupDays },
          });
          if (res?.ok) ok++;
          else if (res?.error === "outlook_not_connected") {
            toast.error("Outlook not connected — switch to 'Queue' or 'Export'");
            break;
          }
          if (i < (inserted?.length || 0) - 1 && gap > 0) await new Promise(r => setTimeout(r, Math.min(gap, 4000)));
        }
        setSentCount(ok);
      }

      await supabase
        .from("reactivation_campaigns")
        .update({ sent_count: sendMethod === "queue" ? 0 : (inserted?.length || 0), status: "sent" } as any)
        .eq("id", camp.id);

      setCompleted(true);
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  // ---- UI helpers ----
  const StepBar = () => (
    <div className="flex items-center gap-2 text-xs">
      {[
        { n: 1, label: "Select group" },
        { n: 2, label: "AI drafts" },
        { n: 3, label: "Review" },
        { n: 4, label: "Send" },
      ].map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`h-6 px-2 rounded-full inline-flex items-center justify-center text-[11px] font-semibold ${
            step === s.n ? "bg-primary text-primary-foreground"
            : step > s.n ? "bg-emerald-500/20 text-emerald-300"
            : "bg-muted text-muted-foreground"
          }`}>
            {step > s.n ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
            {s.n}. {s.label}
          </div>
          {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // ---- Completion screen ----
  if (completed) {
    const followCount = Object.values(drafts).filter(d => d.status !== "skipped" && d.type !== "no_hook").length;
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
        <div>
          <h1 className="text-2xl font-semibold">Campaign sent</h1>
          <p className="text-muted-foreground mt-2">
            {sendMethod === "queue"
              ? `${followCount} messages queued for manual sending.`
              : `${sentCount} message${sentCount === 1 ? "" : "s"} sent. Follow-up reminders set for ${followupDays} days.`}
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => nav("/billers-workflow")}>Back to Biller's Workflow</Button>
          <Button onClick={() => nav("/bd-pipeline")}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Reactivation Campaign
          </h1>
          <p className="text-sm text-muted-foreground">Turn dormant relationships into live conversations — 10-15 minutes.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <StepBar />

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select your group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contact type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {(Object.keys(KIND_LABEL) as Kind[]).map(k => (
                  <label key={k} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                    kinds.includes(k) ? "border-primary bg-primary/10" : "border-border"
                  }`}>
                    <Checkbox checked={kinds.includes(k)} onCheckedChange={() => toggleKind(k)} />
                    {KIND_LABEL[k]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Last contacted</Label>
              <div className="flex gap-2 mt-2">
                {(["30-60", "60-90", "90+"] as Bucket[]).map(b => (
                  <button key={b} onClick={() => setBucket(b)}
                    className={`px-3 py-2 rounded-lg border text-sm ${bucket === b ? "border-primary bg-primary/10" : "border-border"}`}>
                    {b === "30-60" ? "30-60 days (warming)"
                      : b === "60-90" ? "60-90 days (cooling)"
                      : "90+ days (cold — needs care)"}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={requireRelationship} onCheckedChange={(v) => setRequireRelationship(!!v)} className="mt-0.5" />
              <span>
                <span className="font-medium">Only include where a genuine relationship exists</span>
                <span className="block text-xs text-muted-foreground">≥ 2 touchpoints, a placement, or warm notes. Excludes LinkedIn-only or single-touchpoint cold connections.</span>
              </span>
            </label>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {loadingList ? "Loading…" : `${includedRows.length} contact${includedRows.length === 1 ? "" : "s"} match these filters`}
                </div>
                <Button variant="ghost" size="sm" onClick={fetchList} disabled={loadingList}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingList ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              <div className="max-h-[360px] overflow-auto rounded-lg border border-border divide-y divide-border">
                {rows.length === 0 && !loadingList && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No contacts match. Try widening the filters.
                  </div>
                )}
                {rows.map(r => {
                  const isExcluded = excluded.has(r.id);
                  return (
                    <div key={r.id} className={`flex items-start gap-3 p-3 ${isExcluded ? "opacity-50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm truncate">{r.name}</div>
                          <Badge variant="outline" className="text-[10px]">{KIND_LABEL[r.kind]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.company} · {r.lastContactedDays >= 9000 ? "never contacted" : `${r.lastContactedDays} days ago`}</div>
                        <div className="text-xs text-muted-foreground/80 italic mt-0.5 truncate">{r.contextLine}</div>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => {
                          const next = new Set(excluded);
                          if (isExcluded) next.delete(r.id); else next.add(r.id);
                          setExcluded(next);
                        }}
                      >
                        {isExcluded ? "Include" : <X className="h-4 w-4" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!includedRows.length}>
                Continue with {includedRows.length} contact{includedRows.length === 1 ? "" : "s"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add hooks for AI to use (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              AI will pick the best message type per contact: candidate lead, market insight, personal touchpoint, or soft reconnect. Provide hooks below if you have them — otherwise AI uses each contact's history.
            </p>

            <div className="space-y-2">
              <Label className="text-sm">Strong active candidate to lead with (optional)</Label>
              <Textarea
                value={candidateLeadText}
                onChange={(e) => setCandidateLeadText(e.target.value)}
                placeholder="e.g. Sarah, senior backend eng, 8 yrs Go/Python, available in 4 weeks. Just left a fintech scaleup, looking for product engineering team with strong eng culture."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Market insight to share (optional)</Label>
              <Textarea
                value={marketInsightText}
                onChange={(e) => setMarketInsightText(e.target.value)}
                placeholder="e.g. Salaries for senior platform engineers have jumped 12% in London this quarter — clients are losing offers to faster-moving competitors."
                rows={3}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={draftAll} disabled={drafting}>
                {drafting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Draft messages with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="space-y-3">
          {(() => {
            const all = Object.values(drafts);
            const sending = all.filter(d => d.status !== "skipped" && d.type !== "no_hook").length;
            const skipping = all.filter(d => d.status === "skipped").length;
            const flagged = all.filter(d => d.type === "no_hook").length;
            return (
              <Card>
                <CardContent className="p-4 flex items-center justify-between text-sm">
                  <div>
                    Sending <span className="font-semibold text-foreground">{sending}</span> ·
                    Skipping <span className="font-semibold text-foreground">{skipping}</span> ·
                    Flagged <span className="font-semibold text-amber-400">{flagged}</span>
                  </div>
                  <Button onClick={() => setStep(4)} disabled={sending === 0}>
                    Continue to send <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })()}

          {includedRows
            .filter(r => drafts[r.id]?.type !== "no_hook")
            .map(r => {
              const d = drafts[r.id];
              if (!d) return null;
              const lbl = TYPE_LABEL[d.type];
              const skipped = d.status === "skipped";
              return (
                <Card key={r.id} className={skipped ? "opacity-50" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{r.name} · <span className="text-muted-foreground font-normal">{r.company}</span></div>
                        <Badge variant="outline" className={`text-[10px] mt-1 ${lbl.tone}`}>{lbl.label}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => regen(r.id)} disabled={regenId === r.id}>
                          {regenId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDrafts(p => ({ ...p, [r.id]: { ...p[r.id], status: skipped ? "pending" : "skipped" } }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={d.subject}
                      onChange={(e) => setDrafts(p => ({ ...p, [r.id]: { ...p[r.id], subject: e.target.value } }))}
                      placeholder="Subject"
                      className="text-sm"
                    />
                    <Textarea
                      value={d.body}
                      onChange={(e) => setDrafts(p => ({ ...p, [r.id]: { ...p[r.id], body: e.target.value } }))}
                      rows={6}
                      className="text-sm"
                    />
                    {d.reason && <div className="text-xs text-muted-foreground italic">Why this angle: {d.reason}</div>}
                  </CardContent>
                </Card>
              );
            })}

          {/* Flagged */}
          {(() => {
            const flagged = includedRows.filter(r => drafts[r.id]?.type === "no_hook");
            if (!flagged.length) return null;
            return (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {flagged.length} contact{flagged.length === 1 ? "" : "s"} have no strong reconnection hook
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">A brief call is better than a hollow email. Suggested: skip these or pick up the phone.</p>
                  {flagged.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm border border-amber-500/20 rounded p-2">
                      <div>{r.name} · <span className="text-muted-foreground">{r.company}</span></div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toast.info(`Call ${r.name} — no email logged.`)}>
                          <Phone className="h-3.5 w-3.5 mr-1" /> Call instead
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDrafts(p => ({ ...p, [r.id]: { ...p[r.id], status: "skipped" } }))}>
                          Skip
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {needTemplate && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="text-sm font-medium">Teach Desky your reconnection style</div>
                <p className="text-xs text-muted-foreground">
                  Paste an example of how you usually write reconnection messages to dormant clients or contacts. This is separate from your submission template — warmer, more personal.
                </p>
                <Textarea
                  value={templateInput}
                  onChange={(e) => setTemplateInput(e.target.value)}
                  rows={5}
                  placeholder="Hi [name], it's been a while — I was thinking about [thing] the other day and..."
                />
                <Button size="sm" onClick={persistTemplate} disabled={!templateInput.trim()}>Save template</Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Send method</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { v: "outlook", label: "Send via Outlook", icon: Send, desc: "Spaced naturally over time" },
                  { v: "queue", label: "Queue manually", icon: Clock, desc: "Send one by one yourself" },
                  { v: "export", label: "Export as text", icon: FileDown, desc: "Copy-paste into any email" },
                ].map((o: any) => {
                  const Icon = o.icon;
                  return (
                    <button key={o.v} onClick={() => setSendMethod(o.v)}
                      className={`text-left p-3 rounded-lg border ${sendMethod === o.v ? "border-primary bg-primary/10" : "border-border"}`}>
                      <Icon className="h-4 w-4 mb-1" />
                      <div className="text-sm font-medium">{o.label}</div>
                      <div className="text-xs text-muted-foreground">{o.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {sendMethod === "outlook" && (
              <div className="space-y-2">
                <Label>Spacing</Label>
                <div className="flex gap-2">
                  {(["30m", "2h", "today"] as const).map(s => (
                    <button key={s} onClick={() => setOutlookSpacing(s)}
                      className={`px-3 py-1.5 rounded-lg border text-sm ${outlookSpacing === s ? "border-primary bg-primary/10" : "border-border"}`}>
                      {s === "30m" ? "Over 30 minutes" : s === "2h" ? "Over 2 hours" : "Over the rest of today"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Set a follow-up if no reply in</Label>
              <div className="flex gap-2">
                {([3, 7, 14] as const).map(d => (
                  <button key={d} onClick={() => setFollowupDays(d)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${followupDays === d ? "border-primary bg-primary/10" : "border-border"}`}>
                    {d === 3 ? "3 days" : d === 7 ? "1 week" : "2 weeks"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={startSend} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                {sendMethod === "queue" ? "Create queue" : sendMethod === "export" ? "Export file" : "Send campaign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
