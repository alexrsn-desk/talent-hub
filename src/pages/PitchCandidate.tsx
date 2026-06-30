import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, Briefcase, Users, Globe,
  CheckCircle2, Phone, Mail, Send, AlertCircle, ExternalLink, Plus, Pencil,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { logActivity } from "@/lib/activity-log";

type Candidate = any;

type Step = 1 | 2 | 3 | 4 | 5;

type LiveRole = { job_id: string; score: number; reason: string; job: any };
type NetClient = { client_id: string; score: number; reason: string; client: any };
type NetContact = { contact_id: string; score: number; reason: string; contact: any };
type MarketCo = { name: string; description: string; why_match: string; hint: string; source: string };

type Selected = {
  kind: "live" | "client" | "contact" | "silver" | "market";
  id: string;
  label: string; // primary line
  sub?: string;
  category: "submission" | "warm" | "cold";
  payload: any;
};

type DraftMsg = { subject: string; body: string; loading?: boolean };

const STORAGE_PREFIX = "desky:pitch:";

function loadDraft<T = any>(id: string): T | null {
  try { const v = localStorage.getItem(STORAGE_PREFIX + id); return v ? JSON.parse(v) : null; } catch { return null; }
}
function saveDraft(id: string, v: any) {
  try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(v)); } catch {/* ignore */}
}

export default function PitchCandidate() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [story, setStory] = useState("");
  const [whyNow, setWhyNow] = useState("");

  // Step 2 — search profile (editable before market search)
  const [searchProfile, setSearchProfile] = useState({
    product: "",
    stage: "",
    sector: "",
    hiring: true,
  });
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  // Step 2/3 results
  const [searching, setSearching] = useState(false);
  const [marketSearching, setMarketSearching] = useState(false);
  const [liveRoles, setLiveRoles] = useState<LiveRole[]>([]);
  const [silver, setSilver] = useState<LiveRole[]>([]);
  const [netClients, setNetClients] = useState<NetClient[]>([]);
  const [netContacts, setNetContacts] = useState<NetContact[]>([]);
  const [market, setMarket] = useState<MarketCo[]>([]);

  // Step 3 — selection
  const [picked, setPicked] = useState<Record<string, Selected>>({});

  // Step 5 — drafts keyed by selected.id
  const [drafts, setDrafts] = useState<Record<string, DraftMsg>>({});
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());

  // Bootstrap candidate + draft restore
  useEffect(() => {
    if (!candidateId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("candidates").select("*").eq("id", candidateId).maybeSingle();
      if (error || !data) { toast.error("Candidate not found"); navigate("/candidates"); return; }
      const cand = data as any;
      setCandidate(cand);

      // restore draft
      const d = loadDraft<any>(candidateId);
      if (d) {
        setStory(d.story || "");
        setWhyNow(d.whyNow || "");
        setSearchProfile(d.searchProfile || { product: "", stage: "", sector: cand.sector || "", hiring: true });
        setPicked(d.picked || {});
      } else {
        // prefill
        const motiv = cand.summary || cand.note || "";
        setStory(
          [
            cand.job_title && cand.current_employer ? `${cand.job_title} at ${cand.current_employer}.` : "",
            motiv ? motiv.slice(0, 240) : "",
          ].filter(Boolean).join(" ").trim()
        );
        setWhyNow(
          cand.status === "Active" ? "Actively looking — likely to move quickly" :
          cand.availability ? `Available ${cand.availability}` : ""
        );
        setSearchProfile({
          product: cand.summary ? cand.summary.split(/[.\n]/)[0].slice(0, 120) : (cand.job_title || ""),
          stage: "",
          sector: cand.sector || "",
          hiring: true,
        });
      }

      setLoading(false);
    })();
  }, [candidateId, navigate]);

  // Persist draft on changes
  useEffect(() => {
    if (!candidateId) return;
    saveDraft(candidateId, { story, whyNow, searchProfile, picked });
  }, [candidateId, story, whyNow, searchProfile, picked]);

  // -------- helpers --------
  const firstName = useMemo(() => {
    if (!candidate) return "";
    return candidate.first_name || (candidate.name || "").split(" ")[0] || "Candidate";
  }, [candidate]);

  const togglePick = (key: string, selected: Selected) => {
    setPicked(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = selected;
      return next;
    });
  };

  const setCategory = (key: string, category: Selected["category"]) => {
    setPicked(prev => prev[key] ? { ...prev, [key]: { ...prev[key], category } } : prev);
  };

  // -------- Step 2: run network search --------
  async function runNetworkSearch() {
    if (!candidate) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("pitch-find-opportunities", {
        body: { candidate_id: candidate.id, story, why_now: whyNow },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLiveRoles(data.liveRoles || []);
      setNetClients(data.networkClients || []);
      setNetContacts(data.networkContacts || []);
      setSilver(data.silverMedallists || []);
      // Pre-tick live roles
      const seed: Record<string, Selected> = { ...picked };
      for (const r of (data.liveRoles || []) as LiveRole[]) {
        const k = `live:${r.job_id}`;
        seed[k] = {
          kind: "live", id: r.job_id, category: "submission",
          label: `${r.job.title} at ${r.job?.clients?.company_name || "—"}`,
          sub: `${r.score}% — ${r.reason}`,
          payload: r.job,
        };
      }
      setPicked(seed);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function runMarketSearch() {
    if (!candidate) return;
    setMarketSearching(true);
    try {
      const exclude = [
        ...netClients.map(c => c.client?.company_name).filter(Boolean),
        candidate.current_employer,
      ].filter(Boolean);
      const profile = {
        candidate_summary: story,
        product: searchProfile.product,
        stage: searchProfile.stage,
        sector: searchProfile.sector,
        looking_for_hiring_signals: searchProfile.hiring,
      };
      const { data, error } = await supabase.functions.invoke("pitch-market-search", {
        body: { profile, exclude_companies: exclude },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMarket(data.companies || []);
      setProfileConfirmed(true);
    } catch (e: any) {
      toast.error(e.message || "Market search failed");
    } finally {
      setMarketSearching(false);
    }
  }

  // -------- Step 5: draft messages --------
  async function draftFor(key: string) {
    const sel = picked[key];
    if (!sel || sel.category === "submission") return;
    setDrafts(d => ({ ...d, [key]: { subject: "", body: "", loading: true } }));
    try {
      const target =
        sel.kind === "client" ? { type: "client", company: sel.payload?.company_name, contact: sel.payload?.contact_name, sector: sel.payload?.sector }
        : sel.kind === "contact" ? { type: "contact", name: sel.payload?.name, company: sel.payload?.company, role: sel.payload?.job_title }
        : sel.kind === "market" ? { type: "company", company: sel.payload?.name, why: sel.payload?.why_match, description: sel.payload?.description }
        : { type: "other", label: sel.label };

      const { data, error } = await supabase.functions.invoke("pitch-draft-message", {
        body: {
          type: sel.category, // "warm" | "cold"
          candidate: {
            name: candidate?.name,
            first_name: firstName,
            title: candidate?.job_title,
            employer: candidate?.current_employer,
            salary_expectation: candidate?.salary_expectation,
            availability: candidate?.availability,
          },
          story,
          why_now: whyNow,
          target,
        },
      });
      if (error) throw error;
      setDrafts(d => ({ ...d, [key]: { subject: data?.subject || "", body: data?.body || "", loading: false } }));
    } catch (e: any) {
      toast.error(e.message || "Draft failed");
      setDrafts(d => ({ ...d, [key]: { subject: "", body: "", loading: false } }));
    }
  }

  async function markSent(key: string) {
    const sel = picked[key];
    if (!sel || !candidate) return;
    const drf = drafts[key];
    const meta = {
      kind: sel.kind,
      pitch_type: sel.category,
      target: sel.label,
      subject: drf?.subject || "",
      body: drf?.body || "",
    };
    try {
      if (sel.kind === "client") {
        await logActivity({ action_type: "bd_contact_made", client_id: sel.payload?.id, candidate_id: candidate.id, metadata: meta });
      } else if (sel.kind === "contact") {
        await logActivity({ action_type: "bd_contact_made", candidate_id: candidate.id, metadata: { ...meta, contact_id: sel.payload?.id } });
        // Reset relationship decay by updating last_contacted_at
        try { await supabase.from("contacts").update({ last_contacted_at: new Date().toISOString() } as any).eq("id", sel.payload?.id); } catch {/* ignore */}
      } else if (sel.kind === "market") {
        await logActivity({ action_type: "bd_contact_made", candidate_id: candidate.id, metadata: { ...meta, market_company: sel.payload?.name } });
      }
      // Reset decay on clients too
      if (sel.kind === "client") {
        try { await supabase.from("clients").update({ last_activity_date: new Date().toISOString() } as any).eq("id", sel.payload?.id); } catch {/* ignore */}
      }
    } catch { /* ignore log errors */ }
    setSentSet(s => new Set(s).add(key));
    toast.success("Marked as sent — touchpoint logged");
  }


  async function addMarketToBD(co: MarketCo) {
    try {
      const { error } = await supabase.from("clients").insert({
        company_name: co.name,
        sector: searchProfile.sector || candidate?.sector || null,
        status: "Target",
      } as any);
      if (error) throw error;
      toast.success(`Added ${co.name} to BD Pipeline as Target`);
    } catch (e: any) {
      toast.error(e.message || "Could not add to BD");
    }
  }

  function goSubmit(jobId: string) {
    // Hand off to Compare & Submit with this candidate pre-selected
    try {
      const draftKey = `desky:compare:${jobId}`;
      const existing = localStorage.getItem(draftKey);
      const base = existing ? JSON.parse(existing) : {};
      const preselected = new Set<string>([...(base.preselected || []), candidate.id]);
      localStorage.setItem(draftKey, JSON.stringify({ ...base, preselected: Array.from(preselected) }));
    } catch { /* ignore */ }
    navigate(`/jobs/${jobId}/compare`);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!candidate) return null;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/candidates")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" /> Pitching {candidate.name}
        </Badge>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <Step1
          candidate={candidate}
          firstName={firstName}
          story={story} setStory={setStory}
          whyNow={whyNow} setWhyNow={setWhyNow}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step2
          firstName={firstName}
          searching={searching}
          marketSearching={marketSearching}
          searchProfile={searchProfile}
          setSearchProfile={setSearchProfile}
          profileConfirmed={profileConfirmed}
          setProfileConfirmed={setProfileConfirmed}
          liveCount={liveRoles.length}
          netCount={netClients.length + netContacts.length}
          silverCount={silver.length}
          marketCount={market.length}
          runNetworkSearch={runNetworkSearch}
          runMarketSearch={runMarketSearch}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <Step3
          liveRoles={liveRoles}
          silver={silver}
          netClients={netClients}
          netContacts={netContacts}
          market={market}
          picked={picked}
          togglePick={togglePick}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <Step4
          picked={picked}
          setCategory={setCategory}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <Step5
          picked={picked}
          drafts={drafts}
          sentSet={sentSet}
          draftFor={draftFor}
          markSent={markSent}
          goSubmit={goSubmit}
          addMarketToBD={addMarketToBD}
          onBack={() => setStep(4)}
          onFinish={() => {
            toast.success("Pitch session complete");
            navigate(`/candidates`);
          }}
          setDrafts={setDrafts}
        />
      )}
    </div>
  );
}

// ============================================================
// UI sub-components
// ============================================================

function Stepper({ step }: { step: Step }) {
  const steps = ["The candidate", "Find opportunities", "Results", "Categorise", "Generate messages"];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold " +
                (active ? "bg-primary text-primary-foreground" :
                  done ? "bg-primary/30 text-primary" : "bg-muted text-muted-foreground")
              }
            >{done ? "✓" : n}</div>
            <span className={"text-sm whitespace-nowrap " + (active ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground/40">›</span>}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ candidate, firstName, story, setStory, whyNow, setWhyNow, onNext }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Who you're pitching</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <Info label="Name" value={candidate.name} />
          <Info label="Current role" value={[candidate.job_title, candidate.current_employer].filter(Boolean).join(" at ") || "—"} />
          <Info label="Sector" value={candidate.sector || "—"} />
          <Info label="Location" value={candidate.location || "—"} />
          <Info label="Salary expectation" value={candidate.salary_expectation ? `£${Number(candidate.salary_expectation).toLocaleString()}` : "—"} />
          <Info label="Availability" value={candidate.availability || "—"} />
        </div>
        {(candidate.summary || candidate.note) && (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Profile notes</div>
            <div className="whitespace-pre-wrap line-clamp-6">{candidate.summary || candidate.note}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Their story <span className="text-muted-foreground">— what makes {firstName} genuinely impressive (2-3 sentences)</span></Label>
          <Textarea
            rows={3}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="e.g. Built Deliveroo's platform infrastructure from 50 to 500 engineers. Looking for Series B environment with real ownership. Available in 6 weeks."
          />
          <p className="text-xs text-muted-foreground">This is what you'll lead with in every message.</p>
        </div>

        <div className="space-y-2">
          <Label>Why now <span className="text-muted-foreground">— only include if genuinely true</span></Label>
          <Input
            value={whyNow}
            onChange={(e) => setWhyNow(e.target.value)}
            placeholder="e.g. Has an offer on the table — will move fast"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!story.trim()}>
            Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Step2({
  firstName, searching, marketSearching,
  searchProfile, setSearchProfile,
  profileConfirmed, setProfileConfirmed,
  liveCount, netCount, silverCount, marketCount,
  runNetworkSearch, runMarketSearch, onBack, onNext,
}: any) {
  const ranNetwork = liveCount + netCount + silverCount > 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-4 w-4" /> Source A — Your existing network
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Searches your Desky database for live roles, warm clients, network contacts, and silver-medallist rejected matches.
          </p>
          <Button onClick={runNetworkSearch} disabled={searching}>
            {searching ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Searching…</> : <><Sparkles className="h-4 w-4 mr-1" /> Run network search</>}
          </Button>
          {ranNetwork && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{liveCount} live roles</Badge>
              <Badge variant="secondary">{netCount} network</Badge>
              <Badge variant="secondary">{silverCount} silver medallists</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-4 w-4" /> Source B — Market search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Before we search outside your DB, confirm the search profile:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <Label className="text-xs">Builds similar products to</Label>
              <Input value={searchProfile.product} onChange={(e) => setSearchProfile({ ...searchProfile, product: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">At stage</Label>
              <Input value={searchProfile.stage} onChange={(e) => setSearchProfile({ ...searchProfile, stage: e.target.value })} placeholder="e.g. Series B" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sector</Label>
              <Input value={searchProfile.sector} onChange={(e) => setSearchProfile({ ...searchProfile, sector: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hiring signal required</Label>
              <Select value={searchProfile.hiring ? "yes" : "no"} onValueChange={(v) => setSearchProfile({ ...searchProfile, hiring: v === "yes" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes — only hiring companies</SelectItem>
                  <SelectItem value="no">No — broader pool</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={runMarketSearch} disabled={marketSearching || !searchProfile.product}>
              {marketSearching ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Searching market…</> : <><Sparkles className="h-4 w-4 mr-1" /> Confirm & search market</>}
            </Button>
            {profileConfirmed && <Badge variant="secondary">{marketCount} market leads</Badge>}
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5" />
            Market suggestions come from AI knowledge — they're labelled "verify before approaching".
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button onClick={onNext} disabled={!ranNetwork && marketCount === 0}>
          Continue <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function ResultRow({
  ticked, onToggle, title, sub, badge, right,
}: { ticked: boolean; onToggle: () => void; title: string; sub?: string; badge?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-card/60 hover:bg-muted/30 transition-colors">
      <Checkbox checked={ticked} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm">{title}</div>
          {badge && <Badge variant="outline" className="text-xs">{badge}</Badge>}
        </div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Step3({ liveRoles, silver, netClients, netContacts, market, picked, togglePick, onBack, onNext }: any) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Live roles to submit ({liveRoles.length + silver.length})</h3>
        <p className="text-xs text-muted-foreground">Strongest, most immediate opportunities — pre-ticked.</p>
        <div className="space-y-2">
          {liveRoles.map((r: LiveRole) => {
            const k = `live:${r.job_id}`;
            return (
              <ResultRow
                key={k}
                ticked={!!picked[k]}
                onToggle={() => togglePick(k, { kind: "live", id: r.job_id, category: "submission", label: `${r.job.title} at ${r.job?.clients?.company_name || "—"}`, sub: r.reason, payload: r.job })}
                title={`${r.job.title} — ${r.job?.clients?.company_name || "—"}`}
                sub={r.reason}
                badge={`${r.score}%`}
              />
            );
          })}
          {silver.map((r: LiveRole) => {
            const k = `silver:${r.job_id}`;
            return (
              <ResultRow
                key={k}
                ticked={!!picked[k]}
                onToggle={() => togglePick(k, { kind: "silver", id: r.job_id, category: "submission", label: `${r.job.title} at ${r.job?.clients?.company_name || "—"}`, sub: r.reason, payload: r.job })}
                title={`${r.job.title} — ${r.job?.clients?.company_name || "—"}`}
                sub={r.reason}
                badge="Silver"
              />
            );
          })}
          {liveRoles.length === 0 && silver.length === 0 && <Empty msg="No live roles matched." />}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-amber-500" /> Your network to approach ({netClients.length + netContacts.length})</h3>
        <p className="text-xs text-muted-foreground">No live role but worth a "thought of you" message.</p>
        <div className="space-y-2">
          {netClients.map((r: NetClient) => {
            const k = `client:${r.client_id}`;
            const warmth = r.client.status || "—";
            const last = r.client.last_activity_date ? new Date(r.client.last_activity_date).toLocaleDateString() : "never";
            return (
              <ResultRow
                key={k}
                ticked={!!picked[k]}
                onToggle={() => togglePick(k, { kind: "client", id: r.client_id, category: "warm", label: `${r.client.company_name}${r.client.contact_name ? " — " + r.client.contact_name : ""}`, sub: r.reason, payload: r.client })}
                title={`${r.client.company_name}${r.client.contact_name ? " — " + r.client.contact_name : ""}`}
                sub={`${r.reason} · Warmth: ${warmth} · Last contact: ${last}`}
                badge={`Suggested: ${suggestApproach(warmth)}`}
              />
            );
          })}
          {netContacts.map((r: NetContact) => {
            const k = `contact:${r.contact_id}`;
            const last = r.contact.last_contacted_at ? new Date(r.contact.last_contacted_at).toLocaleDateString() : "never";
            return (
              <ResultRow
                key={k}
                ticked={!!picked[k]}
                onToggle={() => togglePick(k, { kind: "contact", id: r.contact_id, category: "warm", label: `${r.contact.name} (${r.contact.company || "—"})`, sub: r.reason, payload: r.contact })}
                title={`${r.contact.name} — ${r.contact.company || "—"}`}
                sub={`${r.reason} · Last contact: ${last}`}
                badge={`Suggested: ${suggestApproach(r.contact.status || "")}`}
              />
            );
          })}
          {netClients.length === 0 && netContacts.length === 0 && <Empty msg="No network matches yet." />}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-blue-500" /> New market opportunities ({market.length})</h3>
        <p className="text-xs text-muted-foreground">Companies found via AI market knowledge — not in your database yet.</p>
        <div className="space-y-2">
          {market.map((co: MarketCo, i: number) => {
            const k = `market:${co.name}-${i}`;
            return (
              <ResultRow
                key={k}
                ticked={!!picked[k]}
                onToggle={() => togglePick(k, { kind: "market", id: k, category: "cold", label: co.name, sub: co.why_match, payload: co })}
                title={co.name}
                sub={`${co.description} — ${co.why_match}${co.hint ? ` (${co.hint})` : ""}`}
                badge="New lead — verify"
              />
            );
          })}
          {market.length === 0 && <Empty msg="No market leads — run a market search in Step 2." />}
        </div>
      </section>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button onClick={onNext} disabled={Object.keys(picked).length === 0}>
          Continue ({Object.keys(picked).length} selected) <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function suggestApproach(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("warm") || s.includes("client")) return "Call";
  if (s.includes("cold") || s.includes("li")) return "LinkedIn";
  return "Email";
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-xs text-muted-foreground px-3 py-4 rounded-md bg-muted/30 border border-dashed">{msg}</div>;
}

function Step4({ picked, setCategory, onBack, onNext }: any) {
  const items = Object.entries(picked) as [string, Selected][];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review & categorise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <Empty msg="Nothing selected — go back to Step 3." />}
        {items.map(([k, sel]) => (
          <div key={k} className="flex items-center gap-3 p-3 rounded-md border bg-card/60">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{sel.label}</div>
              {sel.sub && <div className="text-xs text-muted-foreground truncate">{sel.sub}</div>}
            </div>
            <Select value={sel.category} onValueChange={(v) => setCategory(k, v as Selected["category"])}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="submission">Submission (live role)</SelectItem>
                <SelectItem value="warm">Warm pitch (network)</SelectItem>
                <SelectItem value="cold">Cold pitch (new market)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={onNext} disabled={items.length === 0}>
            Generate messages <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Step5({ picked, drafts, sentSet, draftFor, markSent, goSubmit, addMarketToBD, onBack, onFinish, setDrafts }: any) {
  const items = Object.entries(picked) as [string, Selected][];

  // Auto-draft on mount for warm/cold items
  useEffect(() => {
    for (const [k, sel] of items) {
      if (sel.category === "submission") continue;
      if (drafts[k] || drafts[k]?.loading) continue;
      draftFor(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {items.map(([k, sel]) => {
        const isSubmission = sel.category === "submission";
        const sent = sentSet.has(k);
        return (
          <Card key={k} className={sent ? "opacity-70" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">{sel.label}</CardTitle>
                <Badge variant={isSubmission ? "default" : "secondary"} className="text-xs">
                  {isSubmission ? "Submission" : sel.category === "warm" ? "Warm pitch" : "Cold pitch"}
                </Badge>
              </div>
              {sel.sub && <p className="text-xs text-muted-foreground">{sel.sub}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {isSubmission ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Submission messages route through <span className="font-medium">Compare & Submit</span> for full assessment, formatting, and bulk stage transition to "Submitted".
                  </p>
                  <Button onClick={() => goSubmit(sel.payload.id)} variant="default">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open Compare & Submit
                  </Button>
                </div>
              ) : (
                <>
                  {drafts[k]?.loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Drafting message…
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input
                          value={drafts[k]?.subject || ""}
                          onChange={(e) => setDrafts((d: any) => ({ ...d, [k]: { ...(d[k] || {}), subject: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Body</Label>
                        <Textarea
                          rows={8}
                          value={drafts[k]?.body || ""}
                          onChange={(e) => setDrafts((d: any) => ({ ...d, [k]: { ...(d[k] || {}), body: e.target.value } }))}
                        />
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button size="sm" variant="outline" onClick={() => draftFor(k)} disabled={drafts[k]?.loading}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Re-draft
                    </Button>
                    {sel.kind === "client" && sel.payload?.email && (
                      <a href={`mailto:${sel.payload.email}?subject=${encodeURIComponent(drafts[k]?.subject || "")}&body=${encodeURIComponent(drafts[k]?.body || "")}`}>
                        <Button size="sm"><Mail className="h-3.5 w-3.5 mr-1" /> Open in mail</Button>
                      </a>
                    )}
                    {sel.kind === "contact" && sel.payload?.email && (
                      <a href={`mailto:${sel.payload.email}?subject=${encodeURIComponent(drafts[k]?.subject || "")}&body=${encodeURIComponent(drafts[k]?.body || "")}`}>
                        <Button size="sm"><Mail className="h-3.5 w-3.5 mr-1" /> Open in mail</Button>
                      </a>
                    )}
                    <Button size="sm" variant={sent ? "secondary" : "default"} onClick={() => markSent(k)} disabled={sent}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {sent ? "Sent" : "Mark sent / log touchpoint"}
                    </Button>
                    {sel.kind === "market" && (
                      <Button size="sm" variant="outline" onClick={() => addMarketToBD(sel.payload)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add {sel.payload?.name} to BD Pipeline
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button onClick={onFinish}><CheckCircle2 className="h-4 w-4 mr-1" /> Finish</Button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
