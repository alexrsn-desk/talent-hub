import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  Send,
  Plus,
  History,
  Loader2,
  Copy,
  Download,
  User,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};
type CandidateCardItem = {
  id: string;
  name: string;
  title?: string;
  employer?: string;
  location?: string;
  salary?: number;
  match_score?: number;
  match_reason?: string;
  inferred?: boolean;
  inferred_sector?: string;
  inferred_reason?: string;
  inferred_client_id?: string;
};

const SUGGESTED = [
  "Which Product Designers in London earn £60–80k?",
  "Show me candidates I haven't contacted in 90 days",
  "Draft a LinkedIn post about hiring senior React engineers",
  "What's my average time-to-fill this quarter?",
  "Salary survey for Head of Design roles across my desk",
];

export default function AskDesky() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); }, [user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversations() {
    if (!user) return;
    const { data } = await supabase
      .from("ask_desky_conversations" as any)
      .select("id,title,last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(10);
    setConversations((data as any) || []);
  }

  async function openConversation(id: string) {
    setConversationId(id);
    setShowHistory(false);
    const { data } = await supabase
      .from("ask_desky_messages" as any)
      .select("role,content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages(((data as any) || []).map((m: any) => ({ role: m.role, content: m.content })));
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setInput("");
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("ask_desky_conversations" as any).delete().eq("id", id);
    if (id === conversationId) newConversation();
    loadConversations();
  }

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-desky`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          conversation_id: conversationId,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        if (r.status === 402) toast({ title: "AI credits exhausted", description: "Top up in workspace billing.", variant: "destructive" });
        else if (r.status === 429) toast({ title: "Rate limit", description: "Wait a moment and try again.", variant: "destructive" });
        else toast({ title: "Error", description: json?.error ?? "Something went wrong", variant: "destructive" });
        setMessages(nextMessages);
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: json.content || "" }]);
      if (json.conversation_id && json.conversation_id !== conversationId) {
        setConversationId(json.conversation_id);
      }
      loadConversations();
    } catch (e: any) {
      toast({ title: "Network error", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4 mr-2" /> History
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask Desky
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={newConversation}>
          <Plus className="h-4 w-4 mr-2" /> New conversation
        </Button>
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="absolute left-0 top-12 z-10 w-72 rounded-md border bg-popover shadow-lg p-2 max-h-[70vh] overflow-auto">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1">Last 10 conversations</div>
          {conversations.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-4">No conversations yet.</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "group flex items-center gap-2 rounded px-2 py-2 text-sm cursor-pointer hover:bg-accent",
                c.id === conversationId && "bg-accent",
              )}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button onClick={(e) => deleteConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-auto rounded-md border bg-card/30 p-4">
        {messages.length === 0 && !loading && (
          <EmptyState onPick={send} />
        )}
        <div className="space-y-6">
          {messages.map((m, i) => (
            <MessageBlock key={i} msg={m} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="mt-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Ask anything about your desk..."
          rows={2}
          className="resize-none"
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} size="lg">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">Ask Desky anything about your desk</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        Query candidates, generate reports, draft outreach, or crunch numbers. Try one of these:
      </p>
      <div className="grid gap-2 mt-6 w-full max-w-md">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-sm px-3 py-2 rounded-md border bg-background hover:bg-accent transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// Parses the last ```json ...``` block and returns cleaned text + structured payload
function extractPayload(content: string): { text: string; payload: any | null } {
  const re = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(content)) !== null) last = match;
  if (!last) return { text: content, payload: null };
  try {
    const payload = JSON.parse(last[1]);
    const text = content.slice(0, last.index).trim();
    return { text, payload };
  } catch {
    return { text: content, payload: null };
  }
}

function MessageBlock({ msg }: { msg: Msg }) {
  const { text, payload } = useMemo(
    () => (msg.role === "assistant" ? extractPayload(msg.content) : { text: msg.content, payload: null }),
    [msg],
  );

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {text && (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-p:my-2 prose-ul:my-2">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
        {payload?.kind === "candidate_list" && Array.isArray(payload.items) && (
          <CandidateCards items={payload.items} />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(msg.content); toast({ title: "Copied" }); }}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Download className="h-3.5 w-3.5 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function CandidateCards({ items }: { items: CandidateCardItem[] }) {
  const exportCsv = () => {
    const rows = [["Name", "Title", "Employer", "Location", "Salary"]];
    for (const it of items) rows.push([it.name || "", it.title || "", it.employer || "", it.location || "", it.salary ? String(it.salary) : ""]);
    const csv = rows.map((r) => r.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "candidates.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{items.length} candidate{items.length === 1 ? "" : "s"}</div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>
      <div className="grid gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-md border bg-background p-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{it.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[it.title, it.employer, it.location].filter(Boolean).join(" · ")}
                {typeof it.salary === "number" && ` · £${it.salary.toLocaleString()}`}
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={`/candidates?open=${it.id}`}>View</a>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
