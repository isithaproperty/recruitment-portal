import { NextResponse } from "next/server";

type FeedbackEmailRequest = {
  reviewToken?: string;
  submissionCandidateId?: string;
  outcome?: string;
};

const FROM = "Isitha Global Recruitment <recruitment@isitha.global>";
const FALLBACK_TO = process.env.RECRUITMENT_NOTIFICATION_EMAIL || "recruitment@isitha.global";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}

export async function POST(request: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!resendKey || !supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    }

    const body = (await request.json()) as FeedbackEmailRequest;
    if (!body.reviewToken || !body.submissionCandidateId) {
      return NextResponse.json({ error: "Interview feedback could not be verified." }, { status: 400 });
    }

    const reviewResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_client_review`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: body.reviewToken }),
      cache: "no-store",
    });

    if (!reviewResponse.ok) {
      return NextResponse.json({ error: "Interview feedback could not be verified." }, { status: 403 });
    }

    const review = await reviewResponse.json() as {
      id?: string;
      jobs?: { title?: string };
      recruitment_clients?: { company_name?: string };
      client_submission_candidates?: Array<{ id?: string; candidate_applications?: { candidate_name?: string } }>;
    } | null;

    const candidate = review?.client_submission_candidates?.find(item => item.id === body.submissionCandidateId);
    if (!review?.id || !candidate) {
      return NextResponse.json({ error: "Interview feedback could not be verified." }, { status: 403 });
    }

    let recipient = FALLBACK_TO;
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

    const candidateName = escapeHtml(candidate.candidate_applications?.candidate_name || "Candidate");
    const companyName = escapeHtml(review.recruitment_clients?.company_name || "Client");
    const jobTitle = escapeHtml(review.jobs?.title || "Recruitment vacancy");
    const outcome = escapeHtml((body.outcome || "submitted").replaceAll("_", " "));
    const isOffer = body.outcome === "offer";

    const subject = isOffer
      ? `Offer requested: ${candidate.candidate_applications?.candidate_name || "candidate"}`
      : `Interview feedback received: ${candidate.candidate_applications?.candidate_name || "candidate"}`;

    const html = `
      <div style="margin:0;padding:32px 16px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172536;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dfe5eb;border-radius:14px;overflow:hidden;">
          <div style="padding:28px 32px;border-bottom:3px solid #c89a4b;">
            <div style="font-size:24px;font-weight:800;color:#0b2239;">ISITHA GLOBAL</div>
            <div style="margin-top:5px;font-size:13px;color:#667085;">Recruitment</div>
          </div>
          <div style="padding:36px 32px;">
            <h1 style="margin:0 0 18px;font-size:28px;color:#0b2239;">${isOffer ? "Client would like to make an offer" : "Interview feedback received"}</h1>
            <p style="font-size:16px;line-height:1.7;color:#475467;">${companyName} has submitted interview feedback.</p>
            <div style="margin:22px 0;padding:18px 20px;background:#fff9ec;border:1px solid #ead9ad;border-radius:10px;font-size:15px;line-height:1.8;color:#475467;">
              <strong style="color:#0b2239;">Candidate:</strong> ${candidateName}<br>
              <strong style="color:#0b2239;">Role:</strong> ${jobTitle}<br>
              <strong style="color:#0b2239;">Outcome:</strong> ${outcome}
            </div>
            <p style="font-size:16px;line-height:1.7;color:#475467;">${isOffer ? "Please log in to the Recruitment Portal to progress the offer." : "Please log in to the Recruitment Portal to review the feedback and next action."}</p>
            <div style="margin:28px 0;"><a href="https://recruitment.isitha.global" style="display:inline-block;background:#0b2239;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:8px;">Open Recruitment Portal</a></div>
          </div>
        </div>
      </div>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [recipient], subject, html }),
    });

    const result = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      return NextResponse.json({ error: "HR email notification could not be sent.", details: result }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: (result as { id?: string }).id || null });
  } catch {
    return NextResponse.json({ error: "HR email notification could not be sent." }, { status: 500 });
  }
}
