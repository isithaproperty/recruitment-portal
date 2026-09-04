"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ISITHA_LOGO_DATA_URI } from "@/lib/brand";

type DecisionRow={
  id:string;
  cv_decision:string;
  cv_comment:string|null;
  reviewed_at:string|null;
  candidate_applications:{candidate_name:string}|null;
  client_submissions:{
    recruitment_clients:{company_name:string}|null;
    jobs:{title:string}|null;
  }|null;
};

export default function CvDecisionsPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const[rows,setRows]=useState<DecisionRow[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");

  useEffect(()=>{void load()},[]);

  async function load(){
    setLoading(true);setError("");
    const{data,error}=await supabase
      .from("client_submission_candidates")
      .select("id,cv_decision,cv_comment,reviewed_at,candidate_applications(candidate_name),client_submissions(recruitment_clients(company_name),jobs(title))")
      .in("cv_decision",["hold","do_not_interview"])
      .order("reviewed_at",{ascending:false});
    if(error)setError(error.message);
    else setRows((data||[]) as unknown as DecisionRow[]);
    setLoading(false);
  }

  const holds=rows.filter(r=>r.cv_decision==="hold");
  const declined=rows.filter(r=>r.cv_decision==="do_not_interview");

  return <main className="min-h-screen bg-[#f4f6f8] text-[#172536]"><div className="mx-auto max-w-5xl px-5 py-7">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#c89a4b]/45 pb-5"><Link href="/"><img src={ISITHA_LOGO_DATA_URI} alt="Isitha Global" className="w-[190px]"/></Link><Link href="/" className="rounded-lg bg-[#0b2239] px-4 py-2 text-sm font-bold text-white">Back to dashboard</Link></header>
    <section className="py-8"><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Client CV decisions</p><h1 className="mt-2 text-3xl font-extrabold text-[#0b2239]">Hold & do-not-interview decisions</h1><p className="mt-2 text-[#667085]">These candidates are removed from the client's active review flow, but their decision and comments remain here for Isitha's record.</p></section>
    {error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold">{error}</div>}
    {loading?<p>Loading decisions…</p>:rows.length===0?<div className="rounded-2xl border bg-white p-6 shadow-sm">No hold or do-not-interview decisions yet.</div>:<div className="space-y-8">
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Hold</p><h2 className="mt-1 text-2xl font-extrabold">On hold ({holds.length})</h2></div></div><div className="mt-5 space-y-3">{holds.length===0?<p className="text-sm text-[#667085]">No candidates on hold.</p>:holds.map(r=><DecisionCard key={r.id} row={r}/>)}</div></section>
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Do not interview</p><h2 className="mt-1 text-2xl font-extrabold">Declined after CV review ({declined.length})</h2></div><div className="mt-5 space-y-3">{declined.length===0?<p className="text-sm text-[#667085]">No declined candidates.</p>:declined.map(r=><DecisionCard key={r.id} row={r}/>)}</div></section>
    </div>}
  </div></main>;
}

function DecisionCard({row}:{row:DecisionRow}){
  return <div className="rounded-xl border bg-[#fff9ec] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-extrabold text-[#0b2239]">{row.candidate_applications?.candidate_name||"Candidate"}</p><p className="mt-1 text-sm text-[#667085]">{row.client_submissions?.recruitment_clients?.company_name||"Client"} · {row.client_submissions?.jobs?.title||"Role"}</p>{row.reviewed_at&&<p className="mt-1 text-xs text-[#98a2b3]">Reviewed {new Date(row.reviewed_at).toLocaleString()}</p>}</div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-[#0b2239]">{row.cv_decision==="hold"?"Hold":"Do not interview"}</span></div>{row.cv_comment?<div className="mt-4 rounded-lg bg-white p-3"><p className="text-xs font-bold uppercase text-[#667085]">Client comment</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.cv_comment}</p></div>:<p className="mt-3 text-sm text-[#98a2b3]">No client comment supplied.</p>}</div>;
}
