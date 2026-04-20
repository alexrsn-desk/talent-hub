import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, GripVertical, Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  useScreeningPreferences,
  useUpsertScreeningPreferences,
  DEFAULT_SECTIONS,
  type ScreeningSection,
} from "@/hooks/use-screening-preferences";

const TONES = [
  { value: "formal", label: "Formal and professional" },
  { value: "direct", label: "Direct and concise" },
  { value: "warm", label: "Warm and conversational" },
  { value: "match_examples", label: "Match my examples below" },
] as const;

const POVS = [
  { value: "first_person", label: "First person (I recommend Sarah because...)" },
  { value: "third_person", label: "Third person (Sarah is a strong fit because...)" },
] as const;

const LENGTHS = [
  { value: "brief", label: "Brief — key points only" },
  { value: "standard", label: "Standard — enough to make the case" },
  { value: "detailed", label: "Detailed — full picture for the client" },
] as const;

const FORMATS = [
  { value: "paragraphs", label: "Paragraphs" },
  { value: "bullets", label: "Bullet points" },
  { value: "sentence", label: "Single sentence" },
  { value: "free", label: "Free field" },
] as const;

const SECTION_LENGTHS = [
  { value: "brief", label: "Brief" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
] as const;

export function ScreeningTemplateSettings() {
  const { data, isLoading } = useScreeningPreferences();
  const upsert = useUpsertScreeningPreferences();

  const [sections, setSections] = useState<ScreeningSection[]>(DEFAULT_SECTIONS);
  const [tone, setTone] = useState<string>("direct");
  const [pov, setPov] = useState<string>("first_person");
  const [length, setLength] = useState<string>("standard");
  const [examples, setExamples] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    if (!data) return;
    setSections((data.sections && data.sections.length > 0) ? data.sections : DEFAULT_SECTIONS);
    setTone(data.tone || "direct");
    setPov(data.pov || "first_person");
    setLength(data.length || "standard");
    const padded = [...(data.examples || [])];
    while (padded.length < 3) padded.push("");
    setExamples(padded.slice(0, 3));
  }, [data]);

  const updateSection = (idx: number, patch: Partial<ScreeningSection>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const addCustomSection = () => {
    setSections((prev) => [
      ...prev,
      {
        key: `custom_${Date.now()}`,
        name: "New section",
        enabled: true,
        format: "paragraphs",
        length: "standard",
        required: false,
      },
    ]);
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        sections,
        tone: tone as any,
        pov: pov as any,
        length: length as any,
        examples: examples.map((e) => e.trim()).filter(Boolean),
      });
      toast.success("Screening template saved — future drafts will use your preferences");
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    }
  };

  if (isLoading) {
    return (
      <div className="pt-6 border-t border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pt-6 border-t border-border space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Screening Notes Template</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Customise how AI drafts your screening notes. Your template applies every time a candidate enters the Screening stage.
      </p>

      {/* Section 1 — Format builder */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Format — sections and order
        </Label>
        <p className="text-[11px] text-muted-foreground">
          Toggle sections on/off, rename them, and reorder. These become the structure of every AI draft.
        </p>

        <div className="space-y-2">
          {sections.map((s, idx) => (
            <div
              key={s.key}
              className="rounded-md border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Checkbox
                  checked={s.enabled}
                  onCheckedChange={(v) => updateSection(idx, { enabled: !!v })}
                />
                <Input
                  value={s.name}
                  onChange={(e) => updateSection(idx, { name: e.target.value })}
                  className="h-7 text-xs flex-1"
                />
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => move(idx, 1)}
                    disabled={idx === sections.length - 1}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  {s.key.startsWith("custom_") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeSection(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {s.enabled && (
                <div className="flex items-center gap-2 pl-6">
                  <Select value={s.format} onValueChange={(v) => updateSection(idx, { format: v as any })}>
                    <SelectTrigger className="h-7 text-[11px] flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={s.length} onValueChange={(v) => updateSection(idx, { length: v as any })}>
                    <SelectTrigger className="h-7 text-[11px] flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_LENGTHS.map((l) => (
                        <SelectItem key={l.value} value={l.value} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={s.required}
                      onCheckedChange={(v) => updateSection(idx, { required: !!v })}
                    />
                    Required
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addCustomSection}>
          <Plus className="h-3 w-3" /> Add custom section
        </Button>
      </div>

      {/* Section 2 — Tone and style */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tone and style
        </Label>

        <div className="space-y-2">
          <Label className="text-xs">Writing style</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Point of view</Label>
          <Select value={pov} onValueChange={setPov}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POVS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-sm">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Length preference</Label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LENGTHS.map((l) => (
                <SelectItem key={l.value} value={l.value} className="text-sm">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section 3 — Style examples */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Style examples
        </Label>
        <p className="text-[11px] text-muted-foreground">
          Paste 1–3 examples of submissions you're proud of. The AI matches your voice — sentence structure, vocabulary, how you frame enthusiasm and concerns.
        </p>

        {examples.map((ex, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Example {i + 1}</Label>
            <Textarea
              value={ex}
              onChange={(e) => {
                const next = [...examples];
                next[i] = e.target.value;
                setExamples(next);
              }}
              placeholder="Paste an example of a submission you are proud of. The AI will match this style."
              rows={5}
              className="text-xs"
            />
          </div>
        ))}

        <p className="text-[10px] text-muted-foreground italic">
          Your examples are used only to calibrate the writing style. They are never shared or used outside your account.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save template
        </Button>
      </div>
    </div>
  );
}
