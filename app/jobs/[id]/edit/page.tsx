"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor, sanitizeRichTextForSave } from "@/app/components/RichTextEditor";

type Job = { id: string; title: string; client_company: string | null; location: string | null; minimum_experience: number | null; job_description: string | null; mandatory_requirements: string | null; preferred_requirements: string | null; closing_date: string | null };

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [job, setJob] = useState<Job | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState(0);
  const [jobDescription, setJobDescription] = useState("");
  const [mandatoryRequirements, setMandatoryRequirements] = useState("");
  const [preferredRequirements, setPreferredRequirements] = useState("");
  const [closingDate, setClosingDate] = useState("");
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
          .select("id,title,client_company,location,minimum_experience,job_description,mandatory_requirements,preferred_requirements,closing_date").eq("id", id).single();
        if (!active) return;
        if (error || !data) throw new Error("This job could not be loaded. Please return to the dashboard and try again.");
        setJob(data);
        setJobTitle(data.title);
        setClientName(data.client_company || "");
        setLocation(data.location || "");
        setMinExperience(data.minimum_experience ?? 0);
        setClosingDate(data.closing_date?.slice(0, 10) || "");
        function richText(original: string | null) {
          const value = original || "";
          const text = document.createElement("div");
          text.textContent = value;
          return sanitizeRichTextForSave(/<\/?[a-z][^>]*>/i.test(value) ? value : text.innerHTML.replace(/\r?\n/g, "<br>"));
        }
        setJobDescription(richText(data.job_description));
        setMandatoryRequirements(richText(data.mandatory_requirements));
        setPreferredRequirements(richText(data.preferred_requirements));
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
    const clean = sanitizeRichTextForSave(jobDescription).trim();
    const text = new DOMParser().parseFromString(clean, "text/html").body.textContent || "";
    if (!text.trim()) { setMessage("Enter the job description before saving."); return; }
    if (!jobTitle.trim() || !clientName.trim() || !location.trim()) { setMessage("Enter the job title, client or company and location."); return; }
    if (!Number.isFinite(minExperience) || minExperience < 0) { setMessage("Enter a valid minimum experience."); return; }
    setSaving(true);
    setMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session has expired. Please sign in again before saving.");
      const { data, error } = await supabase.from("jobs")
        .update({
          title: jobTitle.trim(), client_company: clientName.trim(), location: location.trim(),
          minimum_experience: minExperience || null, job_description: clean,
          mandatory_requirements: sanitizeRichTextForSave(mandatoryRequirements).trim(),
          preferred_requirements: sanitizeRichTextForSave(preferredRequirements).trim(),
          closing_date: closingDate || null,
        }).eq("id", job.id)
        .select("id,job_description").single();
      if (error || !data || data.job_description !== clean) throw new Error("The job could not be saved. Please try again or check your job editing permissions.");
      setJob({ ...job, job_description: data.job_description });
      setMessage("Job changes saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The job could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600";
  const helper = "mt-1 text-xs font-normal text-slate-500";

  return <main className="min-h-screen bg-slate-100">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5"><div><h1 className="text-2xl font-bold text-slate-900">Edit job</h1><p className="text-sm text-slate-500">Update the job details, skills and matching requirements.</p></div><Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Back to dashboard</Link></div></header>
    <div className="mx-auto max-w-5xl px-6 py-8">{loading ? <p>Loading job...</p> : job && <form onSubmit={save} className="space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <fieldset disabled={saving} className="contents"><div className="grid gap-6 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Job title<input required value={jobTitle} onChange={e=>setJobTitle(e.target.value)} className={`${input} mt-2`} placeholder="Senior Quantity Surveyor"/></label>
        <label className="text-sm font-semibold text-slate-700">Client or company<input required value={clientName} onChange={e=>setClientName(e.target.value)} className={`${input} mt-2`} placeholder="Client name"/></label>
        <label className="text-sm font-semibold text-slate-700">Location<input required value={location} onChange={e=>setLocation(e.target.value)} className={`${input} mt-2`} placeholder="London, Hybrid or Remote"/></label>
        <label className="text-sm font-semibold text-slate-700">Minimum experience<input type="number" min="0" value={minExperience} onChange={e=>setMinExperience(Number(e.target.value))} className={`${input} mt-2`}/></label>
      </div>

      <div className="block text-sm font-semibold text-slate-700">Job description
        <p className={helper}>Use bold, headings, bullets or numbered lists. You can also paste formatted text from Word or email.</p>
        <RichTextEditor value={jobDescription} onChange={setJobDescription}/>
      </div>

      <div className="block text-sm font-semibold text-slate-700">Mandatory requirements
        <p className={helper}>Format essential requirements with bold text, headings, bullets or numbered lists.</p>
        <RichTextEditor value={mandatoryRequirements} onChange={setMandatoryRequirements}/>
      </div>

      <div className="block text-sm font-semibold text-slate-700">Preferred requirements
        <p className={helper}>Use the same formatting for desirable or preferred requirements.</p>
        <RichTextEditor value={preferredRequirements} onChange={setPreferredRequirements}/>
      </div>

      <label className="block text-sm font-semibold text-slate-700">Closing date<input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)} className={`${input} mt-2 md:w-72`}/></label>
      </fieldset>
      {message&&<p role="status" className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6"><Link href={`/jobs/${id}`} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700">Cancel</Link><button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?"Saving...":"Save changes"}</button></div>
    </form>} {!job && message && <p role="status">{message}</p>}</div>
  </main>;
}
