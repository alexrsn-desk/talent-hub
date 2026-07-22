import { useState, useRef, useEffect, createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Loader2, Trash2, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFeatureLimit, useLogUsage } from "@/hooks/use-usage";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recruitment-coach`;

const SUGGESTIONS = [
  "Where should I focus today?",
  "Which deals are at risk?",
  "Draft an outreach message",
  "Review my BD pipeline",
];

// ─── Streaming helper ───
async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      onError(body.error || `Error ${resp.status}`);
      return;
    }
    if (!resp.body) { onError("No response body"); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw || !raw.startsWith("data: ")) continue;
        const jsonStr = raw.replace(/\r$/, "").slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {}
      }
    }
    onDone();
  } catch (e: any) {
    onError(e?.message || "Connection failed");
  }
}

// ─── Context for floating panel state ───
type CoachPanelContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  hasAlert: boolean;
  setHasAlert: (v: boolean) => void;
};

const CoachPanelContext = createContext<CoachPanelContextType>({
  open: false, setOpen: () => {}, hasAlert: false, setHasAlert: () => {},
});

export const useCoachPanel = () => useContext(CoachPanelContext);

export function CoachPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);
  return (
    <CoachPanelContext.Provider value={{ open, setOpen, hasAlert, setHasAlert }}>
      {children}
    </CoachPanelContext.Provider>
  );
}

// ─── Copy button for code blocks / generated content ───
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Detect blocks that look like generated messages ───
function MessageContent({ content }: { content: string }) {
  // Find fenced code blocks or "Subject:" patterns that indicate generated content
  const hasGeneratedContent = content.includes("```") ||
    content.match(/^(Subject:|Hi |Dear |Hey )/m);

  return (
    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          // Add copy buttons to code blocks
          pre: ({ children, ...props }) => {
            const codeText = extractTextFromChildren(children);
            return (
              <div className="relative group">
                <pre {...props} className="bg-muted/80 rounded-md p-3 text-xs overflow-x-auto">
                  {children}
                </pre>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton text={codeText} />
                </div>
              </div>
            );
          },
          // Style blockquotes as "generated content" with copy
          blockquote: ({ children, ...props }) => {
            const text = extractTextFromChildren(children);
            return (
              <div className="border-l-2 border-primary/50 bg-primary/5 rounded-r-md pl-3 pr-3 py-2 my-2">
                <blockquote {...props} className="not-italic text-foreground [&>p]:m-0">
                  {children}
                </blockquote>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                  <CopyButton text={text} />
                </div>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function extractTextFromChildren(children: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (children?.props?.children) return extractTextFromChildren(children.props.children);
  return "";
}

// ─── Floating Coach Button ───
export function CoachFloatingButton() {
  const { open, setOpen, hasAlert, setHasAlert } = useCoachPanel();

  return (
    <button
      onClick={() => { setOpen(!open); setHasAlert(false); }}
      className={`fixed z-50 right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] sm:bottom-[4.75rem] flex items-center justify-center h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 ${
        hasAlert ? "animate-pulse" : ""
      }`}
      title="AI Coach"
    >
      <Sparkles className="h-5 w-5" />
      {hasAlert && (
        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive border-2 border-background" />
      )}
    </button>
  );
}

// ─── Slide-in Panel ───
export function CoachPanel() {
  const { open, setOpen, setHasAlert } = useCoachPanel();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [proactiveSent, setProactiveSent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Proactive daily alert — trigger on first open of the day
  useEffect(() => {
    const todayKey = `coach_proactive_${new Date().toISOString().split("T")[0]}`;
    if (!sessionStorage.getItem(todayKey)) {
      setHasAlert(true);
    }
  }, [setHasAlert]);

  // When panel opens and proactive hasn't been sent today, auto-send
  useEffect(() => {
    if (!open || proactiveSent) return;
    const todayKey = `coach_proactive_${new Date().toISOString().split("T")[0]}`;
    if (sessionStorage.getItem(todayKey)) return;

    sessionStorage.setItem(todayKey, "1");
    setProactiveSent(true);

    // Auto-trigger a proactive message
    const proactiveMsg: Msg = { role: "user", content: "It's the start of my day. Scan my desk and tell me the single most important thing I should focus on right now. Be direct." };
    setMessages([proactiveMsg]);
    setIsLoading(true);

    let content = "";
    streamChat({
      messages: [proactiveMsg],
      onDelta: (chunk) => {
        content += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
          }
          return [...prev, { role: "assistant", content }];
        });
      },
      onDone: () => setIsLoading(false),
      onError: (err) => { toast.error(err); setIsLoading(false); },
    });
  }, [open, proactiveSent, setHasAlert]);

  const coachLimit = useFeatureLimit("coach_query");
  const logUsage = useLogUsage();

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!coachLimit.canUse) {
      toast.error("Monthly coach query limit reached");
      return;
    }
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    logUsage.mutate({ featureType: "coach_query", isGrace: coachLimit.graceGranted });

    let assistantContent = "";
    await streamChat({
      messages: newMessages,
      onDelta: (chunk) => {
        assistantContent += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
          }
          return [...prev, { role: "assistant", content: assistantContent }];
        });
      },
      onDone: () => setIsLoading(false),
      onError: (err) => { toast.error(err); setIsLoading(false); },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md flex flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Coach</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setMessages([]); setInput(""); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Sparkles className="h-6 w-6 text-primary" />
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              I can see your full desk. Ask me anything.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs border border-border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 border border-border"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MessageContent content={msg.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2.5 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[36px] max-h-[100px]"
            style={{ height: "36px" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "36px";
              t.style.height = Math.min(t.scrollHeight, 100) + "px";
            }}
          />
          <Button size="icon" onClick={() => send(input)} disabled={!input.trim() || isLoading} className="h-9 w-9 shrink-0">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
