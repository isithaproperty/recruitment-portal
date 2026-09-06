import { NextResponse } from "next/server";

type EmailKind = "client_submission" | "application_received" | "client_decision" | "interview_feedback";
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
};

const FROM = "Isitha Global Recruitment <recruitment@isithaproperty.co.za>";
const INTERNAL_TO = process.env.RECRUITMENT_NOTIFICATION_EMAIL || "recruitment@isithaproperty.co.za";

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

export async function POST(request: Request) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    const body = (await request.json()) as EmailRequest;
    if (!body.kind) return NextResponse.json({ error: "Email type is missing." }, { status: 400 });

    const staffOnly = body.kind === "client_submission";
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
      subject = `Candidate CVs for ${body.jobTitle || "your vacancy"}`;
      const name = escapeHtml(body.clientName || "there");
      const url = escapeHtml(body.reviewUrl);
      html = `<p>Dear ${name},</p><p>Isitha Global has prepared candidate CVs for <strong>${job}</strong>.</p><p><a href="${url}">Open your private candidate review page</a></p><p>You can review each CV, choose who you would like to interview and leave comments. The same link remains available for interview feedback and additional rounds.</p><p>Kind regards,<br><strong>Isitha Global Recruitment</strong></p>`;
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
