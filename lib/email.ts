import type { SupabaseClient } from "@supabase/supabase-js";

export type RecruitmentEmailPayload = {
  kind: "client_submission" | "application_received" | "client_decision" | "interview_feedback";
  to?: string;
  clientName?: string;
  companyName?: string;
  candidateName?: string;
  jobTitle?: string;
  reviewUrl?: string;
  decision?: string;
  outcome?: string;
};

export async function sendRecruitmentEmail(payload: RecruitmentEmailPayload, supabase?: SupabaseClient) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch("/api/send-email", { method: "POST", headers, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error || "Email could not be sent.");
  return result as { ok: true; id?: string | null };
}
