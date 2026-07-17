import { createContext, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Loader2, ArrowUp, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Msg = { role: "user" | "assistant"; content: string };
type Proposal = { kind: string; summary: string; params: Record<string, any> };

type Ctx = { open: boolean; setOpen: (v: boolean) => void };
const AssistantCtx = createContext<Ctx>({ open: false, setOpen: () => {} });
export const useDeskyAssistant = () => useContext(AssistantCtx);

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desky-assistant`;

async function callAssistant(payload: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 400) throw new Error(body?.error || `HTTP ${resp.status}`);
  return { ok: resp.ok, body };
}

export function DeskyAssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <AssistantCtx.Provider value={{ open, setOpen }}>{children}</AssistantCtx.Provider>;
}

export function DeskyAssistantOverlay() {
  const { open, setOpen } = useDeskyAssistant();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, proposal]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { body } = await callAssistant({ action: "chat", messages: next });
      if (body.proposal) {
        setProposal(body.proposal);
        setMessages((m) => [...m, { role: "assistant", content: body.reply || body.proposal.summary }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: body.reply || "(no reply)" }]);
      }
    } catch (e: any) {
      const msg = e?.message || "Assistant couldn't reach the server. Check your connection and try again.";
      toast.error(msg);
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
    } finally {
      setBusy(false);
    }
  };

  const confirmProposal = async () => {
    if (!proposal) return;
    const p = proposal;
    setProposal(null);
    try {
      const { ok, body } = await callAssistant({ action: "execute", proposal: p });
      if (ok && body.ok) {
        toast.success(body.result || "Done", {
          icon: <CheckCircle2 className="h-4 w-4" />,
        });
        setMessages((m) => [...m, { role: "assistant", content: body.result || "Done." }]);
        setOpen(false);
        qc.invalidateQueries();
      } else {
        const err = body?.error || "Action failed";
        toast.error(err);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `Couldn't complete that — ${err}. Want to try a different way?` },
        ]);
      }
    } catch (e: any) {
      const err = e?.message || "Action failed";
      toast.error(err);
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't complete that — ${err}.` }]);
    }
  };

  const cancelProposal = () => {
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Cancelled." }]);
  };

  const newChat = () => {
    setMessages([]);
    setProposal(null);
    setInput("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Desky</span>
          <span className="text-xs text-muted-foreground">your recruiting PA</span>
          <div className="ml-auto flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={newChat} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
                New
              </button>
            )}
            <kbd className="hidden sm:inline text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">esc</kbd>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/40 border border-border"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
              </div>
            )}
            {proposal && (
              <div className="border border-primary/40 bg-primary/5 rounded-lg p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-primary font-medium">Confirm action</div>
                <div className="text-sm">{proposal.summary}</div>
                {proposal.kind === "draft_message" && proposal.params?.body && (
                  <div className="text-xs text-muted-foreground bg-background/60 border border-border rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {proposal.params.body}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={confirmProposal}
                    className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancelProposal}
                    className="text-xs border border-border rounded px-3 py-1.5 hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {messages.length === 0 && (
          <div className="px-4 pt-4 pb-2 text-xs text-muted-foreground">
            Try: <span className="text-foreground">"Add Maciej to first interview on the Java job"</span> · <span className="text-foreground">"Remind me to call David tomorrow"</span> · <span className="text-foreground">"Who's at offer on the PMM role?"</span>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-2 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder="Tell Desky what to do…"
            disabled={busy || !!proposal}
            className="flex-1 resize-none rounded-lg bg-muted/30 border border-border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[38px] max-h-[120px] disabled:opacity-60"
            style={{ height: "38px" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "38px";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || busy || !!proposal}
            className="h-[38px] w-[38px] flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeskyAssistantTrigger() {
  const { setOpen } = useDeskyAssistant();
  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-6 right-6 z-50 h-11 pl-3 pr-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 flex items-center gap-2 text-sm"
      aria-label="Open Desky assistant (⌘K)"
    >
      <Sparkles className="h-4 w-4" />
      <span>Ask Desky</span>
      <kbd className="hidden sm:inline text-[10px] bg-primary-foreground/20 rounded px-1.5 py-0.5">⌘K</kbd>
    </button>
  );
}
