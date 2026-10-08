"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor, sanitizeRichTextForSave } from "@/app/components/RichTextEditor";

type Job = { id: string; title: string; job_description: string | null };

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [job, setJob] = useState<Job | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/login"; return; }
        const { data, error } = await supabase.from("jobs")
          .select("id,title,job_description").eq("id", id).single();
        if (!active) return;
        if (error || !data) throw new Error("This job could not be loaded. Please return to the dashboard and try again.");
        setJob(data);
        const original = data.job_description || "";
        // Legacy descriptions may contain plain text rather than HTML.
        const text = document.createElement("div");
        text.textContent = original;
        setDescription(sanitizeRichTextForSave(/<\/?[a-z][^>]*>/i.test(original) ? original : text.innerHTML.replace(/\r?\n/g, "<br>")));
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "The job could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [id, supabase]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job || saving) return;
    const clean = sanitizeRichTextForSave(description).trim();
    const text = new DOMParser().parseFromString(clean, "text/html").body.textContent || "";
    if (!text.trim()) { setMessage("Enter the job description before saving."); return; }
    setSaving(true);
    setMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session has expired. Please sign in again before saving.");
      const { data, error } = await supabase.from("jobs")
        .update({ job_description: clean }).eq("id", job.id)
        .select("id,job_description").single();
      if (error || !data || data.job_description !== clean) throw new Error("The description could not be saved. Please try again or check your job editing permissions.");
      setJob({ ...job, job_description: data.job_description });
      setMessage("Job description saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The description could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen bg-slate-100 text-slate-900">
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href={`/jobs/${id}`} className="font-semibold">← Back to job</Link>
      <h1 className="mt-5 text-2xl font-bold">Edit job description</h1>
      {loading ? <p className="mt-6">Loading job...</p> : job && <form onSubmit={save} className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-bold">{job.title}</h2>
        <p className="text-sm text-slate-600">Update the description shown to applicants. Use bold, headings, bullets or numbered lists.</p>
        <fieldset disabled={saving}>
          <legend className="text-sm font-semibold">Job description</legend>
          <RichTextEditor value={description} onChange={value => { setDescription(value); setMessage(""); }} />
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-6">
          <Link href={`/jobs/${id}`} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold">Back to job</Link>
          <button disabled={saving} className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>}
      {message && <p role="status" className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold">{message}</p>}
    </div>
  </main>;
}
