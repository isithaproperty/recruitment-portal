import { createClient } from "@supabase/supabase-js";
import { interviewCalendar, type InterviewCalendarEvent } from "@/lib/interview-calendar";
import { createHash } from "node:crypto";

type Booking = {
  id: string; current_round: number; interview_status: string; interview_scheduled_at: string | null;
  interview_location: string | null; interview_meeting_link: string | null;
  candidate_applications: { candidate_name: string; email: string } | null;
  client_submissions: { review_token: string | null; recruitment_clients: { company_name: string; contact_name: string | null; contact_email: string | null } | null; jobs: { title: string } | null } | null;
};
function escape(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!)); }
function meetingUrl(value: string | null) {
  if (!value) return "";
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
export async function sendInterviewConfirmation(request: Request, id: string, key: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid interview record." }, { status: 400 });
  const authorization = request.headers.get("authorization") || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return Response.json({ error: "Database is not configured." }, { status: 503 });
  // Resolve the booking and both recipients from saved records under the staff session.
  const database = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await database.from("client_submission_candidates").select("id,current_round,interview_status,interview_scheduled_at,interview_location,interview_meeting_link,candidate_applications(candidate_name,email),client_submissions(review_token,recruitment_clients(company_name,contact_name,contact_email),jobs(title))").eq("id", id).single();
  if (error || !data) return Response.json({ error: "Interview record could not be loaded." }, { status: 404 });
  const booking = data as unknown as Booking;
  if (booking.interview_status !== "scheduled" || !booking.interview_scheduled_at) return Response.json({ error: "Confirm an interview date and time first." }, { status: 409 });
  const client = booking.client_submissions?.recruitment_clients;
  const candidate = booking.candidate_applications;
  const event: InterviewCalendarEvent = { id, round: booking.current_round, startsAt: booking.interview_scheduled_at, candidate: candidate?.candidate_name || "Candidate", role: booking.client_submissions?.jobs?.title || "Role", location: booking.interview_location, meetingLink: meetingUrl(booking.interview_meeting_link) };
  const calendar = interviewCalendar(event);
  const recipients = [{ kind: "client", email: client?.contact_email, name: client?.contact_name || client?.company_name || "there" }, { kind: "candidate", email: candidate?.email, name: event.candidate }];
  const warnings: string[] = [], sent: string[] = [];
  for (const recipient of recipients) {
    if (!recipient.email) { warnings.push(`No ${recipient.kind} email is recorded.`); continue; }
    const dates = ["Europe/London", "Africa/Johannesburg"].map(timeZone => new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(event.startsAt)));
    const reviewLink = recipient.kind === "client" && booking.client_submissions?.review_token ? `https://recruitment.isitha.global/client-review/${encodeURIComponent(booking.client_submissions.review_token)}` : "";
    // Candidate copies contain no private review link, internal notes or other candidate data.
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172536"><h1 style="color:#0b2239">Interview confirmed</h1><p>Dear ${escape(recipient.name)},</p><p>The Round ${event.round} interview for <strong>${escape(event.candidate)}</strong> for <strong>${escape(event.role)}</strong> has been scheduled.</p><p><strong>UK (London):</strong> ${escape(dates[0])}<br><strong>South Africa:</strong> ${escape(dates[1])}</p>${event.location ? `<p><strong>Location / platform:</strong> ${escape(event.location)}</p>` : ""}${event.meetingLink ? `<p><a href="${escape(event.meetingLink)}">Join interview</a></p>` : ""}<h2>Add to Outlook calendar</h2><p>Open the attached <strong>interview.ics</strong> file in Outlook and save it to your calendar. It includes a <strong>30-minute reminder</strong> and reserves 60 minutes. You can adjust the duration and reminder in Outlook.</p>${reviewLink ? `<p><a href="${escape(reviewLink)}">Open candidate review</a></p>` : ""}<p>Kind regards,<br>Isitha Global Recruitment</p></div>`;
    const fingerprint = createHash("sha256").update(JSON.stringify({ email: recipient.email, event })).digest("hex");
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `interview-${recipient.kind}-${fingerprint}` }, body: JSON.stringify({ from: "Isitha Global Recruitment <recruitment@isitha.global>", to: [recipient.email], subject: `Interview confirmed: ${event.candidate} – ${event.role}`, html, attachments: [{ filename: "interview.ics", content: Buffer.from(calendar, "utf8").toString("base64") }] }) });
      if (!response.ok) warnings.push(`The ${recipient.kind} confirmation email could not be sent.`); else sent.push(recipient.kind);
    } catch { warnings.push(`The ${recipient.kind} confirmation email could not be sent.`); }
  }
  return Response.json({ ok: true, sent, warnings });
}
