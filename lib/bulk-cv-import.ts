import type { SupabaseClient } from "@supabase/supabase-js";
export type ImportedApplication = {
  id: string;
  candidate_name: string;
  cv_path: string;
};

export const MAX_FILES = 25;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const SOURCE_NOTE =
  "Source: LinkedIn Easy Apply — manually imported from a downloaded CV.";
export type Details = {
  candidate_name: string;
  email: string;
  phone: string;
  location: string;
};
export type ExistingApplication = { id: string; email: string };
export const emptyDetails = (): Details => ({
  candidate_name: "",
  email: "",
  phone: "",
  location: "",
});
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function validateCv(file: File): string | null {
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (
    !file.size ||
    file.size > 10 * 1024 * 1024 ||
    !allowed.includes(file.type)
  )
    return "Use a non-empty PDF, DOC or DOCX, maximum 10 MB.";
  return null;
}

export function duplicateWarnings(
  email: string,
  others: string[],
  existing: ExistingApplication[],
): string[] {
  const key = normalizeEmail(email);
  if (!key) return [];
  const warnings: string[] = [];
  if (others.some((value) => normalizeEmail(value) === key))
    warnings.push("This email appears elsewhere in this batch.");
  if (existing.some((row) => normalizeEmail(row.email) === key))
    warnings.push(
      "An application with this email already exists for this job.",
    );
  return warnings;
}

// Page through all rows visible under the recruiter's existing RLS permissions.
// A failed check must never be presented as 'no duplicates'.
export async function loadExisting(
  client: SupabaseClient,
  jobId: string,
): Promise<ExistingApplication[]> {
  const rows: ExistingApplication[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client
      .from("candidate_applications")
      .select("id,email")
      .eq("job_id", jobId)
      .order("id")
      .range(start, start + 499);
    if (error || !data)
      throw new Error(
        "Duplicate checks could not be completed. Retry before importing.",
      );
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function extractDetails(
  client: SupabaseClient,
  file: File,
): Promise<Details> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const body = new FormData();
  body.append("cv", file);
  const response = await fetch("/api/extract-candidate", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body,
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The CV could not be read.");
  return Object.fromEntries(
    Object.keys(emptyDetails()).map((key) => [
      key,
      typeof result[key] === "string" ? result[key] : "",
    ]),
  ) as Details;
}

export class UncertainImportError extends Error {}

export async function saveApplication(
  client: SupabaseClient,
  jobId: string,
  file: File,
  details: Details,
): Promise<ImportedApplication> {
  const id = crypto.randomUUID();
  const path = `${jobId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await client.storage
    .from("candidate-cvs")
    .upload(path, file, { upsert: false });
  if (uploadError)
    throw new Error(
      "CV upload failed. Your details are retained; retry this file.",
    );
  let error;
  try {
    ({ error } = await client.from("candidate_applications").insert({
      id,
      job_id: jobId,
      candidate_name: details.candidate_name.trim(),
      email: normalizeEmail(details.email),
      phone: details.phone.trim() || null,
      location: details.location.trim() || null,
      cv_path: path,
      status: "applied",
      popia_consent: false,
      popia_consent_at: null,
      recruiter_notes: SOURCE_NOTE,
    }));
  } catch {
    // A lost response can follow a committed insert. Keep the original CV and
    // prevent a blind retry; the recruiter must reconcile the candidate list.
    throw new UncertainImportError(
      `Save outcome is uncertain. Check the job's candidate list before importing this CV again. Retained CV: ${path}`,
    );
  }
  if (error) {
    // HTTP/network failures can have an ambiguous commit outcome as well.
    if (!error.code || !/^[0-9A-Z]{5}$/.test(error.code))
      throw new UncertainImportError(
        `Save outcome is uncertain. Check the job's candidate list before importing this CV again. Retained CV: ${path}`,
      );
    const { error: cleanupError } = await client.storage
      .from("candidate-cvs")
      .remove([path]);
    throw new Error(
      cleanupError
        ? `Application was not added. The uploaded CV could not be cleaned up: ${path}. Contact an administrator before retrying.`
        : "Application was not added. Your details are retained; check permissions or constraints and retry.",
    );
  }
  return { id, candidate_name: details.candidate_name.trim(), cv_path: path };
}
