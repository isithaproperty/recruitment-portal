"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Details,
  ExistingApplication,
  MAX_BATCH_BYTES,
  MAX_FILES,
  UncertainImportError,
  duplicateWarnings,
  emptyDetails,
  extractDetails,
  loadExisting,
  saveApplication,
  validateCv,
} from "@/lib/bulk-cv-import";

type Job = {
  id: string;
  title: string;
  client_company: string | null;
  status: string;
};
type Row = {
  id: string;
  file: File;
  details: Details;
  status: "queued" | "reading" | "review" | "saving" | "saved" | "uncertain";
  message: string;
  reviewed: boolean;
  allowDuplicate: boolean;
};

export default function BulkCvImport() {
  const client = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<ExistingApplication[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (!session) {
          window.location.href = "/login";
          return;
        }
        const { data, error } = await client
          .from("jobs")
          .select("id,title,client_company,status")
          .eq("status", "open")
          .order("created_at", { ascending: false });
        if (error)
          throw new Error(
            "Jobs could not be loaded. Refresh or sign in again.",
          );
        if (active) {
          const available = (data || []) as Job[];
          setJobs(available);
          const requested = new URLSearchParams(window.location.search).get(
            "job",
          );
          if (available.some((job) => job.id === requested))
            setJobId(requested!);
          setReady(true);
        }
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Could not load jobs.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  function update(id: string, changes: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
  }
  function addFiles(files: File[]) {
    if (lock.current) return;
    if (!jobId) {
      setMessage("Select a job before adding files.");
      return;
    }
    if (
      rows.length + files.length > MAX_FILES ||
      [...rows.map((row) => row.file), ...files].reduce(
        (total, file) => total + file.size,
        0,
      ) > MAX_BATCH_BYTES
    ) {
      setMessage(
        "Use up to 25 files and 100 MB per batch. Clear completed files to start another batch.",
      );
      return;
    }
    const valid: Row[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const error = validateCv(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        continue;
      }
      if (
        [...rows, ...valid].some(
          (row) =>
            row.file.name === file.name &&
            row.file.size === file.size &&
            row.file.lastModified === file.lastModified,
        )
      ) {
        errors.push(
          `${file.name}: already queued (same name, size and modification time).`,
        );
        continue;
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        details: emptyDetails(),
        status: "queued",
        message: "Waiting to read. Manual entry is also available.",
        reviewed: false,
        allowDuplicate: false,
      });
    }
    setRows((current) => [
      ...current.map((row) => ({
        ...row,
        reviewed: false,
        allowDuplicate: false,
      })),
      ...valid,
    ]);
    setChecked(false);
    setMessage(
      errors.join(" ") ||
        `${valid.length} CV(s) queued. Read the CVs, then review each candidate before importing.`,
    );
  }
  async function readRows(ids: string[]) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      for (const row of rows.filter(
        (row) =>
          ids.includes(row.id) &&
          row.status !== "saved" &&
          row.status !== "uncertain",
      )) {
        update(row.id, {
          status: "reading",
          reviewed: false,
          allowDuplicate: false,
          message: "Reading contact details…",
        });
        try {
          const details = await extractDetails(client, row.file);
          update(row.id, {
            details,
            status: "review",
            message: "Check the extracted details and fill any missing fields.",
          });
        } catch (error) {
          update(row.id, {
            status: "review",
            message: `${error instanceof Error ? error.message : "Reading failed."} Enter details manually or retry reading.`,
          });
        }
      }
      try {
        setExisting(await loadExisting(client, jobId));
        setChecked(true);
      } catch (error) {
        setChecked(false);
        setMessage((error as Error).message);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function checkDuplicates() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      setExisting(await loadExisting(client, jobId));
      setChecked(true);
      setMessage(
        "Duplicate check refreshed. Review any warnings before importing.",
      );
    } catch (error) {
      setChecked(false);
      setMessage((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const warningsFor = (row: Row, known = existing) =>
    duplicateWarnings(
      row.details.email,
      rows
        .filter((other) => other.id !== row.id)
        .map((other) => other.details.email),
      known,
    );
  const validDetails = (row: Row) =>
    Boolean(
      row.details.candidate_name.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.details.email.trim()),
    );
  const eligible = rows.filter(
    (row) =>
      row.status === "review" &&
      row.reviewed &&
      validDetails(row) &&
      (!warningsFor(row).length || row.allowDuplicate),
  );

  async function importReviewed() {
    if (lock.current || !checked || !eligible.length) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    let saved = 0;
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const { data: job, error } = await client
        .from("jobs")
        .select("id,status")
        .eq("id", jobId)
        .single();
      if (error || job?.status !== "open")
        throw new Error(
          "This job is no longer available for imports. Check the job before continuing.",
        );
      // Recheck immediately before saving; never silently bypass newly discovered matches.
      const fresh = await loadExisting(client, jobId);
      setExisting(fresh);
      for (const row of eligible) {
        const newMatch = fresh.some(
          (app) =>
            app.email.trim().toLowerCase() ===
              row.details.email.trim().toLowerCase() &&
            !existing.some((prior) => prior.id === app.id),
        );
        if (newMatch) {
          update(row.id, {
            reviewed: false,
            allowDuplicate: false,
            message:
              "A new matching application was found. Review the warning before importing.",
          });
          continue;
        }
        update(row.id, {
          status: "saving",
          message: "Saving original CV and application…",
        });
        try {
          await saveApplication(client, jobId, row.file, row.details);
          saved++;
          update(row.id, {
            status: "saved",
            message:
              "Imported. Source: LinkedIn Easy Apply. Consent remains unrecorded.",
          });
        } catch (error) {
          update(row.id, {
            status:
              error instanceof UncertainImportError ? "uncertain" : "review",
            reviewed: false,
            allowDuplicate: false,
            message:
              error instanceof Error
                ? error.message
                : "Import failed; review and retry.",
          });
          // Stop after a failed write. Successful rows stay completed and are never retried.
          break;
        }
      }
      setChecked(false);
      setMessage(
        `${saved} application(s) imported. Completed files will not be imported again. Refresh duplicate checks before another import.`,
      );
    } catch (error) {
      setChecked(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Import could not be completed.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100";
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
        Source: <strong>LinkedIn Easy Apply</strong>. Use CVs lawfully
        downloaded and supplied to Isitha or an authorised recruitment source.
        Only stated contact details are extracted. Check them before creating
        applications. Importing does not record consent, send emails, score or
        reject applicants. Files and unsaved edits stay in this tab until you
        import; leaving or refreshing loses the queue.
      </div>
      <label className="block font-bold">
        Job for this batch
        <select
          className={input}
          aria-label="Job for this batch"
          value={jobId}
          disabled={!ready || busy || rows.length > 0}
          onChange={(event) => {
            setJobId(event.target.value);
            setChecked(false);
            setExisting([]);
          }}
        >
          <option value="">Select an open job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
              {job.client_company ? ` — ${job.client_company}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div
        className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (ready) addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <p className="font-bold">Drop downloaded CVs here</p>
        <p className="mt-2 text-sm text-slate-600">
          PDF, DOC or DOCX · 10 MB per file · up to 25 files / 100 MB per batch
        </p>
        <input
          ref={picker}
          multiple
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="Choose downloaded CVs"
          className="sr-only"
          disabled={!ready || busy || !jobId}
          onChange={(event) => {
            addFiles(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="mt-4 rounded-lg border px-4 py-2 font-bold disabled:opacity-50"
          disabled={!ready || busy || !jobId}
          onClick={() => picker.current?.click()}
        >
          Choose CVs
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 disabled:opacity-50"
          disabled={busy || !rows.some((row) => row.status === "queued")}
          onClick={() =>
            void readRows(
              rows
                .filter((row) => row.status === "queued")
                .map((row) => row.id),
            )
          }
        >
          Read queued CVs
        </button>
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 disabled:opacity-50"
          disabled={busy || !jobId || !rows.length}
          onClick={() => void checkDuplicates()}
        >
          Refresh duplicate checks
        </button>
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 disabled:opacity-50"
          disabled={busy || !rows.length}
          onClick={() => {
            setRows([]);
            setChecked(false);
            setMessage(
              "Queue cleared. Saved applications remain in the job's pipeline.",
            );
          }}
        >
          Clear queue
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="whitespace-pre-wrap text-sm"
      >
        {message}
      </p>
      {rows.length > 0 && (
        <p className="text-sm font-semibold">
          {rows.filter((row) => row.status === "saved").length} of {rows.length}{" "}
          imported · {eligible.length} reviewed and ready
          {!checked && " · duplicate check required"}
        </p>
      )}
      {rows.map((row) => {
        const warnings = warningsFor(row);
        const frozen =
          busy || row.status === "saved" || row.status === "uncertain";
        return (
          <section
            key={row.id}
            aria-label={row.file.name}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="break-all font-bold">{row.file.name}</h2>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase">
                {row.status}
              </span>
            </div>
            <p role="status" className="my-3 break-words text-sm">
              {row.message}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["candidate_name", "Candidate name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["location", "Current location"],
                ] as const
              ).map(([key, label]) => (
                <label className="text-sm font-semibold" key={key}>
                  {label}
                  <input
                    type={key === "email" ? "email" : "text"}
                    value={row.details[key]}
                    disabled={frozen}
                    className={input}
                    onChange={(event) => {
                      update(row.id, {
                        details: { ...row.details, [key]: event.target.value },
                        status: "review",
                        reviewed: false,
                        allowDuplicate: false,
                      });
                      if (key === "email")
                        setRows((current) =>
                          current.map((other) => ({
                            ...other,
                            reviewed: false,
                            allowDuplicate: false,
                          })),
                        );
                    }}
                  />
                </label>
              ))}
            </div>
            {warnings.length > 0 && row.status !== "saved" && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-bold">Possible duplicate</p>
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                <label className="mt-2 flex gap-2">
                  <input
                    type="checkbox"
                    disabled={frozen}
                    checked={row.allowDuplicate}
                    onChange={(event) =>
                      update(row.id, {
                        allowDuplicate: event.target.checked,
                        reviewed: false,
                      })
                    }
                  />
                  Create a separate application despite this warning. Existing
                  records will be retained.
                </label>
              </div>
            )}
            {row.status !== "saved" && row.status !== "uncertain" && (
              <>
                <label className="mt-4 flex gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={row.reviewed}
                    disabled={
                      frozen ||
                      !validDetails(row) ||
                      row.status !== "review" ||
                      (warnings.length > 0 && !row.allowDuplicate)
                    }
                    onChange={(event) =>
                      update(row.id, { reviewed: event.target.checked })
                    }
                  />
                  I have checked these details and the LinkedIn Easy Apply
                  source.
                </label>
                <div className="mt-4 flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm font-bold underline disabled:opacity-50"
                    onClick={() => void readRows([row.id])}
                  >
                    Retry reading
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm underline disabled:opacity-50"
                    onClick={() =>
                      setRows((current) =>
                        current.filter((other) => other.id !== row.id),
                      )
                    }
                  >
                    Remove from queue
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
      <button
        type="button"
        className="rounded-lg bg-[#0b2239] px-6 py-3 font-bold text-white disabled:opacity-50"
        disabled={busy || !checked || !eligible.length}
        onClick={() => void importReviewed()}
      >
        {busy
          ? "Processing…"
          : `Import ${eligible.length} reviewed application(s)`}
      </button>
    </div>
  );
}
