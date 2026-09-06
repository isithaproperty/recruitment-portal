import type { RecruitmentEmailPayload } from "@/lib/email";

export function clientSubmissionEmail(input: { to: string; clientName?: string | null; jobTitle: string; reviewUrl: string }): RecruitmentEmailPayload {
  return { kind: "client_submission", to: input.to, clientName: input.clientName || undefined, jobTitle: input.jobTitle, reviewUrl: input.reviewUrl };
}

export function applicationReceivedEmail(input: { candidateName: string; jobTitle: string }): RecruitmentEmailPayload {
  return { kind: "application_received", candidateName: input.candidateName, jobTitle: input.jobTitle };
}

export function clientDecisionEmail(input: { companyName?: string | null; candidateName: string; jobTitle: string; decision: string }): RecruitmentEmailPayload {
  return { kind: "client_decision", companyName: input.companyName || undefined, candidateName: input.candidateName, jobTitle: input.jobTitle, decision: input.decision };
}

export function interviewFeedbackEmail(input: { companyName?: string | null; candidateName: string; jobTitle: string; outcome: string }): RecruitmentEmailPayload {
  return { kind: "interview_feedback", companyName: input.companyName || undefined, candidateName: input.candidateName, jobTitle: input.jobTitle, outcome: input.outcome };
}
