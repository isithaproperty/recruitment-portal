"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ISITHA_LOGO_DATA_URI } from "@/lib/brand";

type DecisionRow={
  id:string;
  submission_id:string;
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
  const[busyId,setBusyId]=useState<string|null>(null);

  useEffect(()=>{void load()},[]);

  async function load(){
    setLoading(true);setError("");
    const{data,error}=await supabase
      .from("client_submission_candidates")
      .select("id,submission_id,cv_decision,cv_comment,reviewed_at,candidate_applications(candidate_name),client_submissions(recruitment_clients(company_name),jobs(title))")
      .in("cv_decision",["hold","do_not_interview"])
      .order("reviewed_at",{ascending:false});
    if(error)setError(error.message);
    else setRows((data||[]) as unknown as DecisionRow[]);
    setLoading(false);
  }

  async function deleteDecision(row:DecisionRow){
    const candidate=row.candidate_applications?.candidate_name||"this candidate";
    if(!window.confirm(`Delete ${candidate}'s client-review record? This removes the review/submission record and any linked interview feedback, but keeps the original candidate and CV.`))return;
    setBusyId(row.id);setError("");
    const{error:deleteError}=await supabase.from("client_submission_candidates").delete().eq("id",row.id);
    if(deleteError){setBusyId(null);setError(deleteError.message);return;}
    const{count,error:countError}=await supabase.from("client_submission_candidates").select("id",{count:"exact",head:true}).eq("submission_id",row.submission_id);
    if(!countError&&(count||0)===0){
      const{error:submissionError}=await supabase.from("client_submissions").delete().eq("id",row.submission_id);
      if(submissionError){setBusyId(null);setError(`Review removed, but the empty submission could not be removed: ${submissionError.message}`);await load();return;}
    }
    setRows(current=>current.filter(item=>item.id!==row.id));
    setBusyId(null);
  }

  const holds=rows.filter(r=>r.cv_decision==="hold");
  const declined=rows.filter(r=>r.cv_decision==="do_not_interview");

  return <main className="min-h-screen bg-[#f4f6f8] text-[#172536]"><div className="mx-auto max-w-5xl px-5 py-7">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#c89a4b]/45 pb-5"><Link href="/"><img src={ISITHA_LOGO_DATA_URI} alt="Isitha Global" className="w-[190px]"/></Link><Link href="/" className="rounded-lg bg-[#0b2239] px-4 py-2 text-sm font-bold text-white">Back to dashboard</Link></header>
    <section className="py-8"><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Client CV decisions</p><h1 className="mt-2 text-3xl font-extrabold text-[#0b2239]">Hold & do-not-interview decisions</h1><p className="mt-2 text-[#667085]">These candidates are removed from the client's active review flow. You can retain the decision for reference or delete the client-review record once it has been dealt with. The original candidate and CV remain in recruitment.</p></section>
    {error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold">{error}</div>}
    {loading?<p>Loading decisions…</p>:rows.length===0?<div className="rounded-2xl border bg-white p-6 shadow-sm">No hold or do-not-interview decisions yet.</div>:<div className="space-y-8">
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Hold</p><h2 className="mt-1 text-2xl font-extrabold">On hold ({holds.length})</h2></div></div><div className="mt-5 space-y-3">{holds.length===0?<p className="text-sm text-[#667085]">No candidates on hold.</p>:holds.map(r=><DecisionCard key={r.id} row={r} busy={busyId===r.id} onDelete={deleteDecision}/>)}</div></section>
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Do not interview</p><h2 className="mt-1 text-2xl font-extrabold">Declined after CV review ({declined.length})</h2></div><div className="mt-5 space-y-3">{declined.length===0?<p className="text-sm text-[#667085]">No declined candidates.</p>:declined.map(r=><DecisionCard key={r.id} row={r} busy={busyId===r.id} onDelete={deleteDecision}/>)}</div></section>
    </div>}
  </div></main>;
}

function DecisionCard({row,busy,onDelete}:{row:DecisionRow;busy:boolean;onDelete:(row:DecisionRow)=>Promise<void>}){
  return <div className="rounded-xl border bg-[#fff9ec] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-extrabold text-[#0b2239]">{row.candidate_applications?.candidate_name||"Candidate"}</p><p className="mt-1 text-sm text-[#667085]">{row.client_submissions?.recruitment_clients?.company_name||"Client"} · {row.client_submissions?.jobs?.title||"Role"}</p>{row.reviewed_at&&<p className="mt-1 text-xs text-[#98a2b3]">Reviewed {new Date(row.reviewed_at).toLocaleString()}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-[#0b2239]">{row.cv_decision==="hold"?"Hold":"Do not interview"}</span><button disabled={busy} onClick={()=>void onDelete(row)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">{busy?"Deleting…":"Delete"}</button></div></div>{row.cv_comment?<div className="mt-4 rounded-lg bg-white p-3"><p className="text-xs font-bold uppercase text-[#667085]">Client comment</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.cv_comment}</p></div>:<p className="mt-3 text-sm text-[#98a2b3]">No client comment supplied.</p>}</div>;
}
