"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ISITHA_LOGO_DATA_URI } from "@/lib/brand";

type InterviewRecord={
  id:string;
  interview_status:string;
  interview_scheduled_at:string|null;
  interview_location:string|null;
  interview_meeting_link:string|null;
  interview_notes:string|null;
  candidate_applications:{candidate_name:string}|null;
  client_submissions:{recruitment_clients:{company_name:string}|null;jobs:{title:string}|null}|null;
};

export default function InterviewPage({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);
  const supabase=useMemo(()=>createClient(),[]);
  const [record,setRecord]=useState<InterviewRecord|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{void load()},[id]);

  async function load(){
    setLoading(true);
    const {data,error}=await supabase.from("client_submission_candidates").select("id,interview_status,interview_scheduled_at,interview_location,interview_meeting_link,interview_notes,candidate_applications(candidate_name),client_submissions(recruitment_clients(company_name),jobs(title))").eq("id",id).single();
    if(error){setMessage(error.message);setRecord(null)} else setRecord(data as unknown as InterviewRecord);
    setLoading(false);
  }

  async function schedule(form:HTMLFormElement){
    const fd=new FormData(form);const when=String(fd.get("when")||"");
    if(!when)return setMessage("Choose the interview date and time.");
    setBusy(true);
    const {error}=await supabase.from("client_submission_candidates").update({
      interview_status:"scheduled",
      interview_scheduled_at:new Date(when).toISOString(),
      interview_location:String(fd.get("location")||"")||null,
      interview_meeting_link:String(fd.get("link")||"")||null,
      interview_notes:String(fd.get("notes")||"")||null
    }).eq("id",id);
    setBusy(false);
    if(error)return setMessage(error.message);
    setMessage("Interview scheduled.");
    await load();
  }

  async function complete(){
    setBusy(true);
    const {error}=await supabase.from("client_submission_candidates").update({interview_status:"completed",interview_completed_at:new Date().toISOString()}).eq("id",id);
    setBusy(false);
    if(error)return setMessage(error.message);
    setMessage("Interview marked completed. Client feedback is now unlocked.");
    await load();
  }

  if(loading)return <main className="min-h-screen bg-[#f4f6f8] p-8">Loading interview request…</main>;
  if(!record)return <main className="min-h-screen bg-[#f4f6f8] p-8"><p>{message||"Interview request not found."}</p><Link href="/" className="mt-4 inline-block font-bold underline">Back to dashboard</Link></main>;

  return <main className="min-h-screen bg-[#f4f6f8] text-[#172536]"><div className="mx-auto max-w-3xl px-5 py-7">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#c89a4b]/45 pb-5"><img src={ISITHA_LOGO_DATA_URI} alt="Isitha Global" className="w-[190px]"/><Link href="/" className="rounded-lg bg-[#0b2239] px-4 py-2 text-sm font-bold text-white">Back to dashboard</Link></header>
    <section className="py-8"><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Interview Request</p><h1 className="mt-2 text-3xl font-extrabold">{record.candidate_applications?.candidate_name||"Candidate"}</h1><p className="mt-2 text-[#667085]">{record.client_submissions?.recruitment_clients?.company_name||"Client"} · {record.client_submissions?.jobs?.title||"Role"}</p></section>
    {message&&<div className="mb-5 rounded-xl border border-[#c89a4b]/40 bg-[#fff9ec] p-4 text-sm font-semibold">{message}</div>}
    <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Interview management</h2><span className="rounded-full bg-[#f3ead8] px-3 py-1 text-xs font-bold uppercase">{record.interview_status.replaceAll('_',' ')}</span></div>
      {record.interview_status==='requested'&&<form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void schedule(e.currentTarget)}}><label className="text-sm font-semibold">Date & time<input name="when" type="datetime-local" required className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold">Location / platform<input name="location" placeholder="Office / Teams / Zoom" className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold sm:col-span-2">Meeting link<input name="link" placeholder="Optional meeting link" className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold sm:col-span-2">Notes<textarea name="notes" placeholder="Optional interview notes" className="mt-1 w-full rounded-lg border px-3 py-2"/></label><button disabled={busy} className="rounded-lg bg-[#0b2239] px-5 py-3 font-bold text-white sm:col-span-2">Schedule interview</button></form>}
      {record.interview_status==='scheduled'&&<div className="mt-5 rounded-xl bg-slate-50 p-5"><p><b>Scheduled:</b> {record.interview_scheduled_at?new Date(record.interview_scheduled_at).toLocaleString():'-'}</p>{record.interview_location&&<p className="mt-1">{record.interview_location}</p>}{record.interview_meeting_link&&<p className="mt-1"><a href={record.interview_meeting_link} target="_blank" className="font-bold underline">Open meeting link</a></p>}{record.interview_notes&&<p className="mt-2 text-sm text-[#667085]">{record.interview_notes}</p>}<button disabled={busy} onClick={complete} className="mt-4 rounded-lg bg-[#c89a4b] px-5 py-3 font-extrabold text-[#0b2239]">Mark interview completed</button></div>}
      {record.interview_status==='completed'&&<div className="mt-5 rounded-xl bg-[#fff9ec] p-5"><p className="font-bold">Interview completed.</p><p className="mt-1 text-sm text-[#667085]">The client feedback form is now unlocked on their private review link.</p></div>}
    </section>
  </div></main>;
}
