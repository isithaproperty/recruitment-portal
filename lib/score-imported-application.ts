import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedApplication } from "@/lib/bulk-cv-import";

export type ScoringJob = { title: string; job_description: string | null };

// Use the existing role-scoring endpoint and rubric. Successful saved scores,
// including zero, are reused when an interrupted batch is resumed.
export async function scoreImportedApplication(
  client: SupabaseClient,
  application: ImportedApplication,
  job: ScoringJob,
): Promise<number> {
  const { data: current, error: lookupError } = await client
    .from("candidate_applications")
    .select("id,match_score")
    .eq("id", application.id)
    .single();
  if (lookupError || !current)
    throw new Error("Could not check the saved score. Retry scoring only.");
  if (current.match_score != null) {
    const savedScore = Number(current.match_score);
    if (Number.isFinite(savedScore) && savedScore >= 0 && savedScore <= 100)
      return savedScore;
    throw new Error(
      "The saved score could not be read. Check the candidate in the job pipeline.",
    );
  }
  if (!job.title || !job.job_description?.replace(/<[^>]*>/g, "").trim())
    throw new Error(
      "The selected role needs a job description before scoring. The candidate is imported; add the role's actual scope and retry scoring.",
    );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("Please sign in again.");
  const { data: signed, error } = await client.storage
    .from("candidate-cvs")
    .createSignedUrl(application.cv_path, 300);
  if (error || !signed?.signedUrl)
    throw new Error("The original CV could not be opened for scoring.");
  const response = await fetch("/api/score-application", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      applicationId: application.id,
      job,
      cvUrl: signed.signedUrl,
      fileName: application.cv_path.split("/").pop() || "candidate-cv",
    }),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Scoring failed. Retry scoring only.");
  if (
    typeof result.match_score !== "number" ||
    !Number.isFinite(result.match_score) ||
    result.match_score < 0 ||
    result.match_score > 100
  )
    throw new Error(
      "The scoring response was incomplete. Retry scoring to check its saved result.",
    );
  return result.match_score;
}
