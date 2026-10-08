"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Job = {
  id: string;
  title: string;
  client_company: string | null;
  location: string | null;
  job_description: string | null;
  mandatory_requirements: string | null;
  preferred_requirements: string | null;
  public_slug: string | null;
  status: string;
};
type Application = {
  id: string;
  candidate_name: string;
  email: string;
  location: string | null;
  status: string;
  match_score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  ai_rationale: string | null;
  ai_scored_at: string | null;
  cv_path: string;
  created_at: string;
};

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [cvFilter, setCvFilter] = useState<"all" | "reformatted" | "not_reformatted">("all");
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [jobAction, setJobAction] = useState<"status" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [params.id]);
  async function load() {
    setLoading(true);
    const [{ data: j, error: jobError }, { data: a, error: appsError }] =
      await Promise.all([
        supabase
          .from("jobs")
          .select(
            "id,title,client_company,location,job_description,mandatory_requirements,preferred_requirements,public_slug,status",
          )
          .eq("id", params.id)
          .single(),
        supabase
          .from("candidate_applications")
          .select(
            "id,candidate_name,email,location,status,match_score,strengths,weaknesses,ai_rationale,ai_scored_at,cv_path,created_at",
          )
          .eq("job_id", params.id)
          .order("match_score", { ascending: false, nullsFirst: false }),
      ]);
    if (jobError || appsError)
      setMessage("The job or candidate list could not be loaded.");
    setJob(j as Job | null);
    setApps((a || []) as Application[]);
    setLoading(false);
  }

  async function reformatSelected(application?: Application) {
    if (!job || bulkWorking || scoring || deleting || jobAction) return;
    const batch = application ? [application] : apps.filter(a => selectedIds.includes(a.id) && a.match_score != null && a.status !== "client_cv_ready");
    if (!batch.length) return;
    setBulkWorking(true);
    setMessage("");
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const [index, application] of batch.entries()) {
        setBulkProgress(`Reformatting ${index + 1} of ${batch.length}: ${application.candidate_name}`);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Please sign in again.");
          // Keep existing reviewed or manually edited drafts intact.
          const { data: existing, error: existingError } = await supabase.from("client_cvs").select("id").eq("application_id", application.id).maybeSingle();
          if (existingError) throw new Error("Could not check existing CV.");
          if (!existing) {
            const { data: signed, error } = await supabase.storage.from("candidate-cvs").createSignedUrl(application.cv_path, 300);
            if (error || !signed?.signedUrl) throw new Error("Original CV could not be opened.");
            const response = await fetch("/api/reformat-cv", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ cvUrl: signed.signedUrl, fileName: application.cv_path.split("/").pop() || "candidate-cv", candidateName: application.candidate_name, jobTitle: job.title }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "CV reformatting failed.");
            const fields = ["professional_profile", "skills", "qualifications", "experience", "projects", "additional_information"] as const;
            if (fields.some(field => typeof result[field] !== "string")) throw new Error("The reformatted CV was incomplete.");
            const content = Object.fromEntries(fields.map(field => [field, result[field]]));
            const { error: saveError } = await supabase.from("client_cvs").insert({
              ...content, application_id: application.id, candidate_name: application.candidate_name,
              recruiter_summary: "", source_cv_path: application.cv_path, status: "draft",
              generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).select("id").single();
            if (saveError) throw new Error("The reformatted CV could not be saved.");
          }
          const { error: statusError } = await supabase.from("candidate_applications").update({ status: "client_cv_ready" }).eq("id", application.id).select("id").single();
          if (statusError) throw new Error("CV saved, but its processing status could not be updated. Retry to finish.");
          completed += 1;
          setSelectedIds(ids => ids.filter(id => id !== application.id));
        } catch (error) {
          failures.push(`${application.candidate_name}: ${error instanceof Error ? error.message : "Reformatting failed."}`);
        }
      }
      await load();
      setMessage(`${completed} of ${batch.length} CVs ready in Client CV Builder. Review before sending.${failures.length ? ` Failed (still selected): ${failures.join("; ")}` : ""}`);
    } finally {
      setBulkWorking(false);
      setBulkProgress("");
    }
  }

  async function scoreCandidate(application: Application) {
    if (!job || scoring || bulkWorking) return;
    setScoring(application.id);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }
      const { data: signed, error: signedError } = await supabase.storage
        .from("candidate-cvs")
        .createSignedUrl(application.cv_path, 300);
      if (signedError || !signed?.signedUrl) throw new Error("CV unavailable");
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
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI scoring failed");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The candidate could not be scored.",
      );
    } finally {
      setScoring(null);
    }
  }

  async function scoreAll() {
    for (const application of apps) {
      if (application.match_score == null) await scoreCandidate(application);
    }
  }

  async function openOriginalCv(application: Application) {
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }
    const { data, error } = await supabase.storage
      .from("candidate-cvs")
      .createSignedUrl(application.cv_path, 300);
    if (error || !data?.signedUrl) {
      setMessage("The original CV could not be opened. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadOriginalCv(application: Application) {
    setMessage("");
    const { data, error } = await supabase.storage
      .from("candidate-cvs")
      .download(application.cv_path);
    if (error || !data) {
      setMessage("The original CV could not be downloaded. Please try again.");
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      application.cv_path.split("/").pop() ||
      `${application.candidate_name}-original-CV`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deleteCandidate(application: Application) {
    const confirmed = window.confirm(
      `Delete ${application.candidate_name}? This permanently removes the original CV, any reformatted CV and the candidate from the portal.`,
    );
    if (!confirmed || deleting || bulkWorking) return;
    setDeleting(application.id);
    setMessage("");
    const { error: storageError } = await supabase.storage
      .from("candidate-cvs")
      .remove([application.cv_path]);
    if (storageError) {
      setMessage(
        "The original CV could not be deleted, so the candidate was not removed.",
      );
      setDeleting(null);
      return;
    }
    const { error: recordError } = await supabase
      .from("candidate_applications")
      .delete()
      .eq("id", application.id);
    if (recordError) {
      setMessage(
        "The CV was deleted, but the candidate record could not be removed. Please try delete again.",
      );
    } else {
      setMessage(
        `${application.candidate_name} and both CV versions were deleted.`,
      );
      await load();
    }
    setDeleting(null);
  }

  async function setJobStatus(status: "open" | "closed") {
    if (!job || jobAction || bulkWorking) return;
    setJobAction("status");
    setMessage("");
    const { error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("id", job.id).select("id").single();
    if (error) {
      setMessage(
        `The job could not be ${status === "closed" ? "closed" : "reopened"}.`,
      );
    } else {
      setJob({ ...job, status });
      setMessage(status === "closed" ? "Job archived. All candidates, scores and CVs are kept with this job and removed from active lists." : "Job reopened. Its candidates and CVs are back in the active lists.");
    }
    setJobAction(null);
  }

  async function deleteJob() {
    if (!job || jobAction || bulkWorking) return;
    const confirmed = window.confirm(
      `Permanently delete ${job.title}? This also removes ${apps.length} candidate${apps.length === 1 ? "" : "s"}, their original CVs and all reformatted CVs. This cannot be undone.`,
    );
    if (!confirmed) return;
    setJobAction("delete");
    setMessage("");
    const paths = apps.map((application) => application.cv_path);
    for (let index = 0; index < paths.length; index += 1000) {
      const { error: storageError } = await supabase.storage
        .from("candidate-cvs")
        .remove(paths.slice(index, index + 1000));
      if (storageError) {
        setMessage(
          "The candidate CV files could not be deleted, so the job was not removed.",
        );
        setJobAction(null);
        return;
      }
    }
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) {
      setMessage(
        "The CV files were deleted, but the job record could not be removed. Please try again.",
      );
      setJobAction(null);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (loading)
    return <main className="min-h-screen bg-slate-100 p-8">Loading...</main>;
  if (!job)
    return (
      <main className="min-h-screen bg-slate-100 p-8">Job not found.</main>
    );
  const applyPath = job.public_slug ? `/apply/${job.public_slug}` : "";
  const applyUrl = applyPath && origin ? `${origin}${applyPath}` : applyPath;
  const reformattedCount = apps.filter((a) => a.status === "client_cv_ready").length;
  const visibleApps = apps.filter((a) =>
    cvFilter === "all" || (cvFilter === "reformatted" ? a.status === "client_cv_ready" : a.status !== "client_cv_ready"),
  );
  const cvTabs = [
    { id: "all", label: "All CVs", count: apps.length },
    { id: "reformatted", label: "Reformatted", count: reformattedCount },
    { id: "not_reformatted", label: "Not reformatted", count: apps.length - reformattedCount },
  ] as const;
  const eligibleApps = visibleApps.filter(a => a.match_score != null && a.status !== "client_cv_ready");
  const selectedCount = apps.filter(a => selectedIds.includes(a.id) && a.match_score != null && a.status !== "client_cv_ready").length;
  const allSelected = eligibleApps.length > 0 && eligibleApps.every(a => selectedIds.includes(a.id));
  const unscored = apps.filter((a) => a.match_score == null).length;
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href={job.status === "closed" ? "/?jobs=archived" : "/"}>{job.status === "closed" ? "← Archived Jobs" : "← Dashboard"}</Link>
          <Link
            href={job.status === "closed" ? `/client-cvs?archive=1&job=${job.id}` : `/client-cvs?job=${job.id}`}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Client CV Builder
          </Link>
        </div>
        <div className="mt-5 rounded-xl bg-white p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${job.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
              >
                {job.status === "closed" ? "Archived" : job.status}
              </span>
              <h1 className="mt-3 text-3xl font-bold">{job.title}</h1>
              <p className="mt-2 text-slate-600">
                {job.client_company} · {job.location}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/jobs/${job.id}/edit`} className="rounded border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-800">Edit job description</Link>
              <button
                disabled={bulkWorking || Boolean(jobAction)}
                onClick={() =>
                  void setJobStatus(job.status === "open" ? "closed" : "open")
                }
                className="rounded border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"
              >
                {jobAction === "status"
                  ? "Updating..."
                  : job.status === "open"
                    ? "Close & archive job"
                    : "Reopen & restore job"}
              </button>
              <button
                disabled={bulkWorking || Boolean(jobAction)}
                onClick={() => void deleteJob()}
                className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {jobAction === "delete" ? "Deleting..." : "Delete job"}
              </button>
            </div>
          </div>
          {job.status === "closed" && <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">This job is archived. All candidates, original CVs, scores and formatted CVs remain attached. Reopen the job to return them to the active dashboard.</p>}
          {job.status === "open" && applyPath && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Candidate application link
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Send this public link to candidates. They do not need a
                recruiter portal login.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-white px-3 py-2 text-sm">
                  {applyUrl}
                </code>
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  onClick={async () => {
                    await navigator.clipboard.writeText(applyUrl);
                    setMessage(
                      "Application link copied. It is ready to send to candidates.",
                    );
                  }}
                >
                  Copy application link
                </button>
                <Link
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
                  href={applyPath}
                  target="_blank"
                >
                  Preview form
                </Link>
              </div>
            </div>
          )}
        </div>
        {message && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {message}
          </div>
        )}
        <section className="mt-6 rounded-xl bg-white p-7 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">AI candidate shortlist</h2>
              <p className="text-sm text-slate-500">
                AI provides job-related decision support only. Your team reviews
                the full candidate details here before moving anyone forward.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">
                {apps.length} applications
              </span>
              {unscored > 0 && (
                <button
                  disabled={bulkWorking || Boolean(scoring)}
                  onClick={() => void scoreAll()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {scoring ? "Scoring..." : `Score all ${unscored} unscored`}
                </button>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter CVs by reformatting status">
            {cvTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={cvFilter === tab.id}
                aria-controls="job-cv-list"
                onClick={() => setCvFilter(tab.id)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${cvFilter === tab.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-amber-600"}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500" aria-live="polite">
            Showing {visibleApps.length} of {apps.length} CVs. Reformatted CVs still need review before sending to clients.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={allSelected} disabled={bulkWorking || !eligibleApps.length} onChange={e => setSelectedIds(ids => e.target.checked ? [...new Set([...ids, ...eligibleApps.map(a => a.id)])] : ids.filter(id => !eligibleApps.some(a => a.id === id)))} />
              Select all scored candidates shown
            </label>
            <span className="text-sm">{selectedCount} selected</span>
            <button disabled={!selectedCount || bulkWorking || Boolean(scoring || deleting || jobAction)} onClick={() => void reformatSelected()} className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{bulkWorking ? "Reformatting..." : "Move selected & AI generate CVs"}</button>
            <button disabled={bulkWorking || !selectedIds.length} onClick={() => setSelectedIds([])} className="text-sm font-semibold disabled:opacity-50">Clear selection</button>
            <p className="w-full text-xs text-slate-600">Tick scored candidates, then move them to Client CV Builder and automatically AI generate their CVs in one step. Existing CV drafts are kept. Keep this page open while the batch runs.</p>
            {bulkProgress && <p role="status" className="w-full text-sm font-semibold">{bulkProgress}</p>}
          </div>
          <div id="job-cv-list" className="mt-5 space-y-4">
            {visibleApps.length === 0 ? (
              <p className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-slate-500">
                {apps.length === 0 ? "No applications yet." : cvFilter === "reformatted" ? "No reformatted CVs for this job yet." : "All CVs for this job have been reformatted."}
              </p>
            ) : (
              visibleApps.map((a) => (
                <article
                  key={a.id}
                  className="rounded-lg border border-slate-200 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3"><input type="checkbox" aria-label={`Select ${a.candidate_name} for CV reformatting`} checked={selectedIds.includes(a.id)} disabled={bulkWorking || a.match_score == null || a.status === "client_cv_ready"} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id))} /><h3 className="font-bold">{a.candidate_name}</h3></div>
                      <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-sm font-semibold ${a.status === "client_cv_ready" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                        {a.status === "client_cv_ready" ? "Reformatted" : "Not reformatted"}
                      </span>
                      <p className="text-sm text-slate-500">
                        {a.email} · {a.location || "Location not supplied"}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong className="text-xl">
                        {a.match_score == null
                          ? "Awaiting score"
                          : `${a.match_score}%`}
                      </strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => void openOriginalCv(a)}
                          className="rounded border border-amber-600 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900"
                        >
                          View original CV
                        </button>
                        <button
                          onClick={() => void downloadOriginalCv(a)}
                          className="rounded border border-slate-400 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                        >
                          Download original
                        </button>
                        <button
                          disabled={bulkWorking || Boolean(scoring)}
                          onClick={() => void scoreCandidate(a)}
                          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {scoring === a.id
                            ? "Scoring..."
                            : a.match_score == null
                              ? "AI score"
                              : "Re-score"}
                        </button>
                        {a.status === "client_cv_ready" ? (
                          <Link
                            href={job.status === "closed" ? `/client-cvs?archive=1&job=${job.id}` : `/client-cvs?job=${job.id}`}
                            className="rounded bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                          >
                            In Client CV Builder
                          </Link>
                        ) : (
                          <button
                            disabled={bulkWorking || Boolean(scoring || deleting || jobAction)}
                            onClick={() => void reformatSelected(a)}
                            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {bulkWorking
                              ? "AI generating..."
                              : "Move & AI generate CV"}
                          </button>
                        )}
                        <button
                          disabled={bulkWorking || Boolean(deleting)}
                          onClick={() => void deleteCandidate(a)}
                          className="rounded border border-red-600 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 disabled:opacity-50"
                        >
                          {deleting === a.id
                            ? "Deleting..."
                            : "Delete candidate & CVs"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {a.strengths && (
                    <p className="mt-3 text-sm">
                      <b>Strengths:</b> {a.strengths}
                    </p>
                  )}
                  {a.weaknesses && (
                    <p className="mt-2 text-sm">
                      <b>Weaknesses:</b> {a.weaknesses}
                    </p>
                  )}
                  {a.ai_rationale && (
                    <p className="mt-2 text-sm text-slate-600">
                      <b>AI comments:</b> {a.ai_rationale}
                    </p>
                  )}
                  {a.ai_scored_at && (
                    <p className="mt-2 text-xs text-slate-400">
                      AI reviewed {new Date(a.ai_scored_at).toLocaleString()}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
