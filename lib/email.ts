import type { SupabaseClient } from "@supabase/supabase-js";

export type RecruitmentEmailPayload = {
  kind: "client_submission" | "application_received" | "client_decision" | "interview_feedback" | "job_creator_interview" | "interview_scheduled";
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

export async function sendRecruitmentEmail(payload: RecruitmentEmailPayload, supabase?: SupabaseClient) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const endpoint = payload.kind === "interview_feedback"
    ? "/api/send-interview-feedback-email"
    : "/api/send-email";

  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error || "Email could not be sent.");
  return result as { ok: true; id?: string | null };
}
