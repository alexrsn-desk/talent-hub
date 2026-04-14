import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";

function generateICS(event: {
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string;
  organizerEmail: string;
  attendees: string[];
}): string {
  const formatDate = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = crypto.randomUUID();
  const now = formatDate(new Date().toISOString());

  const attendeeLines = event.attendees
    .map((email) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${email}:mailto:${email}`)
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RecruiterCRM//Interview//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatDate(event.start)}`,
    `DTEND:${formatDate(event.end)}`,
    `SUMMARY:${event.summary}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${event.location}`,
    `ORGANIZER;CN=Recruiter:mailto:${event.organizerEmail}`,
    attendeeLines,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { slot_id, client_id } = await req.json();

    // Get the slot details
    const { data: slot, error: slotErr } = await supabase
      .from("interview_slots")
      .select("*, candidate_jobs(*, candidates(*), jobs(*, clients(*)))")
      .eq("id", slot_id)
      .single();

    if (slotErr || !slot) throw new Error("Slot not found");

    const candidateJob = slot.candidate_jobs;
    const candidate = candidateJob?.candidates;
    const job = candidateJob?.jobs;
    const client = job?.clients;

    // Mark slot as confirmed and update interview_date on candidate_job
    await supabase
      .from("interview_slots")
      .update({ status: "confirmed", selected_by_client: true })
      .eq("id", slot_id);

    // Mark other slots for this candidate_job as unavailable
    await supabase
      .from("interview_slots")
      .update({ status: "unavailable" })
      .eq("candidate_job_id", candidateJob.id)
      .neq("id", slot_id);

    // Set interview date on candidate_job
    await supabase
      .from("candidate_jobs")
      .update({ interview_date: slot.start_time, stage: "First Interview" })
      .eq("id", candidateJob.id);

    // Get recruiter profile for organizer details
    const { data: profile } = await supabase
      .from("recruiter_profiles")
      .select("display_name, agency_name")
      .limit(1)
      .single();

    // Get recruiter's email from auth
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const recruiterEmail = users?.[0]?.email || "recruiter@agency.com";

    // Collect all attendee emails
    const attendees: string[] = [recruiterEmail];
    if (candidate?.email) attendees.push(candidate.email);
    if (client?.email) attendees.push(client.email);

    const agencyName = profile?.agency_name || profile?.display_name || "Your Recruiter";
    const eventSummary = `Interview: ${candidate?.name || "Candidate"} — ${job?.title || "Role"} at ${client?.company_name || "Company"}`;
    const eventDescription = [
      `Interview for ${job?.title || "Role"}`,
      `Candidate: ${candidate?.name || "TBC"}`,
      `Company: ${client?.company_name || "TBC"}`,
      `Arranged by: ${agencyName}`,
    ].join("\n");

    const icsContent = generateICS({
      summary: eventSummary,
      description: eventDescription,
      start: slot.start_time,
      end: slot.end_time,
      location: job?.location || "TBC",
      organizerEmail: recruiterEmail,
      attendees,
    });

    // Send calendar invite via Outlook
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OUTLOOK_KEY = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");

    if (LOVABLE_API_KEY && OUTLOOK_KEY) {
      // Send to each attendee (except recruiter — they get it as organizer)
      const recipientEmails = attendees.filter((e) => e !== recruiterEmail);

      for (const recipientEmail of recipientEmails) {
        const emailPayload = {
          message: {
            subject: eventSummary,
            body: {
              contentType: "HTML",
              content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                  <h2 style="color: #333;">Interview Confirmed</h2>
                  <p><strong>Role:</strong> ${job?.title || "TBC"}</p>
                  <p><strong>Company:</strong> ${client?.company_name || "TBC"}</p>
                  <p><strong>Candidate:</strong> ${candidate?.name || "TBC"}</p>
                  <p><strong>Date:</strong> ${new Date(slot.start_time).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                  <p><strong>Time:</strong> ${new Date(slot.start_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — ${new Date(slot.end_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p><strong>Location:</strong> ${job?.location || "TBC"}</p>
                  <br>
                  <p style="color: #666;">Please find the calendar invite attached. Add it to your calendar to confirm.</p>
                  <p style="color: #999; font-size: 12px;">Arranged by ${agencyName}</p>
                </div>
              `,
            },
            toRecipients: [{ emailAddress: { address: recipientEmail } }],
            attachments: [
              {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: "interview.ics",
                contentType: "text/calendar; method=REQUEST",
                contentBytes: btoa(icsContent),
              },
            ],
          },
        };

        await fetch(`${GATEWAY_URL}/me/sendMail`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": OUTLOOK_KEY,
          },
          body: JSON.stringify(emailPayload),
        });
      }
    }

    // Create notification for recruiter
    await supabase.from("notifications").insert({
      type: "interview_confirmed",
      title: "Interview Confirmed",
      message: `${client?.company_name || "Client"} confirmed interview with ${candidate?.name || "candidate"} for ${new Date(slot.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      data: { candidate_job_id: candidateJob.id, slot_id },
    });

    // Generate Google Calendar link for fallback
    const gcalStart = new Date(slot.start_time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const gcalEnd = new Date(slot.end_time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventSummary)}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(eventDescription)}&location=${encodeURIComponent(job?.location || "")}`;

    return new Response(
      JSON.stringify({
        success: true,
        google_calendar_url: googleCalUrl,
        message: "Interview confirmed and calendar invites sent",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
