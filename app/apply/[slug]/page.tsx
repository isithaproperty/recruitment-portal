"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Job={id:string;title:string;client_company:string|null;location:string|null;job_description:string|null;closing_date:string|null;status:string};

export default function ApplyPage(){
  const params=useParams<{slug:string}>();const supabase=createClient();const[job,setJob]=useState<Job|null>(null);const[loading,setLoading]=useState(true);const[message,setMessage]=useState("");const[saving,setSaving]=useState(false);
  useEffect(()=>{void load()},[params.slug]);
  async function load(){const{data}=await supabase.from("jobs").select("id,title,client_company,location,job_description,closing_date,status").eq("public_slug",params.slug).eq("status","open").maybeSingle();setJob(data as Job|null);setLoading(false)}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!job||saving)return;
    const form=e.currentTarget;
    setSaving(true);setMessage("");
    try{
      const fd=new FormData(form);const file=fd.get("cv");
      if(!(file instanceof File)||!file.size){setMessage("Please attach your CV.");return}
      const allowed=["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      if(!allowed.includes(file.type)||file.size>10*1024*1024){setMessage("CV must be PDF, DOC or DOCX and 10 MB or smaller.");return}
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${job.id}/${crypto.randomUUID()}-${safe}`;
      const{error:uploadError}=await supabase.storage.from("candidate-cvs").upload(path,file,{upsert:false});
      if(uploadError){setMessage(`Your CV could not be uploaded. ${uploadError.message||"Please try again."}`);return}
      const{error}=await supabase.from("candidate_applications").insert({job_id:job.id,candidate_name:String(fd.get("name")||"").trim(),email:String(fd.get("email")||"").trim().toLowerCase(),phone:String(fd.get("phone")||"").trim()||null,location:String(fd.get("location")||"").trim()||null,cv_path:path,status:"applied"});
      if(error){await supabase.storage.from("candidate-cvs").remove([path]);setMessage(`Your application could not be submitted. ${error.message||"Please try again."}`);return}
      form.reset();setMessage("Application submitted successfully. Thank you.");
    }catch(error){setMessage(error instanceof Error?error.message:"Your application could not be submitted. Please try again.");}
    finally{setSaving(false)}
  }
  if(loading)return <main className="min-h-screen bg-slate-100 p-8">Loading vacancy...</main>;
  if(!job)return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-2xl rounded-xl bg-white p-8">This vacancy is no longer available.</div></main>;
  const input="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3";
  return <main className="min-h-screen bg-slate-100"><div className="mx-auto max-w-3xl px-6 py-10"><section className="rounded-xl bg-slate-900 p-8 text-white"><p className="text-sm font-semibold uppercase tracking-wide">Isitha Global Recruitment</p><h1 className="mt-3 text-3xl font-bold">{job.title}</h1><p className="mt-2 text-slate-300">{job.client_company} · {job.location}</p></section><section className="mt-6 rounded-xl bg-white p-8 shadow-sm"><h2 className="text-xl font-bold">Apply for this role</h2><p className="mt-2 text-sm text-slate-500">Your CV will be used only for recruitment and matching against this vacancy. Recruiters make the final decision.</p><form onSubmit={submit} className="mt-6 space-y-5"><label className="block text-sm font-semibold">Full name<input required name="name" className={input}/></label><label className="block text-sm font-semibold">Email<input required name="email" type="email" className={input}/></label><label className="block text-sm font-semibold">Phone<input name="phone" className={input}/></label><label className="block text-sm font-semibold">Current location<input name="location" className={input}/></label><label className="block text-sm font-semibold">CV<input required name="cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={input}/><span className="mt-1 block text-xs text-slate-500">PDF, DOC or DOCX — maximum 10 MB.</span></label>{message&&<p role="status" className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold">{message}</p>}<button disabled={saving} className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{saving?"Submitting...":"Submit application"}</button></form></section></div></main>;
}
