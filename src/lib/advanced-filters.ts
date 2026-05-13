// Helpers for the Advanced Search filters used on Candidates / Contacts.

export const SENIORITY_LEVELS = [
  "Junior", "Mid", "Senior", "Lead", "Head of", "VP", "Director", "C-Suite",
] as const;
export type Seniority = typeof SENIORITY_LEVELS[number];

export function inferSeniority(title?: string | null): Seniority | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|cpo|chief)\b/.test(t)) return "C-Suite";
  if (/\b(vp|vice president)\b/.test(t)) return "VP";
  if (/\b(director)\b/.test(t)) return "Director";
  if (/\bhead of\b/.test(t)) return "Head of";
  if (/\b(lead|principal|staff)\b/.test(t)) return "Lead";
  if (/\b(senior|sr\.?|snr)\b/.test(t)) return "Senior";
  if (/\b(junior|jr\.?|graduate|trainee|intern)\b/.test(t)) return "Junior";
  if (/\b(mid|intermediate)\b/.test(t)) return "Mid";
  return null;
}

export const LAST_CONTACT_BUCKETS = [
  { value: "any", label: "Any time" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "1-3m", label: "1–3 months" },
  { value: "3-6m", label: "3–6 months" },
  { value: "6m+", label: "6+ months" },
  { value: "never", label: "Never contacted" },
] as const;
export type LastContactBucket = typeof LAST_CONTACT_BUCKETS[number]["value"];

export function lastContactBucket(lastDate?: string | null): LastContactBucket {
  if (!lastDate) return "never";
  const days = (Date.now() - new Date(lastDate).getTime()) / 86400000;
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (days <= 90) return "1-3m";
  if (days <= 180) return "3-6m";
  return "6m+";
}

export function matchesLastContact(lastDate: string | null | undefined, bucket: LastContactBucket): boolean {
  if (bucket === "any") return true;
  return lastContactBucket(lastDate) === bucket;
}
