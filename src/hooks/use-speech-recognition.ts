import { useCallback, useEffect, useRef, useState } from "react";

// Minimal wrapper around browser-native SpeechRecognition (Chrome/Edge/Safari).
// Emits interim + final results via onTranscript callbacks.
export function useSpeechRecognition(opts: {
  onFinal: (chunk: string) => void;
  onInterim?: (chunk: string) => void;
  lang?: string;
} = { onFinal: () => {} }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const start = useCallback(async () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = opts.lang || navigator.language || "en-US";
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = r[0]?.transcript ?? "";
          if (r.isFinal) opts.onFinal(txt);
          else opts.onInterim?.(txt);
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
      return true;
    } catch {
      setListening(false);
      return false;
    }
  }, [opts]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  return { supported, listening, start, stop };
}
