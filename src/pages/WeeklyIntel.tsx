import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, Copy, Pencil, Check, X, Brain, Lightbulb, ChevronLeft, ChevronRight,
  Loader2, MessageSquare, Globe, Settings as SettingsIcon, Building2, TrendingUp,
  AlertTriangle, ExternalLink,
} from "lucide-react";

// ---------- Types ----------
interface DeskTheme { topic: string; mentions: number; note?: string; }
interface CompanySignalFromNote { company: string; person?: string; signal: string; detail: string; source?: string; }
interface DeskBlock {
  candidateSentiment?: { label: string; evidence?: string };
  themes?: DeskTheme[];
  salaryIntel?: { summary?: string; examples?: string[] };
  companiesMentioned?: { wantToJoin?: string[]; leaving?: string[] };
  signalSummary?: { total: number; byCategory: Record<string, number>; topUnactioned?: string };
  companySignalsFromNotes?: CompanySignalFromNote[];
}
interface WeeklySummary {
  performance: any;
  desk?: DeskBlock;
  marketIntel?: any;
  pipeline?: any;
  contentSuggestions?: { headline: string; insight: string; format: string }[];
  meta?: { dataAvailable: boolean; dataPoints: number };
}
interface MarketTrend { headline: string; implication: string; }
interface MarketNews { summary: string; source: string; }
interface MarketCompany { company: string; event: string; detail: string; bdRelevance: string; }
interface MarketContentIdea { headline: string; yourAngle: string; format: string; }
interface MarketBlock {
  trends?: MarketTrend[];
  sectorNews?: MarketNews[];
  candidateMarket?: string[];
  companiesToWatch?: MarketCompany[];
  contentIdeas?: MarketContentIdea[];
  meta?: { grounded: boolean; searchProvider: string; generatedAt: string };
}

// ---------- Date helpers ----------
function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function toLocalISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------- Settings (localStorage) ----------
const PREFS_KEY = "desky.weeklyIntel.prefs.v1";
interface IntelPrefs {
  keywords: string[];
  sources: { publications: boolean; reddit: boolean; hackerNews: boolean; general: boolean; custom?: string };
  autoGenerate: boolean;
}
const DEFAULT_PREFS: IntelPrefs = {
  keywords: [],
  sources: { publications: true, reddit: true, hackerNews: true, general: true },
  autoGenerate: true,
};
function loadPrefs(): IntelPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: IntelPrefs) { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }

// ---------- Market cache ----------
const MARKET_KEY = (wk: string) => `desky.weeklyIntel.market.${wk}`;
function loadMarket(wk: string): MarketBlock | null {
  try { const r = localStorage.getItem(MARKET_KEY(wk)); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveMarket(wk: string, m: MarketBlock) { localStorage.setItem(MARKET_KEY(wk), JSON.stringify(m)); }

// ---------- Small UI bits ----------
function SectionHeader({ icon, title, sub, disclaimer }: { icon: React.ReactNode; title: string; sub: string; disclaimer?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="text-primary">{icon}</div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
      {disclaimer && <p className="text-[11px] text-muted-foreground/80 italic">{disclaimer}</p>}
    </div>
  );
}

function ContentIdeaCard({ idea }: { idea: { headline: string; body: string; format: string } }) {
  const [editing, setEditing] = useState(false);
  const [h, setH] = useState(idea.headline);
  const [b, setB] = useState(idea.body);
  const copy = () => { navigator.clipboard.writeText(`${h}\n\n${b}`); toast.success("Copied"); };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge variant="outline" className="text-[10px]">{idea.format}</Badge>
        <div className="flex gap-1">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><Check className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setH(idea.headline); setB(idea.body); setEditing(false); }}><X className="h-3 w-3" /></Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copy}><Copy className="h-3 w-3" /></Button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Input value={h} onChange={(e) => setH(e.target.value)} className="text-sm font-semibold" />
          <Textarea value={b} onChange={(e) => setB(e.target.value)} className="text-xs min-h-[80px]" />
        </div>
      ) : (
        <>
          <h4 className="font-semibold text-sm mb-1">{h}</h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{b}</p>
        </>
      )}
    </div>
  );
}

function SettingsDialog({ prefs, onSave }: { prefs: IntelPrefs; onSave: (p: IntelPrefs) => void }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<IntelPrefs>(prefs);
  const [kwInput, setKwInput] = useState("");
  useEffect(() => { if (open) setLocal(prefs); }, [open, prefs]);

  const addKw = () => {
    const v = kwInput.trim();
    if (!v) return;
    if (local.keywords.includes(v)) { setKwInput(""); return; }
    setLocal({ ...local, keywords: [...local.keywords, v] });
    setKwInput("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8"><SettingsIcon className="h-3.5 w-3.5 mr-1" />Intel Settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Weekly Intel Settings</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Niche keywords to monitor</Label>
            <p className="text-[11px] text-muted-foreground mb-2">These focus the web search. e.g. "Kubernetes", "Platform Engineering", "Series B Fintech".</p>
            <div className="flex gap-2">
              <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKw(); } }}
                placeholder="Add a keyword and press Enter" />
              <Button size="sm" type="button" onClick={addKw}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {local.keywords.map((k) => (
                <Badge key={k} variant="secondary" className="text-xs gap-1">
                  {k}
                  <button onClick={() => setLocal({ ...local, keywords: local.keywords.filter((x) => x !== k) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {local.keywords.length === 0 && <span className="text-xs text-muted-foreground">No keywords yet.</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">External sources</Label>
            {([
              ["publications", "Industry publications"],
              ["reddit", "Reddit — recruiting forums"],
              ["hackerNews", "Hacker News — hiring threads"],
              ["general", "General tech / sector news"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(local.sources as any)[k]}
                  onChange={(e) => setLocal({ ...local, sources: { ...local.sources, [k]: e.target.checked } })}
                />
                {label}
              </label>
            ))}
            <Input
              placeholder="Custom URL (optional)"
              value={local.sources.custom || ""}
              onChange={(e) => setLocal({ ...local, sources: { ...local.sources, custom: e.target.value } })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Auto-generate every Friday at 4pm</Label>
              <p className="text-[11px] text-muted-foreground">Defaults to on.</p>
            </div>
            <Switch checked={local.autoGenerate} onCheckedChange={(v) => setLocal({ ...local, autoGenerate: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave(local); setOpen(false); toast.success("Intel settings saved"); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------
export default function WeeklyIntel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [prefs, setPrefs] = useState<IntelPrefs>(loadPrefs());
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [market, setMarket] = useState<MarketBlock | null>(null);

  const currentMonday = getMonday(new Date());
  const targetMonday = new Date(currentMonday);
  targetMonday.setDate(currentMonday.getDate() + weekOffset * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);
  const wsDate = toLocalISODate(targetMonday);
  const weDate = toLocalISODate(targetSunday);

  useEffect(() => { setMarket(loadMarket(wsDate)); }, [wsDate]);

  const { data: savedSummary, isLoading } = useQuery({
    queryKey: ["weekly-summary", wsDate, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_summaries" as any)
        .select("*")
        .eq("week_start", wsDate)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    },
  });

  const summary: WeeklySummary | null = (savedSummary?.summary as any) || null;
  const dataAvailable = summary?.meta?.dataAvailable !== false;

  const sourceList = () => {
    const s: string[] = [];
    if (prefs.sources.publications) s.push("industry publications");
    if (prefs.sources.reddit) s.push("Reddit recruiting forums");
    if (prefs.sources.hackerNews) s.push("Hacker News hiring threads");
    if (prefs.sources.general) s.push("general tech/sector news");
    if (prefs.sources.custom) s.push(prefs.sources.custom);
    return s;
  };

  const generate = useMutation({
    mutationFn: async () => {
      setLoadingMessage("Reading your conversations…");
      const deskRes = await supabase.functions.invoke("weekly-summary", {
        body: { user_id: user?.id, week_end: targetSunday.toISOString() },
      });
      if (deskRes.error) throw deskRes.error;
      const deskData: any = deskRes.data;
      if (deskData?.error) throw new Error(deskData.error);

      setLoadingMessage("Searching the market…");
      const marketRes = await supabase.functions.invoke("weekly-market-intel", {
        body: {
          user_id: user?.id,
          keywords: prefs.keywords,
          sources: sourceList(),
          desk: deskData?.summary?.desk || null,
        },
      });
      if (marketRes.error) throw marketRes.error;
      const marketData: any = marketRes.data;
      if (marketData?.error) throw new Error(marketData.error);

      setLoadingMessage("Building your intel report…");
      saveMarket(wsDate, marketData.market);
      setMarket(marketData.market);
      return { desk: deskData, market: marketData.market };
    },
    onSuccess: async (data: any) => {
      if (data?.desk?.dataAvailable === false) {
        toast.message("Desk has no activity to analyse this week");
      } else {
        toast.success("Weekly intel ready");
      }
      await qc.invalidateQueries({ queryKey: ["weekly-summary", wsDate, user?.id] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to generate intel"),
    onSettled: () => setLoadingMessage(""),
  });

  const desk = summary?.desk;

  // Build combined content ideas list (desk content suggestions + market content ideas)
  const combinedIdeas = [
    ...((market?.contentIdeas || []).map((i) => ({
      headline: i.headline,
      body: i.yourAngle,
      format: i.format || "LinkedIn post",
    }))),
    ...((summary?.contentSuggestions || []).map((s) => ({
      headline: s.headline,
      body: s.insight,
      format: s.format || "LinkedIn post",
    }))),
  ].slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Weekly Intelligence</h1>
          <p className="text-xs text-muted-foreground">{formatDateShort(wsDate)} — {formatDateShort(weDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>This week</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))} disabled={weekOffset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <SettingsDialog prefs={prefs} onSave={(p) => { setPrefs(p); savePrefs(p); }} />
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Generate this week's intel
          </Button>
        </div>
      </div>

      {generate.isPending && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm">{loadingMessage || "Working…"}</p>
          </CardContent>
        </Card>
      )}

      {isLoading && !generate.isPending && (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {!summary && !isLoading && !generate.isPending && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No intel for this week yet.</p>
            <Button onClick={() => generate.mutate()}><RefreshCw className="h-4 w-4 mr-1" />Generate this week's intel</Button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <>
          {/* ===== SECTION 1 — Desk ===== */}
          <SectionHeader
            icon={<MessageSquare className="h-4 w-4" />}
            title="From your conversations this week"
            sub="Intelligence from your own calls, notes and transcripts"
          />

          {!dataAvailable && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4 text-sm">
                <p className="font-medium text-amber-300 mb-1">Not enough data this week</p>
                <p className="text-xs text-muted-foreground">No notes, calls or pipeline movement recorded. Log activity through the week, then re-generate.</p>
              </CardContent>
            </Card>
          )}

          {dataAvailable && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Sentiment */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Candidate sentiment</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="text-sm" variant="outline">{desk?.candidateSentiment?.label || "Unknown"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{desk?.candidateSentiment?.evidence || "Not enough conversation data to read sentiment."}</p>
                </CardContent>
              </Card>

              {/* Salary */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Salary intelligence</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xs mb-2">{desk?.salaryIntel?.summary || "No salary figures mentioned this week."}</p>
                  {desk?.salaryIntel?.examples?.length ? (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {desk.salaryIntel.examples.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>

              {/* Themes */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Themes from your calls</CardTitle></CardHeader>
                <CardContent>
                  {desk?.themes?.length ? (
                    <ul className="space-y-1.5">
                      {desk.themes.map((t, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <Badge variant="secondary" className="text-[10px]">{t.mentions}×</Badge>
                          <div>
                            <span className="font-medium">{t.topic}</span>
                            {t.note && <span className="text-muted-foreground"> — {t.note}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No recurring themes detected.</p>}
                </CardContent>
              </Card>

              {/* Signals */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Signal summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-xs space-y-1 mb-2">
                    <p><span className="text-muted-foreground">Total fired:</span> <span className="font-medium">{desk?.signalSummary?.total ?? 0}</span></p>
                    {desk?.signalSummary?.byCategory && Object.entries(desk.signalSummary.byCategory).map(([k, v]) => (
                      <p key={k}><span className="text-muted-foreground capitalize">{k}:</span> {v}</p>
                    ))}
                  </div>
                  {desk?.signalSummary?.topUnactioned && (
                    <div className="text-xs border-l-2 border-amber-400 pl-2 mt-2">
                      <p className="text-amber-300 font-medium mb-0.5">Most important unactioned</p>
                      <p className="text-muted-foreground">{desk.signalSummary.topUnactioned}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Companies mentioned */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Companies being mentioned</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-green-400 mb-1.5">Want to join</p>
                    {desk?.companiesMentioned?.wantToJoin?.length ? (
                      <ul className="text-xs space-y-0.5">{desk.companiesMentioned.wantToJoin.map((c, i) => <li key={i}>• {c}</li>)}</ul>
                    ) : <p className="text-xs text-muted-foreground">None this week.</p>}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-orange-400 mb-1.5">Leaving</p>
                    {desk?.companiesMentioned?.leaving?.length ? (
                      <ul className="text-xs space-y-0.5">{desk.companiesMentioned.leaving.map((c, i) => <li key={i}>• {c}</li>)}</ul>
                    ) : <p className="text-xs text-muted-foreground">None this week.</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Company signals from notes */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />Company signals from your notes</CardTitle></CardHeader>
                <CardContent>
                  {desk?.companySignalsFromNotes?.length ? (
                    <ul className="space-y-2">
                      {desk.companySignalsFromNotes.map((s, i) => (
                        <li key={i} className="text-xs border-l-2 border-primary/40 pl-2">
                          <p><span className="font-medium">{s.company}</span>{s.person && <span className="text-muted-foreground"> · {s.person}</span>} — <Badge variant="outline" className="text-[10px] uppercase">{s.signal}</Badge></p>
                          <p className="text-muted-foreground mt-0.5">{s.detail}{s.source && <span className="italic"> ({s.source})</span>}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No funding, hiring or leadership signals detected in this week's notes.</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== SECTION 2 — Market ===== */}
          <div className="pt-2">
            <SectionHeader
              icon={<Globe className="h-4 w-4" />}
              title="What the market is saying"
              sub="Current trends and intelligence from the wider market"
              disclaimer={market?.meta?.grounded
                ? "Sourced from industry publications, forums and public market data. Updated weekly."
                : "Sourced from public market knowledge — connect a web-search provider for live grounding. Updated weekly."}
            />
          </div>

          {!market ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                Generate this week's intel to load market context.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Trends */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Market trends this week</CardTitle></CardHeader>
                <CardContent>
                  {market.trends?.length ? (
                    <ul className="space-y-3">
                      {market.trends.map((t, i) => (
                        <li key={i} className="text-sm">
                          <p className="font-medium">{t.headline}</p>
                          <p className="text-xs text-muted-foreground">→ {t.implication}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No trends generated.</p>}
                </CardContent>
              </Card>

              {/* Sector news */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Sector news</CardTitle></CardHeader>
                <CardContent>
                  {market.sectorNews?.length ? (
                    <ul className="space-y-2">
                      {market.sectorNews.map((n, i) => (
                        <li key={i} className="text-xs">
                          <p>{n.summary}</p>
                          <p className="text-muted-foreground italic mt-0.5">— {n.source}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No sector news this week.</p>}
                </CardContent>
              </Card>

              {/* Candidate market */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Candidate market intelligence</CardTitle></CardHeader>
                <CardContent>
                  {market.candidateMarket?.length ? (
                    <ul className="text-xs space-y-1">{market.candidateMarket.map((c, i) => <li key={i}>• {c}</li>)}</ul>
                  ) : <p className="text-xs text-muted-foreground">No themes surfaced.</p>}
                </CardContent>
              </Card>

              {/* Companies to watch */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Companies to watch</CardTitle></CardHeader>
                <CardContent>
                  {market.companiesToWatch?.length ? (
                    <ul className="space-y-2">
                      {market.companiesToWatch.map((c, i) => (
                        <li key={i} className="text-xs border-l-2 border-primary/40 pl-2">
                          <p><span className="font-medium">{c.company}</span> — <Badge variant="outline" className="text-[10px] uppercase">{c.event}</Badge> — {c.detail}</p>
                          <p className="text-muted-foreground mt-0.5">BD relevance: {c.bdRelevance}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No notable company events this week.</p>}
                  <p className="text-[11px] text-muted-foreground italic mt-3">
                    Automatic monitoring of your specific client companies coming soon. Currently showing broader sector company news.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== Combined Content Ideas ===== */}
          <div className="pt-2">
            <SectionHeader
              icon={<Lightbulb className="h-4 w-4" />}
              title="Content ideas this week"
              sub="Based on what you heard and what the market is discussing"
            />
          </div>
          {combinedIdeas.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {combinedIdeas.map((idea, i) => <ContentIdeaCard key={i} idea={idea} />)}
            </div>
          ) : (
            <Card><CardContent className="py-6 text-xs text-muted-foreground text-center">Generate intel to see post ideas combining your desk insights and market context.</CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
