// Draft interview-related messages: confirmation, prep_pack, day_before,
// good_luck, client_chase. Vendor-neutral chat completions API — works with
// Gemini, Claude, GPT, etc. via the Lovable AI gateway.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Kind = "confirmation" | "prep_pack" | "day_before" | "good_luck" | "client_chase";

interface Body {
  kind: Kind;
  candidate_first_name: string;
  candidate_full_name?: string;
  client_company?: string | null;
  job_title?: string | null;
  recruiter_name?: string | null;

  // Interview details
  date_human?: string | null;       // "Tuesday 6 May"
  time_human?: string | null;       // "10:30am"
  format?: string | null;           // In person | Video call | Phone
  location?: string | null;
  interviewers?: string | null;
  interview_type?: string | null;
  duration_mins?: number | null;
  prep_focus?: string | null;       // free-text recruiter notes

  // For prep_pack
  client_notes?: string | null;
  job_description?: string | null;
  screening_notes?: string | null;
  previous_interview_feedback?: string | null;
  recruiter_advice?: string | null;

  // For client_chase
  client_contact_first_name?: string | null;
  interview_day_human?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.kind) return json({ error: "kind is required" }, 400);
    if (!body.candidate_first_name && body.kind !== "client_chase") {
      return json({ error: "candidate_first_name is required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const recruiter = body.recruiter_name || "your recruiter";

    let system = "";
    let user = "";

    if (body.kind === "confirmation") {
      system = [
        "You draft interview confirmation emails for a recruiter to send to a candidate.",
        "Tone: warm, direct, professional, no corporate jargon. Recruiter's natural voice.",
        "Do not invent facts. Use only the details supplied.",
        "Output JSON: {\"subject\": string, \"body\": string}. Body is plain text with line breaks. No markdown.",
      ].join(" ");
      user = [
        `Candidate first name: ${body.candidate_first_name}`,
        `Company: ${body.client_company ?? ""}`,
        `Role: ${body.job_title ?? ""}`,
        `Date: ${body.date_human ?? ""}`,
        `Time: ${body.time_human ?? ""}`,
        `Format: ${body.format ?? ""}`,
        `Location / link: ${body.location ?? ""}`,
        `Interviewers: ${body.interviewers ?? ""}`,
        `Interview type: ${body.interview_type ?? ""}`,
        `Duration: ${body.duration_mins ? body.duration_mins + " mins" : ""}`,
        `Recruiter name: ${recruiter}`,
        "",
        "Draft an upbeat confirmation. Mention prep notes will follow. End with 'Good luck — though I do not think you will need it.' then the recruiter name.",
        "Return JSON only.",
      ].join("\n");
    } else if (body.kind === "prep_pack") {
      system = [
        "You build interview prep packs for a recruiter to send a candidate.",
        "Use ONLY the supplied client notes, job description, screening notes and previous feedback.",
        "Do not invent company facts. If a section has no source material, write 'No notes on file — recruiter to add'.",
        "Tone: warm, direct, practical. Plain text, no markdown.",
        "Sections in this exact order with these exact headings:",
        "ABOUT THE COMPANY", "THE ROLE", "WHO YOU ARE MEETING", "PREPARE FOR THESE QUESTIONS",
        "QUESTIONS TO ASK THEM", "LOGISTICS", "MY ADVICE",
        "Under PREPARE FOR THESE QUESTIONS produce 5-7 likely questions specific to the role and client preferences (not generic).",
        "Under QUESTIONS TO ASK THEM produce 3-5 specific questions tied to this client and role — not generic.",
        "Under MY ADVICE include the recruiter_advice text verbatim if supplied; otherwise 'Recruiter to add'.",
        "Open with 'Hi [First Name],' and close with the recruiter name. No subject line.",
      ].join(" ");
      user = [
        `Candidate first name: ${body.candidate_first_name}`,
        `Company: ${body.client_company ?? ""}`,
        `Role: ${body.job_title ?? ""}`,
        `Interview date/time: ${body.date_human ?? ""} ${body.time_human ?? ""}`,
        `Format: ${body.format ?? ""}`,
        `Location / link: ${body.location ?? ""}`,
        `Interviewers: ${body.interviewers ?? ""}`,
        `Interview type: ${body.interview_type ?? ""}`,
        `Duration: ${body.duration_mins ? body.duration_mins + " mins" : ""}`,
        `Recruiter name: ${recruiter}`,
        "",
        "--- CLIENT NOTES ---",
        body.client_notes || "(none)",
        "--- JOB DESCRIPTION ---",
        body.job_description || "(none)",
        "--- SCREENING NOTES ---",
        body.screening_notes || "(none)",
        "--- PREVIOUS INTERVIEW FEEDBACK (if 2nd) ---",
        body.previous_interview_feedback || "(none)",
        "--- RECRUITER ADVICE TO INCLUDE VERBATIM ---",
        body.recruiter_advice || "(none — write 'Recruiter to add')",
      ].join("\n");
    } else if (body.kind === "day_before") {
      system = [
        "You draft a short, warm day-before reminder from a recruiter to a candidate.",
        "3-5 sentences. Plain text. No subject line. Practical and confident.",
        "Mention the time and (if supplied) the location/link. End by asking them to call after the interview.",
      ].join(" ");
      user = [
        `Candidate first name: ${body.candidate_first_name}`,
        `Company: ${body.client_company ?? ""}`,
        `Time: ${body.time_human ?? ""}`,
        `Location / link: ${body.location ?? ""}`,
        `Recruiter name: ${recruiter}`,
      ].join("\n");
    } else if (body.kind === "good_luck") {
      system = [
        "You draft a 2-3 sentence morning-of good luck message from a recruiter to a candidate.",
        "Warm, brief, confident. Plain text. End by asking them to call when done.",
      ].join(" ");
      user = [
        `Candidate first name: ${body.candidate_first_name}`,
        `Company: ${body.client_company ?? ""}`,
        `Recruiter name: ${recruiter}`,
      ].join("\n");
    } else if (body.kind === "client_chase") {
      system = [
        "You draft a brief, polite chase email from a recruiter to a hiring contact asking for interview feedback.",
        "3-4 sentences. Plain text. No subject line. Friendly, not pushy.",
      ].join(" ");
      user = [
        `Client contact first name: ${body.client_contact_first_name ?? "there"}`,
        `Candidate first name: ${body.candidate_first_name}`,
        `Interview day: ${body.interview_day_human ?? ""}`,
        `Recruiter name: ${recruiter}`,
      ].join("\n");
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(body.kind === "confirmation" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (aiRes.status === 429) return json({ error: "Rate limited — try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings." }, 402);
    if (!aiRes.ok) return json({ error: `AI gateway error: ${await aiRes.text()}` }, 500);

    const data = await aiRes.json();
    const content = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (body.kind === "confirmation") {
      try {
        const parsed = JSON.parse(content);
        return json({ subject: parsed.subject ?? "", body: parsed.body ?? "" });
      } catch {
        // Fallback if model didn't honour json
        return json({
          subject: `Interview confirmed — ${body.job_title ?? "your role"} at ${body.client_company ?? ""}`,
          body: content,
        });
      }
    }

    return json({ message: content });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
