"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewJobPage() {
  const router = useRouter();
  const supabase = useMemo(()=>createClient(),[]);
  const [authorised,setAuthorised]=useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState(0);
  const [jobDescription, setJobDescription] = useState("");
  const [mandatoryRequirements, setMandatoryRequirements] = useState("");
  const [preferredRequirements, setPreferredRequirements] = useState("");
  const [closingDate, setClosingDate] = useState("");

  useEffect(()=>{void checkAccess()},[]);
  async function checkAccess(){const{data:{user},error}=await supabase.auth.getUser();if(error||!user){router.replace("/login");return}setAuthorised(true)}

  async function handleSaveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!authorised)return;
    setSaving(true);
    setMessage("");
    const publicSlug = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const { data, error } = await supabase.from("jobs").insert({
      title: jobTitle.trim(),
      client_company: clientName.trim(),
      location: location.trim(),
      minimum_experience: minExperience ? Number(minExperience) : null,
      job_description: jobDescription.trim(),
      mandatory_requirements: mandatoryRequirements.trim(),
      preferred_requirements: preferredRequirements.trim(),
      closing_date: closingDate || null,
      status: "open",
      public_slug: publicSlug,
    }).select("id").single();

    if (error) {
      setMessage("The job could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    router.push(`/jobs/${data.id}`);
    router.refresh();
  }

  if(!authorised)return <main className="min-h-screen bg-slate-100 p-8 text-slate-900">Checking recruiter access...</main>;
  const input = "w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600";

  return <main className="min-h-screen bg-slate-100">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5"><div><h1 className="text-2xl font-bold text-slate-900">Create a new job</h1><p className="text-sm text-slate-500">Add the job details and matching requirements.</p></div><Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Back to dashboard</Link></div></header>
    <div className="mx-auto max-w-5xl px-6 py-8"><form onSubmit={handleSaveJob} className="space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="grid gap-6 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Job title<input required value={jobTitle} onChange={e=>setJobTitle(e.target.value)} className={`${input} mt-2`} placeholder="Senior Quantity Surveyor"/></label>
        <label className="text-sm font-semibold text-slate-700">Client or company<input required value={clientName} onChange={e=>setClientName(e.target.value)} className={`${input} mt-2`} placeholder="Client name"/></label>
        <label className="text-sm font-semibold text-slate-700">Location<input required value={location} onChange={e=>setLocation(e.target.value)} className={`${input} mt-2`} placeholder="London, Hybrid or Remote"/></label>
        <label className="text-sm font-semibold text-slate-700">Minimum experience<input type="number" min="0" value={minExperience} onChange={e=>setMinExperience(Number(e.target.value))} className={`${input} mt-2`}/></label>
      </div>
      <label className="block text-sm font-semibold text-slate-700">Job description<textarea required rows={10} value={jobDescription} onChange={e=>setJobDescription(e.target.value)} className={`${input} mt-2`} placeholder="Paste the full job description here..."/></label>
      <label className="block text-sm font-semibold text-slate-700">Mandatory requirements<textarea rows={5} value={mandatoryRequirements} onChange={e=>setMandatoryRequirements(e.target.value)} className={`${input} mt-2`} placeholder="UK experience, JCT knowledge, degree..."/></label>
      <label className="block text-sm font-semibold text-slate-700">Preferred requirements<textarea rows={5} value={preferredRequirements} onChange={e=>setPreferredRequirements(e.target.value)} className={`${input} mt-2`} placeholder="NEC, sector experience, professional membership..."/></label>
      <label className="block text-sm font-semibold text-slate-700">Closing date<input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)} className={`${input} mt-2 md:w-72`}/></label>
      {message&&<p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6"><Link href="/" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700">Cancel</Link><button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?"Saving...":"Save job"}</button></div>
    </form></div>
  </main>;
}
