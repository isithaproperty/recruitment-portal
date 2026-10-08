// Only approved recruiter_summary is client-facing. ai_comments stays private.
export const CV_CONTENT_FIELDS = [
  "professional_profile", "skills", "qualifications", "experience",
  "projects", "additional_information", "ai_comments",
] as const;

export function parseCvContent(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("The reformatted CV was incomplete.");
  const source = value as Record<string, unknown>;
  const result = {} as Record<(typeof CV_CONTENT_FIELDS)[number], string>;
  for (const field of CV_CONTENT_FIELDS) {
    if (typeof source[field] !== "string") throw new Error("The reformatted CV was incomplete.");
    result[field] = source[field];
  }
  return result;
}

export function appendApprovedComments(existing: string | null, suggestion: string) {
  const approved = existing?.trim() || "";
  const comment = suggestion.trim();
  if (!comment || approved.includes(comment)) return approved;
  return approved ? `${approved}\n\n${comment}` : comment;
}
