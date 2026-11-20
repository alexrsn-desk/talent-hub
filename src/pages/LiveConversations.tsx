import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Search, Smartphone, MessageCircle, Mail, FileText, CalendarDays, Briefcase, Send, ShieldAlert, ExternalLink, Flame, Clock, CheckCircle2, Zap, Check } from "lucide-react";
import { useConversationHub, type Channel, type HubThread, type ThreadState } from "@/hooks/use-conversation-hub";
import { cn } from "@/lib/utils";

const CHANNEL_META: Record<Channel | "logged", { label: string; icon: typeof Mail }> = {
  sms: { label: "Text", icon: Smartphone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email: { label: "Email", icon: Mail },
  logged: { label: "Logged", icon: FileText },
};
const STATE_META: Record<ThreadState, { label: string; icon: typeof Flame; cls: string }> = {
  needs_action: { label: "Needs action", icon: Flame, cls: "bg-destructive/15 text-destructive border-destructive/30" },
  waiting: { label: "Waiting on them", icon: Clock, cls: "bg-primary/10 text-primary border-primary/30" },
  handled: { label: "Handled", icon: CheckCircle2, cls: "bg-muted text-muted-foreground border-border" },
};
const SNIPPETS = [
  "Hi {first}, just checking in — are you free for a quick call this week?",
  "Thanks {first}, I'll share your CV with the client today and come back to you.",
  "Hi {first}, great news — the client would like to move forward. When suits for next steps?",
];

function initials(n: string) { return n.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function shortTime(iso: string) {
  const d = new Date(iso); const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
async function fnError(error: unknown) {
  if (error instanceof FunctionsHttpError) { try { return (await error.context.json()).error as string; } catch { /* */ } }
  return (error as Error)?.message || "Something went wrong";
}

export default function LiveConversations() {
  const { data: threads = [], isLoading } = useConversationHub();
  const [filter, setFilter] = useState<"all" | ThreadState>("all");
  const [q, setQ] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const visible = useMemo(() => threads.filter((t) => {
    if (filter !== "all" && t.state !== filter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return t.name.toLowerCase().includes(s) || (t.subtitle ?? "").toLowerCase().includes(s) || t.messages.some((m) => m.body.toLowerCase().includes(s));
  }), [threads, filter, q]);
  const counts = useMemo(() => ({
    needs_action: threads.filter((t) => t.state === "needs_action").length,
    waiting: threads.filter((t) => t.state === "waiting").length,
  }), [threads]);
  const active = threads.find((t) => t.key === activeKey) ?? visible[0] ?? null;

  return (
    <div className="h-[calc(100vh-4rem)] flex border border-border rounded-lg overflow-hidden bg-card">
      {/* Threads */}
      <aside className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 space-y-2 border-b border-border">
          <h1 className="text-base font-semibold">Conversations</h1>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or messages" className="h-8 pl-8 text-sm" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {([["all", "All"], ["needs_action", `Needs action${counts.needs_action ? ` · ${counts.needs_action}` : ""}`], ["waiting", "Waiting"], ["handled", "Handled"]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setFilter(k)}>{l}</Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && !visible.length && <p className="p-4 text-sm text-muted-foreground">No conversations yet. Messages with candidates and clients will appear here.</p>}
          {visible.map((t) => {
            const Ch = t.lastChannel ? CHANNEL_META[t.lastChannel].icon : FileText;
            return (
              <button key={t.key} onClick={() => setActiveKey(t.key)}
                className={cn("w-full text-left px-3 py-2.5 flex gap-3 border-b border-border/60 hover:bg-muted/50", active?.key === t.key && "bg-muted")}>
                <div className="h-9 w-9 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0">{initials(t.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate flex-1">{t.name}</span>
                    <span className="text-[11px] text-muted-foreground">{t.last && shortTime(t.last.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ch className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{t.last?.direction === "outbound" ? "You: " : ""}{t.last?.body.replace(/\s+/g, " ")}</span>
                    {t.state === "needs_action" && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" aria-label="Needs action" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {active ? <ThreadView key={active.key} thread={active} /> : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Pick a conversation</div>
      )}
    </div>
  );
}

function ThreadView({ thread }: { thread: HubThread }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>(thread.lastChannel === "email" ? "email" : thread.lastChannel === "whatsapp" ? "whatsapp" : "sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [thread.messages.length]);
  const first = thread.name.split(" ")[0];
  const st = STATE_META[thread.state];

  const { data: profile } = useQuery({
    queryKey: ["my-booking-url"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("recruiter_profiles").select("id,booking_url").eq("user_id", user.id).maybeSingle();
      return { userId: user.id, ...data };
    },
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["hub-live-jobs"],
    queryFn: async () => (await supabase.from("jobs").select("id,title,location,salary_min,salary_max,key_skills,launch_hook,clients(company_name)").in("status", ["Open", "Live", "Active"]).order("updated_at", { ascending: false }).limit(30)).data ?? [],
  });

  const insert = (text: string) => setBody((b) => (b ? `${b.trimEnd()}\n\n${text}` : text));
  const [bookingDraft, setBookingDraft] = useState("");
  const saveBooking = async () => {
    const url = bookingDraft.trim();
    if (!/^https:\/\/\S+$/.test(url)) return toast.error("Paste a full link starting with https://");
    const { error } = profile?.id
      ? await supabase.from("recruiter_profiles").update({ booking_url: url }).eq("id", profile.id)
      : await supabase.from("recruiter_profiles").insert({ user_id: profile!.userId, booking_url: url } as any);
    if (error) return toast.error("Couldn't save your link");
    qc.invalidateQueries({ queryKey: ["my-booking-url"] });
    insert(`Grab a time that suits you here: ${url}`);
  };
  const jobPitch = (j: any) => {
    const sal = j.salary_min || j.salary_max ? ` · £${[j.salary_min, j.salary_max].filter(Boolean).map((n: number) => `${Math.round(n / 1000)}k`).join("–")}` : "";
    const skills = j.key_skills?.length ? `\nLooking for: ${j.key_skills.slice(0, 4).join(", ")}` : "";
    return `${j.title}${j.clients?.company_name ? ` at ${j.clients.company_name}` : ""}${j.location ? ` · ${j.location}` : ""}${sal}${j.launch_hook ? `\n${j.launch_hook}` : ""}${skills}\n\nWorth a chat?`;
  };

  const markHandled = async () => {
    const ids = thread.messages.filter((m) => m.direction === "inbound" && !m.id.startsWith("note-")).map((m) => m.id);
    if (ids.length) await supabase.from("conversation_messages").update({ needs_action: false }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["conversation-hub"] });
  };

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    if (thread.dnc) return toast.error(`${first} is marked Do Not Contact`);
    setSending(true);
    try {
      const target = thread.kind === "candidate" ? { candidate_id: thread.id } : { client_id: thread.id };
      if (channel === "sms") {
        if (!thread.phone) throw new Error("Add a phone number to their profile first");
        const { error } = await supabase.functions.invoke("send-sms", { body: { ...target, to: thread.phone, body: text } });
        if (error) throw new Error(await fnError(error));
        toast.success("Text sent");
      } else if (channel === "whatsapp") {
        if (!thread.phone) throw new Error("Add a phone number to their profile first");
        const digits = thread.phone.replace(/\D/g, "").replace(/^0(?=7)/, "44");
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("conversation_messages").insert({ ...target, owner_user_id: user?.id, channel: "whatsapp", direction: "outbound", to_address: thread.phone, body: text, status: "opened_in_whatsapp" });
        toast.success("Opened in WhatsApp — press send there");
      } else {
        if (!thread.email) throw new Error("Add an email address to their profile first");
        if (!subject.trim()) throw new Error("Add a subject line");
        if (thread.kind === "candidate") {
          const { error } = await supabase.functions.invoke("mcp-send-email", { body: { candidate_id: thread.id, subject: subject.trim(), body: text, confirmed: true } });
          if (error) throw new Error(await fnError(error));
          toast.success("Email sent from your mailbox");
        } else {
          window.location.href = `mailto:${thread.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
        }
      }
      setBody(""); setSubject("");
      qc.invalidateQueries({ queryKey: ["conversation-hub"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
  };

  const smsSegments = Math.max(1, Math.ceil(body.length / 160));

  return (
    <section className="flex-1 flex flex-col min-w-0">
      <header className="px-4 py-2.5 border-b border-border flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">{initials(thread.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={thread.kind === "candidate" ? "/candidates" : "/clients"} className="font-medium text-sm hover:underline truncate">{thread.name}</Link>
            <Badge variant="outline" className="text-[10px] capitalize">{thread.kind}</Badge>
            <Badge variant="outline" className={cn("text-[10px] gap-1", st.cls)}><st.icon className="h-3 w-3" />{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{[thread.subtitle, thread.phone, thread.email].filter(Boolean).join(" · ")}</p>
        </div>
        {thread.state === "needs_action" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={markHandled}><Check className="h-3 w-3 mr-1" />Mark handled</Button>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-background/40">
        {thread.messages.map((m) => {
          const meta = CHANNEL_META[m.channel]; const out = m.direction === "outbound";
          return (
            <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                out ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
                m.channel === "logged" && "bg-card border border-dashed border-border text-muted-foreground")}>
                {m.body}
                <div className={cn("mt-1 flex items-center gap-1 text-[10px]", out && m.channel !== "logged" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  <meta.icon className="h-3 w-3" />{m.label ?? meta.label} · {shortTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-border p-3 space-y-2">
        {thread.dnc && <div className="flex items-center gap-2 text-xs text-destructive"><ShieldAlert className="h-3.5 w-3.5" />Do Not Contact — sending is blocked.</div>}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["sms", "whatsapp", "email"] as Channel[]).map((c) => {
            const M = CHANNEL_META[c];
            return <Button key={c} size="sm" variant={channel === c ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setChannel(c)}><M.icon className="h-3 w-3 mr-1" />{M.label}</Button>;
          })}
          <span className="mx-1 h-4 w-px bg-border" />
          {profile?.booking_url ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => insert(`Grab a time that suits you here: ${profile.booking_url}`)}><CalendarDays className="h-3 w-3 mr-1" />Booking link</Button>
          ) : (
            <Popover>
              <PopoverTrigger asChild><Button size="sm" variant="ghost" className="h-7 px-2 text-xs"><CalendarDays className="h-3 w-3 mr-1" />Booking link</Button></PopoverTrigger>
              <PopoverContent className="w-80 space-y-2">
                <p className="text-xs text-muted-foreground">Paste your scheduling link once (Calendly, Outlook Bookings…). We'll remember it.</p>
                <Input aria-label="Booking link" value={bookingDraft} onChange={(e) => setBookingDraft(e.target.value)} placeholder="https://calendly.com/you" className="h-8 text-sm" />
                <Button size="sm" className="w-full" onClick={saveBooking}>Save & insert</Button>
              </PopoverContent>
            </Popover>
          )}
          <Select onValueChange={(id) => { const j = jobs.find((x: any) => x.id === id); if (j) insert(jobPitch(j)); }}>
            <SelectTrigger className="h-7 w-auto gap-1 text-xs border-0 hover:bg-muted"><Briefcase className="h-3 w-3" /><SelectValue placeholder="Job spec" /></SelectTrigger>
            <SelectContent>{jobs.length ? jobs.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.title}{j.clients?.company_name ? ` · ${j.clients.company_name}` : ""}</SelectItem>) : <div className="p-2 text-xs text-muted-foreground">No live jobs</div>}</SelectContent>
          </Select>
          <Select onValueChange={(v) => insert(v.replace("{first}", first))}>
            <SelectTrigger className="h-7 w-auto gap-1 text-xs border-0 hover:bg-muted"><Zap className="h-3 w-3" /><SelectValue placeholder="Quick reply" /></SelectTrigger>
            <SelectContent>{SNIPPETS.map((s) => <SelectItem key={s} value={s}>{s.replace("{first}", first)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {channel === "email" && <Input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-8 text-sm" />}
        <div className="flex gap-2 items-end">
          <Textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={`Message ${first}…`} className="text-sm resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
          <Button onClick={send} disabled={sending || !body.trim() || thread.dnc} aria-label="Send">
            {channel === "whatsapp" ? <ExternalLink className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {channel === "sms" ? `Sends as a text from your Desky number · ${body.length} chars · ${smsSegments} SMS` : channel === "whatsapp" ? "Opens WhatsApp with this message ready — press send there" : thread.kind === "candidate" ? "Sends from your connected Outlook/Gmail" : "Opens your email app"} · Ctrl+Enter to send
        </p>
      </footer>
    </section>
  );
}
