"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Job={id:string;title:string;client_company:string|null;location:string|null;job_description:string|null;mandatory_requirements:string|null;preferred_requirements:string|null;public_slug:string|null;status:string};
type Application={id:string;candidate_name:string;email:string;location:string|null;status:string;match_score:number|null;strengths:string|null;weaknesses:string|null;ai_rationale:string|null;ai_scored_at:string|null;cv_path:string;created_at:string};

export default function JobPage(){
  const params=useParams<{id:string}>();
  const supabase=useMemo(()=>createClient(),[]);
  const[job,setJob]=useState<Job|null>(null);const[apps,setApps]=useState<Application[]>([]);const[loading,setLoading]=useState(true);const[scoring,setScoring]=useState<string|null>(null);const[message,setMessage]=useState("");
  useEffect(()=>{void load()},[params.id]);
  async function load(){
    setLoading(true);
    const[{data:j,error:jobError},{data:a,error:appsError}]=await Promise.all([
      supabase.from("jobs").select("id,title,client_company,location,job_description,mandatory_requirements,preferred_requirements,public_slug,status").eq("id",params.id).single(),
      supabase.from("candidate_applications").select("id,candidate_name,email,location,status,match_score,strengths,weaknesses,ai_rationale,ai_scored_at,cv_path,created_at").eq("job_id",params.id).order("match_score",{ascending:false,nullsFirst:false})
    ]);
    if(jobError||appsError)setMessage("The job or candidate list could not be loaded.");
    setJob(j as Job|null);setApps((a||[]) as Application[]);setLoading(false);
  }

  async function scoreCandidate(application:Application){
    if(!job||scoring)return;
    setScoring(application.id);setMessage("");
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token){window.location.href="/login";return}
      const{data:signed,error:signedError}=await supabase.storage.from("candidate-cvs").createSignedUrl(application.cv_path,300);
      if(signedError||!signed?.signedUrl)throw new Error("CV unavailable");
      const response=await fetch("/api/score-application",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({job,cvUrl:signed.signedUrl,fileName:application.cv_path.split("/").pop()||"candidate-cv"})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"AI scoring failed");
      const now=new Date().toISOString();
      const{error:updateError}=await supabase.from("candidate_applications").update({match_score:result.match_score,strengths:result.strengths,weaknesses:result.weaknesses,ai_rationale:result.rationale||null,ai_model:result.model||null,ai_scored_at:now}).eq("id",application.id);
      if(updateError)throw updateError;
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:"The candidate could not be scored.");}finally{setScoring(null)}
  }

  async function scoreAll(){
    for(const application of apps){
      if(application.match_score==null)await scoreCandidate(application);
    }
  }

  if(loading)return <main className="min-h-screen bg-slate-100 p-8">Loading...</main>;
  if(!job)return <main className="min-h-screen bg-slate-100 p-8">Job not found.</main>;
  const applyPath=job.public_slug?`/apply/${job.public_slug}`:"";
  const unscored=apps.filter(a=>a.match_score==null).length;
  return <main className="min-h-screen bg-slate-100"><div className="mx-auto max-w-6xl px-6 py-8">
    <Link href="/">← Dashboard</Link><div className="mt-5 rounded-xl bg-white p-7 shadow-sm"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase">{job.status}</span><h1 className="mt-3 text-3xl font-bold">{job.title}</h1><p className="mt-2 text-slate-600">{job.client_company} · {job.location}</p>
    {applyPath&&<div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">Public application link</p><div className="mt-2 flex flex-wrap gap-2"><code className="rounded bg-white px-3 py-2 text-sm">{applyPath}</code><button className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={()=>navigator.clipboard.writeText(`${window.location.origin}${applyPath}`)}>Copy link</button><Link className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold" href={applyPath} target="_blank">Open</Link></div></div>}</div>
    {message&&<div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</div>}
    <section className="mt-6 rounded-xl bg-white p-7 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">AI candidate shortlist</h2><p className="text-sm text-slate-500">AI provides job-related decision support only. A recruiter must review every recommendation before shortlisting.</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold">{apps.length} applications</span>{unscored>0&&<button disabled={Boolean(scoring)} onClick={()=>void scoreAll()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{scoring?"Scoring...":`Score ${unscored} unscored`}</button>}</div></div>
    <div className="mt-5 space-y-4">{apps.length===0?<p className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-slate-500">No applications yet.</p>:apps.map(a=><article key={a.id} className="rounded-lg border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{a.candidate_name}</h3><p className="text-sm text-slate-500">{a.location||"Location not supplied"}</p></div><div className="text-right"><strong className="text-xl">{a.match_score==null?"Awaiting score":`${a.match_score}%`}</strong><div className="mt-2"><button disabled={Boolean(scoring)} onClick={()=>void scoreCandidate(a)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{scoring===a.id?"Scoring...":a.match_score==null?"AI score":"Re-score"}</button></div></div></div>{a.strengths&&<p className="mt-3 text-sm"><b>Strengths:</b> {a.strengths}</p>}{a.weaknesses&&<p className="mt-2 text-sm"><b>Weaknesses:</b> {a.weaknesses}</p>}{a.ai_rationale&&<p className="mt-2 text-sm text-slate-600"><b>AI comments:</b> {a.ai_rationale}</p>}{a.ai_scored_at&&<p className="mt-2 text-xs text-slate-400">AI reviewed {new Date(a.ai_scored_at).toLocaleString()}</p>}</article>)}</div></section>
  </div></main>;
}
