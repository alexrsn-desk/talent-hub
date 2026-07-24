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

// Best-effort extraction of prefill fields (job title, company) from the note body.
// Conservative: only returns values when a clear pattern is present.
export function extractCandidateHints(text: string): { job_title?: string; current_employer?: string } {
  const out: { job_title?: string; current_employer?: string } = {};
  if (!text) return out;

  // "at Acme" / "@ Acme Corp" — capture up to 4 capitalised words
  const atCompany = text.match(/(?:^|\s)(?:at|@)\s+([A-Z][A-Za-z0-9&.\-']*(?:\s+[A-Z][A-Za-z0-9&.\-']*){0,3})/);
  if (atCompany) out.current_employer = atCompany[1].trim();

  // "works at Acme" / "from Acme"
  if (!out.current_employer) {
    const worksAt = text.match(/(?:works?|working)\s+(?:at|for)\s+([A-Z][A-Za-z0-9&.\-']*(?:\s+[A-Z][A-Za-z0-9&.\-']*){0,3})/);
    if (worksAt) out.current_employer = worksAt[1].trim();
  }

  // Job title: "<Senior/Lead/…>? <Title Case Role Words> at …"  or "is a <role>"
  const titleWord = "(?:Senior|Junior|Lead|Head|Chief|Principal|Staff|VP|Director|Manager|Engineer|Designer|Marketer|Analyst|Consultant|Producer|Product|Growth|Data|Software|Frontend|Backend|Full[- ]?Stack|Marketing|Sales|Finance|People|Ops|Operations|Content|Brand|UX|UI)";
  const titleRe = new RegExp(`((?:${titleWord}\\s+){1,4}(?:${titleWord}))`, "i");
  const beforeAt = out.current_employer
    ? text.slice(0, text.toLowerCase().indexOf(out.current_employer.toLowerCase()))
    : text;
  const tMatch = beforeAt.match(titleRe);
  if (tMatch) out.job_title = tMatch[1].trim().replace(/\s+/g, " ");

  // "is a Product Designer"
  if (!out.job_title) {
    const isA = text.match(/\bis\s+(?:a|an)\s+([A-Za-z][A-Za-z\-\s]{2,60}?)(?=[,.]|\s+(?:at|@|who|and|but|with)\b|$)/i);
    if (isA) out.job_title = isA[1].trim().replace(/\s+/g, " ");
  }

  return out;
}

