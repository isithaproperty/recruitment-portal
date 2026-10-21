"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Job = {
  id: string;
  title: string;
  client_company: string | null;
  status: string;
};
type Extracted = {
  candidate_name: string;
  email: string;
  phone: string;
  location: string;
};

export default function CandidateCvUpload({
  jobId: fixedJobId,
  onAdded,
}: {
  jobId?: string;
  onAdded?: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  useEffect(() => {
    if (fixedJobId) return;
    let active = true;
    void supabase
      .from("jobs")
      .select("id,title,client_company,status")
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setMessage(
            "Jobs could not be loaded. Please refresh or sign in again.",
          );
        else setJobs((data || []) as Job[]);
      });
    return () => {
      active = false;
    };
  }, [fixedJobId, supabase]);
  async function readCv(file: File) {
    if (busyRef.current) return;
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("CV must be PDF, DOC or DOCX and 10 MB or smaller.");
      return;
    }
    busyRef.current = true;
    setFile(file);
    setName("");
    setEmail("");
    setPhone("");
    setLocation("");
    setExtracting(true);
    setMessage("Reading CV and filling candidate details...");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }
      const fd = new FormData();
      fd.append("cv", file);
      const response = await fetch("/api/extract-candidate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const result = (await response.json()) as Extracted & { error?: string };
      if (!response.ok)
        throw new Error(result.error || "The CV could not be read.");
      if (result.candidate_name) setName(result.candidate_name);
      if (result.email) setEmail(result.email);
      if (result.phone) setPhone(result.phone);
      if (result.location) setLocation(result.location);
      const missing = [];
      if (!result.candidate_name) missing.push("name");
      if (!result.email) missing.push("email");
      if (!result.phone) missing.push("phone");
      if (!result.location) missing.push("location");
      setMessage(
        missing.length
          ? `CV read. Please check the details — ${missing.join(", ")} ${missing.length === 1 ? "was" : "were"} not found and can be entered manually.`
          : "CV read successfully. Candidate details have been filled in — please check them before adding.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} You can still enter the details manually.`
          : "The CV could not be read. Please enter the details manually.",
      );
    } finally {
      setExtracting(false);
      busyRef.current = false;
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyRef.current) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const jobId = fixedJobId || String(fd.get("job_id") || "");
    if (!jobId) {
      setMessage("Choose the job this CV relates to.");
      return;
    }
    if (!(file instanceof File) || !file.size) {
      setMessage("Attach the emailed CV.");
      return;
    }
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("CV must be PDF, DOC or DOCX and 10 MB or smaller.");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${jobId}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await supabase.storage
        .from("candidate-cvs")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase
        .from("candidate_applications")
        .insert({
          job_id: jobId,
          candidate_name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          location: location.trim() || null,
          cv_path: path,
          status: "applied",
          popia_consent: false,
          popia_consent_at: null,
        });
      if (error) {
        await supabase.storage.from("candidate-cvs").remove([path]);
        throw error;
      }
      form.reset();
      setFile(null);
      setName("");
      setEmail("");
      setPhone("");
      setLocation("");
      setMessage(
        "Emailed CV added to the candidate pipeline. Source: received by email.",
      );
      await onAdded?.();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The CV could not be added.",
      );
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
  }
  const input =
    "mt-2 w-full rounded-lg border border-[#cbd5df] bg-white px-4 py-3 text-[#172536] outline-none focus:border-[#c89a4b] focus:ring-4 focus:ring-[#c89a4b]/15";
  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-[#dfe5eb] bg-white p-7 shadow-sm"
    >
      {fixedJobId ? (
        <input type="hidden" name="job_id" value={fixedJobId} />
      ) : (
        <label className="block text-sm font-bold">
          Job
          <select required name="job_id" className={input} defaultValue="">
            <option value="" disabled>
              Select job
            </option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.client_company ? ` — ${j.client_company}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busyRef.current) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busyRef.current) return;
          if (e.dataTransfer.files.length !== 1) {
            setMessage(
              "Drop one CV at a time so you can review each candidate's details.",
            );
            return;
          }
          void readCv(e.dataTransfer.files[0]);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center ${dragging ? "border-amber-600 bg-amber-50" : "border-slate-300 bg-slate-50"}`}
      >
        <p className="font-bold">Drop a candidate CV here</p>
        <p className="mt-1 text-sm text-slate-600">
          PDF, DOC or DOCX — maximum 10 MB. One candidate at a time.
        </p>
        <input
          ref={fileInput}
          type="file"
          aria-label="Choose candidate CV"
          disabled={saving || extracting}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            e.target.value = "";
            if (selected) void readCv(selected);
          }}
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
        />
        <button
          type="button"
          disabled={saving || extracting}
          onClick={() => fileInput.current?.click()}
          className="mt-3 rounded-lg border border-slate-400 bg-white px-4 py-2 font-semibold disabled:opacity-50"
        >
          Choose CV
        </button>
        {file && (
          <p role="status" className="mt-3 break-all text-sm">
            Selected: {file.name}
          </p>
        )}
      </div>
      {extracting && (
        <div className="rounded-xl border border-[#c89a4b]/35 bg-[#f3ead8]/55 p-4 text-sm font-semibold text-[#5b6470]">
          Reading CV details...
        </div>
      )}
      <label className="block text-sm font-bold">
        Candidate name
        <input
          required
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-bold">
          Email
          <input
            required
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm font-bold">
          Phone
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <label className="block text-sm font-bold">
        Current location
        <input
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={input}
        />
      </label>
      <div className="rounded-xl border border-[#c89a4b]/35 bg-[#f3ead8]/55 p-4 text-xs leading-5 text-[#5b6470]">
        The CV reader only extracts details stated in the uploaded CV. It does
        not guess missing information. Please check the populated fields before
        adding the candidate. This route is for CVs already supplied to Isitha
        Global by the candidate or an authorised recruitment source.
      </div>
      {message && (
        <p
          role="status"
          className="rounded-lg bg-[#f4f6f8] px-4 py-3 text-sm font-semibold"
        >
          {message}
        </p>
      )}
      <button
        disabled={saving || extracting}
        className="w-full rounded-lg bg-[#0b2239] px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        {extracting
          ? "Reading CV..."
          : saving
            ? "Uploading..."
            : "Add candidate & CV"}
      </button>
    </form>
  );
}
