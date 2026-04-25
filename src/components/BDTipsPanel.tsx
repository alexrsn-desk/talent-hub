import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lightbulb, ChevronDown } from "lucide-react";

const STORAGE_KEY = "bd-tips-open-sections";

type SectionProps = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  openMap: Record<string, boolean>;
  setOpenMap: (m: Record<string, boolean>) => void;
  children: React.ReactNode;
};

function Section({ id, title, defaultOpen = true, openMap, setOpenMap, children }: SectionProps) {
  const isOpen = openMap[id] ?? defaultOpen;
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(v) => setOpenMap({ ...openMap, [id]: v })}
      className="rounded-lg border border-border bg-card/50"
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg">
        <span className="text-sm font-semibold tracking-tight">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-1 text-sm text-foreground/90 leading-relaxed space-y-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function BDTipsButton() {
  const [open, setOpen] = useState(false);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenMap(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
    } catch {}
  }, [openMap]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
          Tips
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            How To Win BD Conversations
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 pb-8">
          <Section id="golden" title="The Golden Rule" openMap={openMap} setOpenMap={setOpenMap}>
            <p>Never make someone feel like you are only there for their job orders.</p>
            <p>The moment they feel sold to — the conversation closes.</p>
            <p className="text-foreground font-medium">Be genuinely useful first. Business follows naturally.</p>
          </Section>

          <Section id="avoid" title="Avoid These Openers" openMap={openMap} setOpenMap={setOpenMap}>
            <ul className="space-y-1.5">
              <li className="text-destructive/90">❌ Do you have any live roles at the moment?</li>
              <li className="text-destructive/90">❌ I wanted to reach out about your hiring plans</li>
              <li className="text-destructive/90">❌ We have some great candidates for your team</li>
              <li className="text-destructive/90">❌ Just checking in to see if you need any help</li>
            </ul>
          </Section>

          <Section id="use" title="Use These Instead" openMap={openMap} setOpenMap={setOpenMap}>
            <div className="space-y-3">
              <div>
                <p className="text-success font-medium">✅ Reference something specific about them</p>
                <p className="text-muted-foreground text-xs mt-0.5">Their company news, a LinkedIn post, a mutual connection, something from a previous conversation.</p>
              </div>
              <div>
                <p className="text-success font-medium">✅ Lead with value</p>
                <p className="text-muted-foreground text-xs mt-0.5">A relevant candidate profile, market salary data, a hiring trend in their sector.</p>
              </div>
              <div>
                <p className="text-success font-medium">✅ Ask about their world — not your agenda</p>
                <p className="text-muted-foreground text-xs mt-0.5 italic">"What is the biggest challenge your team is facing right now?"</p>
                <p className="text-muted-foreground text-xs italic">"What does growth look like for you over the next 12 months?"</p>
              </div>
              <div>
                <p className="text-success font-medium">✅ The soft door open</p>
                <p className="text-muted-foreground text-xs mt-0.5 italic">"Would it be useful if I kept you updated when strong profiles come up in your space? No obligation — just so you are aware of who is out there."</p>
              </div>
            </div>
          </Section>

          <Section id="structure" title="The Exploratory Call Structure" openMap={openMap} setOpenMap={setOpenMap}>
            <div className="space-y-3">
              <div>
                <p className="font-medium">5 mins — Genuine personal connection</p>
                <p className="text-muted-foreground text-xs">Something about them, not you. Curiosity not flattery.</p>
              </div>
              <div>
                <p className="font-medium">15 mins — Their world</p>
                <p className="text-muted-foreground text-xs">Listen more than you talk. Understand their challenges and plans.</p>
              </div>
              <div>
                <p className="font-medium">10 mins — Where you can add value</p>
                <p className="text-muted-foreground text-xs">Share market insights. Mention relevant profiles. Be useful not salesy.</p>
              </div>
              <div>
                <p className="font-medium">5 mins — Soft door open and close</p>
                <p className="text-muted-foreground text-xs">Agree a specific reason to speak again — not a vague follow up sales call.</p>
              </div>
            </div>
          </Section>

          <Section id="vs" title="Exploratory Meeting vs Hiring Discussion" openMap={openMap} setOpenMap={setOpenMap}>
            <div className="space-y-3">
              <div>
                <p className="font-medium text-primary">Exploratory Meeting</p>
                <p className="text-muted-foreground text-xs mt-0.5">For hiring decision makers — CTOs, VPs, Heads of Engineering, Founders, CPOs.</p>
                <p className="text-muted-foreground text-xs mt-1">Goal is understanding and rapport. Hiring may not come up at all. That is fine and expected.</p>
                <p className="text-muted-foreground text-xs mt-1">Senior candidates who could become future clients sit here too — place them first, build the BD relationship after.</p>
              </div>
              <div>
                <p className="font-medium text-primary">Hiring Discussion</p>
                <p className="text-muted-foreground text-xs mt-0.5">Only when they have confirmed a genuine hiring need.</p>
                <p className="text-muted-foreground text-xs mt-1">Now you can go deep on the brief, process, budget and timeline.</p>
                <p className="text-muted-foreground text-xs mt-1">Do not rush to get here — a rushed hiring conversation with no relationship behind it rarely converts.</p>
              </div>
            </div>
          </Section>

          <Section id="compound" title="The Compound Effect" openMap={openMap} setOpenMap={setOpenMap}>
            <p>One good exploratory conversation today might become a placement in 6 months.</p>
            <p>A placement today might become a key client relationship for years.</p>
            <p className="text-foreground font-medium">Think in relationships not transactions.</p>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
