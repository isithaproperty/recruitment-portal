"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Job={id:string;title:string;client_company:string|null;location:string|null;job_description:string|null;mandatory_requirements:string|null;preferred_requirements:string|null;public_slug:string|null;status:string};
type Application={id:string;candidate_name:string;email:string;location:string|null;status:string;match_score:number|null;strengths:string|null;weaknesses:string|null;created_at:string};

export default function JobPage(){
  const params=useParams<{id:string}>();
  const supabase=createClient();
  const[job,setJob]=useState<Job|null>(null);const[apps,setApps]=useState<Application[]>([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{void load()},[params.id]);
  async function load(){
    const[{data:j},{data:a}]=await Promise.all([
      supabase.from("jobs").select("id,title,client_company,location,job_description,mandatory_requirements,preferred_requirements,public_slug,status").eq("id",params.id).single(),
      supabase.from("candidate_applications").select("id,candidate_name,email,location,status,match_score,strengths,weaknesses,created_at").eq("job_id",params.id).order("match_score",{ascending:false,nullsFirst:false})
    ]);
    setJob(j as Job|null);setApps((a||[]) as Application[]);setLoading(false);
  }
  if(loading)return <main className="min-h-screen bg-slate-100 p-8">Loading...</main>;
  if(!job)return <main className="min-h-screen bg-slate-100 p-8">Job not found.</main>;
  const applyPath=job.public_slug?`/apply/${job.public_slug}`:"";
  return <main className="min-h-screen bg-slate-100"><div className="mx-auto max-w-6xl px-6 py-8">
    <Link href="/">← Dashboard</Link><div className="mt-5 rounded-xl bg-white p-7 shadow-sm"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase">{job.status}</span><h1 className="mt-3 text-3xl font-bold">{job.title}</h1><p className="mt-2 text-slate-600">{job.client_company} · {job.location}</p>
    {applyPath&&<div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">Public application link</p><div className="mt-2 flex flex-wrap gap-2"><code className="rounded bg-white px-3 py-2 text-sm">{applyPath}</code><button className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={()=>navigator.clipboard.writeText(`${window.location.origin}${applyPath}`)}>Copy link</button><Link className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold" href={applyPath} target="_blank">Open</Link></div></div>}</div>
    <section className="mt-6 rounded-xl bg-white p-7 shadow-sm"><div className="flex items-end justify-between"><div><h2 className="text-2xl font-bold">Candidate shortlist</h2><p className="text-sm text-slate-500">Candidates will be ranked by job-related evidence only.</p></div><span className="text-sm font-semibold">{apps.length} applications</span></div>
    <div className="mt-5 space-y-4">{apps.length===0?<p className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-slate-500">No applications yet.</p>:apps.map(a=><article key={a.id} className="rounded-lg border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{a.candidate_name}</h3><p className="text-sm text-slate-500">{a.location||"Location not supplied"}</p></div><strong className="text-xl">{a.match_score==null?"Awaiting score":`${a.match_score}%`}</strong></div>{a.strengths&&<p className="mt-3 text-sm"><b>Strengths:</b> {a.strengths}</p>}{a.weaknesses&&<p className="mt-2 text-sm"><b>Weaknesses:</b> {a.weaknesses}</p>}</article>)}</div></section>
  </div></main>;
}
