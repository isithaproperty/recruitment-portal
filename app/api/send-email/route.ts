import { NextResponse } from "next/server";

type EmailKind = "client_submission" | "application_received" | "client_decision" | "interview_feedback" | "job_creator_interview" | "interview_scheduled";
type EmailRequest = {
  kind?: EmailKind;
  to?: string;
  clientName?: string;
  companyName?: string;
  candidateName?: string;
  jobTitle?: string;
  reviewUrl?: string;
  decision?: string;
  outcome?: string;
  reviewToken?: string;
  submissionCandidateId?: string;
  interviewWhen?: string;
  interviewLocation?: string;
  interviewMeetingLink?: string;
  interviewNotes?: string;
};

const FROM = "Isitha Global Recruitment <recruitment@isitha.global>";
const INTERNAL_TO = process.env.RECRUITMENT_NOTIFICATION_EMAIL || "recruitment@isitha.global";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}

async function authenticated(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  return response.ok;
}

type ReviewContext = {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  recipient: string;
};

async function resolveInterviewRecipient(body: EmailRequest): Promise<ReviewContext | null> {
  if (!body.reviewToken || !body.submissionCandidateId) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;

  const reviewResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_client_review`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: body.reviewToken }),
    cache: "no-store",
  });
  if (!reviewResponse.ok) return null;
  const review = await reviewResponse.json() as {
    id?: string;
    jobs?: { title?: string };
    recruitment_clients?: { company_name?: string };
    client_submission_candidates?: Array<{ id?: string; candidate_applications?: { candidate_name?: string } }>;
  } | null;
  const candidate = review?.client_submission_candidates?.find(item => item.id === body.submissionCandidateId);
  if (!review?.id || !candidate) return null;

  let recipient = INTERNAL_TO;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const submissionResponse = await fetch(`${supabaseUrl}/rest/v1/client_submissions?id=eq.${encodeURIComponent(review.id)}&select=job_id`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    const submissions = submissionResponse.ok ? await submissionResponse.json() as Array<{ job_id?: string }> : [];
    const jobId = submissions[0]?.job_id;
    if (jobId) {
      const jobResponse = await fetch(`${supabaseUrl}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=created_by`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        cache: "no-store",
      });
      const jobs = jobResponse.ok ? await jobResponse.json() as Array<{ created_by?: string }> : [];
      const creatorId = jobs[0]?.created_by;
      if (creatorId) {
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(creatorId)}`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          cache: "no-store",
        });
        const creator = userResponse.ok ? await userResponse.json() as { email?: string } : null;
        if (creator?.email) recipient = creator.email;
      }
    }
  }

  return {
    candidateName: candidate.candidate_applications?.candidate_name || "Candidate",
    companyName: review.recruitment_clients?.company_name || "Client",
    jobTitle: review.jobs?.title || "Recruitment vacancy",
    recipient,
  };
}

function brandedClientEmail(name: string, job: string, url: string) {
  return `
  <div style="margin:0;padding:32px 16px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172536;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dfe5eb;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(11,34,57,0.06);">
      <div style="padding:28px 32px;border-bottom:3px solid #c89a4b;">
        <div style="font-size:24px;font-weight:800;letter-spacing:.04em;color:#0b2239;">ISITHA GLOBAL</div>
        <div style="margin-top:5px;font-size:13px;color:#667085;">Recruitment</div>
      </div>
      <div style="padding:36px 32px;">
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#344054;">Dear ${name},</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;color:#0b2239;">Candidate CVs ready for review</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#475467;">We have prepared a selection of candidate CVs for your <strong style="color:#0b2239;">${job}</strong> vacancy.</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#475467;">Your private review page lets you view each candidate, select who you would like to interview and leave feedback for the Isitha Global recruitment team.</p>
        <div style="margin:28px 0;"><a href="${url}" style="display:inline-block;background:#0b2239;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">Review candidate CVs</a></div>
        <div style="margin:26px 0;padding:18px 20px;background:#fff9ec;border:1px solid #ead9ad;border-radius:10px;color:#475467;font-size:14px;line-height:1.6;"><strong style="color:#0b2239;">Your private link remains active</strong><br>You can return to the same page for interview selections, comments, interview feedback and any additional interview rounds.</div>
        <p style="margin:26px 0 0;font-size:16px;line-height:1.7;color:#475467;">Kind regards,<br><strong style="color:#0b2239;">Isitha Global Recruitment</strong></p>
      </div>
      <div style="padding:20px 32px;background:#f8f9fa;border-top:1px solid #dfe5eb;font-size:12px;line-height:1.6;color:#667085;"><strong style="color:#0b2239;">Isitha Global</strong><br>Global Professionals. Real Results.<br>recruitment.isitha.global</div>
    </div>
  </div>`;
}

function brandedInterviewScheduledEmail(name: string, candidate: string, job: string, when: string, location: string, meetingLink: string, notes: string, reviewUrl: string) {
  const locationBlock = location ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#475467;"><strong style="color:#0b2239;">Location / platform:</strong> ${location}</p>` : "";
  const meetingBlock = meetingLink ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#475467;"><strong style="color:#0b2239;">Meeting link:</strong> <a href="${meetingLink}" style="color:#0b2239;font-weight:700;">Join interview</a></p>` : "";
  const notesBlock = notes ? `<div style="margin:22px 0;padding:16px 18px;background:#fff9ec;border:1px solid #ead9ad;border-radius:10px;color:#475467;font-size:14px;line-height:1.6;"><strong style="color:#0b2239;">Interview notes</strong><br>${notes}</div>` : "";
  const reviewBlock = reviewUrl ? `<div style="margin:28px 0;"><a href="${reviewUrl}" style="display:inline-block;background:#0b2239;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">Open candidate review</a></div>` : "";
  return `
  <div style="margin:0;padding:32px 16px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172536;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dfe5eb;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(11,34,57,0.06);">
      <div style="padding:28px 32px;border-bottom:3px solid #c89a4b;"><div style="font-size:24px;font-weight:800;letter-spacing:.04em;color:#0b2239;">ISITHA GLOBAL</div><div style="margin-top:5px;font-size:13px;color:#667085;">Recruitment</div></div>
      <div style="padding:36px 32px;">
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#344054;">Dear ${name},</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;color:#0b2239;">Your interview has been scheduled</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#475467;">The interview for <strong style="color:#0b2239;">${candidate}</strong> for the <strong style="color:#0b2239;">${job}</strong> vacancy has now been arranged.</p>
        <div style="padding:18px 20px;background:#f8f9fa;border:1px solid #dfe5eb;border-radius:10px;"><p style="margin:0;font-size:15px;line-height:1.6;color:#475467;"><strong style="color:#0b2239;">Date & time:</strong> ${when}</p>${locationBlock}${meetingBlock}</div>
        ${notesBlock}${reviewBlock}
        <p style="margin:26px 0 0;font-size:16px;line-height:1.7;color:#475467;">Kind regards,<br><strong style="color:#0b2239;">Isitha Global Recruitment</strong></p>
      </div>
      <div style="padding:20px 32px;background:#f8f9fa;border-top:1px solid #dfe5eb;font-size:12px;line-height:1.6;color:#667085;"><strong style="color:#0b2239;">Isitha Global</strong><br>Global Professionals. Real Results.<br>recruitment.isitha.global</div>
    </div>
  </div>`;
}

export async function POST(request: Request) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    const body = (await request.json()) as EmailRequest;
    if (!body.kind) return NextResponse.json({ error: "Email type is missing." }, { status: 400 });

    const interviewContext = body.kind === "job_creator_interview" ? await resolveInterviewRecipient(body) : null;
    if (body.kind === "job_creator_interview" && !interviewContext) return NextResponse.json({ error: "The interview request could not be verified." }, { status: 403 });

    const staffOnly = body.kind === "client_submission" || body.kind === "interview_scheduled";
    if (staffOnly && !(await authenticated(request))) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const job = escapeHtml(body.jobTitle || "Recruitment vacancy");
    const candidate = escapeHtml(body.candidateName || "Candidate");
    const company = escapeHtml(body.companyName || "Client");
    let to = INTERNAL_TO;
    let subject = "Recruitment portal notification";
    let html = "<p>A recruitment portal update has been received.</p>";

    if (body.kind === "client_submission") {
      if (!body.to || !body.reviewUrl) return NextResponse.json({ error: "Client email or review link is missing." }, { status: 400 });
      to = body.to;
      subject = `Candidate CVs ready for review – ${body.jobTitle || "your vacancy"}`;
      html = brandedClientEmail(escapeHtml(body.clientName || "there"), job, escapeHtml(body.reviewUrl));
    } else if (body.kind === "application_received") {
      subject = `New application: ${body.jobTitle || "vacancy"}`;
      html = `<p>A new candidate application has been received.</p><p><strong>Candidate:</strong> ${candidate}<br><strong>Role:</strong> ${job}</p><p>Log in to the Isitha Global recruitment portal to review the application and CV.</p>`;
    } else if (body.kind === "client_decision") {
      const decision = escapeHtml((body.decision || "updated").replaceAll("_", " "));
      subject = `Client CV decision: ${body.candidateName || "candidate"}`;
      html = `<p>${company} has updated a candidate CV decision.</p><p><strong>Candidate:</strong> ${candidate}<br><strong>Role:</strong> ${job}<br><strong>Decision:</strong> ${decision}</p><p>Open the recruitment portal to review and action the decision.</p>`;
    } else if (body.kind === "interview_feedback") {
      const outcome = escapeHtml((body.outcome || "submitted").replaceAll("_", " "));
      subject = `Interview feedback: ${body.candidateName || "candidate"}`;
      html = `<p>${company} has submitted interview feedback.</p><p><strong>Candidate:</strong> ${candidate}<br><strong>Role:</strong> ${job}<br><strong>Outcome:</strong> ${outcome}</p><p>Open the recruitment portal to review the feedback and next action.</p>`;
    } else if (body.kind === "job_creator_interview" && interviewContext) {
      to = interviewContext.recipient;
      subject = `Interview requested: ${interviewContext.candidateName}`;
      html = `<p>${escapeHtml(interviewContext.companyName)} would like to proceed to interview.</p><p><strong>Candidate:</strong> ${escapeHtml(interviewContext.candidateName)}<br><strong>Role:</strong> ${escapeHtml(interviewContext.jobTitle)}</p><p>Log in to the Isitha Global recruitment portal to arrange the interview.</p>`;
    } else if (body.kind === "interview_scheduled") {
      if (!body.to || !body.interviewWhen) return NextResponse.json({ error: "Client email or interview date is missing." }, { status: 400 });
      to = body.to;
      subject = `Interview scheduled: ${body.candidateName || "candidate"} – ${body.jobTitle || "vacancy"}`;
      html = brandedInterviewScheduledEmail(
        escapeHtml(body.clientName || "there"),
        candidate,
        job,
        escapeHtml(body.interviewWhen),
        escapeHtml(body.interviewLocation || ""),
        escapeHtml(body.interviewMeetingLink || ""),
        escapeHtml(body.interviewNotes || ""),
        escapeHtml(body.reviewUrl || "")
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: "Email could not be sent.", details: result }, { status: 502 });
    return NextResponse.json({ ok: true, id: (result as { id?: string }).id || null });
  } catch {
    return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
  }
}
