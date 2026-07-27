// User preferences for voice dictation in Quick Notes.
// Stored in localStorage so they persist across sessions per browser.

export type VoiceDictationMode = "manual" | "auto";

const MODE_KEY = "voice_dictation_mode";
const SILENCE_KEY = "voice_dictation_silence_seconds";
const TRIGGER_KEY = "voice_dictation_trigger_phrase";

export const DEFAULT_MODE: VoiceDictationMode = "auto";
export const DEFAULT_SILENCE_SECONDS = 6;
export const DEFAULT_TRIGGER_PHRASE = "save note";

export function getVoiceMode(): VoiceDictationMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "manual" || v === "auto" ? v : DEFAULT_MODE;
}
export function setVoiceMode(v: VoiceDictationMode) {
  window.localStorage.setItem(MODE_KEY, v);
  window.dispatchEvent(new Event("voice-dictation-settings-changed"));
}

export function getSilenceSeconds(): number {
  if (typeof window === "undefined") return DEFAULT_SILENCE_SECONDS;
  const n = Number(window.localStorage.getItem(SILENCE_KEY));
  if (!Number.isFinite(n) || n < 2 || n > 30) return DEFAULT_SILENCE_SECONDS;
  return n;
}
export function setSilenceSeconds(n: number) {
  window.localStorage.setItem(SILENCE_KEY, String(n));
  window.dispatchEvent(new Event("voice-dictation-settings-changed"));
}

export function getTriggerPhrase(): string {
  if (typeof window === "undefined") return DEFAULT_TRIGGER_PHRASE;
  return (window.localStorage.getItem(TRIGGER_KEY) || DEFAULT_TRIGGER_PHRASE).toLowerCase();
}
export function setTriggerPhrase(v: string) {
  window.localStorage.setItem(TRIGGER_KEY, v.trim().toLowerCase());
  window.dispatchEvent(new Event("voice-dictation-settings-changed"));
}

// Strip a trailing trigger phrase like "save note" from the transcript.
// Returns { text, triggered } where triggered=true if the phrase was found.
export function stripTriggerPhrase(text: string, phrase = getTriggerPhrase()): { text: string; triggered: boolean } {
  if (!phrase) return { text, triggered: false };
  // Match phrase near the end (allow trailing punctuation/whitespace), case-insensitive.
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b[\\s.!?,]*$`, "i");
  if (re.test(text)) {
    return { text: text.replace(re, "").trimEnd(), triggered: true };
  }
  // Also match anywhere if user pauses/says it mid-flow — safer to only strip trailing to avoid false positives.
  return { text, triggered: false };
}
