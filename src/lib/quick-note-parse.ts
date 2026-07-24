// Lightweight heuristic parser for Quick Notes / Brain Dumps.
// Detects intent like "add to X notes that Y", "note on X: Y", "for X — Y",
// "X: Y" (when X looks like a person name).

export type ParsedNoteIntent = {
  targetName: string;
  noteContent: string;
};

// Two capitalised words = likely a person name. Allow accents / hyphens / apostrophes.
const NAME_TOKEN = "[A-ZÀ-Ý][a-zà-ÿ'’\\-]+";
const NAME_RE = new RegExp(`${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,2}`);

const PATTERNS: RegExp[] = [
  // "add to Laura Rojas notes that she wants remote"
  new RegExp(`^\\s*add\\s+to\\s+(${NAME_RE.source})(?:'s)?\\s+(?:notes?|record|profile)\\s+(?:that\\s+|:\\s*)?(.+)$`, "is"),
  // "note on Laura Rojas: she wants remote"  /  "note for Laura Rojas — ..."
  new RegExp(`^\\s*(?:note|update)\\s+(?:on|for|about|re)\\s+(${NAME_RE.source})\\s*[:\\-–—]\\s*(.+)$`, "is"),
  // "for Laura Rojas: she wants remote"
  new RegExp(`^\\s*for\\s+(${NAME_RE.source})\\s*[:\\-–—]\\s*(.+)$`, "is"),
  // "Laura Rojas — only wants startup roles"  /  "Laura Rojas: ..."
  new RegExp(`^\\s*(${NAME_RE.source})\\s*[:\\-–—]\\s*(.+)$`, "is"),
];

export function parseNoteIntent(raw: string): ParsedNoteIntent | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const targetName = m[1].trim();
      const noteContent = m[2].trim();
      if (targetName && noteContent && noteContent.length >= 3) {
        return { targetName, noteContent };
      }
    }
  }
  return null;
}

export type CandidateLite = { id: string; name: string | null; job_title?: string | null; current_employer?: string | null };

// Rank candidates against a parsed target name. Returns matches with a score;
// only "strong" matches (exact / all-tokens) are eligible for auto-attach.
export function matchCandidatesByName(
  target: string,
  candidates: CandidateLite[]
): { strong: CandidateLite[]; near: CandidateLite[] } {
  const t = target.toLowerCase().trim();
  const tTokens = t.split(/\s+/).filter(Boolean);
  const strong: CandidateLite[] = [];
  const near: CandidateLite[] = [];
  for (const c of candidates) {
    const n = (c.name || "").toLowerCase().trim();
    if (!n) continue;
    if (n === t) { strong.push(c); continue; }
    const nTokens = n.split(/\s+/).filter(Boolean);
    const allTokensPresent = tTokens.every((tok) => nTokens.some((nt) => nt === tok));
    if (allTokensPresent && tTokens.length >= 2) {
      strong.push(c);
    } else if (tTokens.some((tok) => nTokens.some((nt) => nt.startsWith(tok) || tok.startsWith(nt)))) {
      near.push(c);
    }
  }
  return { strong, near };
}
