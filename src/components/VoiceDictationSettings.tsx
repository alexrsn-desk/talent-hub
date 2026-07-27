import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_SILENCE_SECONDS,
  DEFAULT_TRIGGER_PHRASE,
  getSilenceSeconds,
  getTriggerPhrase,
  getVoiceMode,
  setSilenceSeconds,
  setTriggerPhrase,
  setVoiceMode,
  type VoiceDictationMode,
} from "@/lib/voice-dictation-settings";

export function VoiceDictationSettings() {
  const [mode, setMode] = useState<VoiceDictationMode>("auto");
  const [silence, setSilence] = useState(DEFAULT_SILENCE_SECONDS);
  const [phrase, setPhrase] = useState(DEFAULT_TRIGGER_PHRASE);

  useEffect(() => {
    setMode(getVoiceMode());
    setSilence(getSilenceSeconds());
    setPhrase(getTriggerPhrase());
  }, []);

  return (
    <div className="pt-6 border-t border-border">
      <div className="flex items-center gap-2 mb-1">
        <Mic className="h-4 w-4 text-primary" />
        <h2 className="text-base font-medium">Voice dictation</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Controls how Quick Note dictation stops and saves. Alt+Shift+N triggers hands-free capture from anywhere.
      </p>

      <div className="space-y-3">
        <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${
          mode === "auto" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
        }`}>
          <input
            type="radio"
            name="voice-mode"
            className="mt-1"
            checked={mode === "auto"}
            onChange={() => { setMode("auto"); setVoiceMode("auto"); }}
          />
          <div>
            <p className="text-sm font-medium">Auto-save <span className="text-xs text-muted-foreground font-normal">(recommended for hands-free)</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recording auto-stops after silence and saves immediately — no tap required. Say "{phrase}" to end and save on demand.
            </p>
          </div>
        </label>

        <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${
          mode === "manual" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
        }`}>
          <input
            type="radio"
            name="voice-mode"
            className="mt-1"
            checked={mode === "manual"}
            onChange={() => { setMode("manual"); setVoiceMode("manual"); }}
          />
          <div>
            <p className="text-sm font-medium">Manual confirm</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recording auto-stops after silence or when you say "{phrase}", but waits for you to confirm or discard before saving.
            </p>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground">Silence timeout (seconds)</Label>
            <Input
              type="number"
              min={2}
              max={30}
              value={silence}
              onChange={(e) => {
                const n = Math.max(2, Math.min(30, Number(e.target.value) || DEFAULT_SILENCE_SECONDS));
                setSilence(n); setSilenceSeconds(n);
              }}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Trigger phrase</Label>
            <Input
              value={phrase}
              onChange={(e) => { setPhrase(e.target.value); setTriggerPhrase(e.target.value); }}
              placeholder={DEFAULT_TRIGGER_PHRASE}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
