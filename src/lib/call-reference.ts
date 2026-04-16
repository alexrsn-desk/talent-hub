import { supabase } from "@/integrations/supabase/client";

export const CALL_REF_PREFIX = "[CALL_REF:";

export interface ParsedCallRef {
  callNoteId: string;
  source: string;
  duration: number | null;
  outcome: string | null;
}

/** Build the reference content string stored in the Notes tab entry */
export function buildCallRefContent(opts: {
  callNoteId: string;
  source: string; // e.g. "Manual entry", "Sourcewhale", "Fireflies", "Twilio"
  duration?: number | null;
  outcome?: string | null;
}): string {
  const parts = ["Transcript added", opts.source];
  if (opts.duration) parts.push(`${opts.duration} mins`);
  if (opts.outcome) parts.push(opts.outcome);
  return `${CALL_REF_PREFIX}${opts.callNoteId}] ${parts.join(" — ")}`;
}

/** Parse a note's content as a call reference. Returns null if not a reference. */
export function parseCallRef(content: string): ParsedCallRef | null {
  if (!content.startsWith(CALL_REF_PREFIX)) return null;
  const closeIdx = content.indexOf("]");
  if (closeIdx === -1) return null;
  const callNoteId = content.slice(CALL_REF_PREFIX.length, closeIdx);
  const rest = content.slice(closeIdx + 1).trim();
  // Expected: "Transcript added — <source> — [duration] — [outcome]"
  const parts = rest.split(" — ").map(p => p.trim());
  // parts[0] = "Transcript added", [1] = source, [2..] mixed duration/outcome
  const source = parts[1] || "Manual entry";
  let duration: number | null = null;
  let outcome: string | null = null;
  for (let i = 2; i < parts.length; i++) {
    const m = parts[i].match(/^(\d+)\s*mins?$/);
    if (m) duration = parseInt(m[1]);
    else outcome = parts[i];
  }
  return { callNoteId, source, duration, outcome };
}

export function isCallRef(content: string): boolean {
  return content.startsWith(CALL_REF_PREFIX);
}

/** Find an existing reference note pointing at the given call note */
export async function findExistingCallRef(callNoteId: string): Promise<string | null> {
  const { data } = await supabase
    .from("notes")
    .select("id, content")
    .ilike("content", `${CALL_REF_PREFIX}${callNoteId}]%`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Upsert a reference note for a call. Creates if missing, updates content if exists. */
export async function upsertCallRefNote(opts: {
  callNoteId: string;
  source: string;
  duration?: number | null;
  outcome?: string | null;
  candidate_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  created_at?: string; // align with the call's timestamp
}) {
  const content = buildCallRefContent(opts);
  const existingId = await findExistingCallRef(opts.callNoteId);
  if (existingId) {
    await supabase.from("notes").update({ content }).eq("id", existingId);
    return existingId;
  }
  const { data } = await supabase
    .from("notes")
    .insert({
      content,
      activity_type: "Note",
      candidate_id: opts.candidate_id ?? null,
      client_id: opts.client_id ?? null,
      job_id: opts.job_id ?? null,
      created_at: opts.created_at,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}
