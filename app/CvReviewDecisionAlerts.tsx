"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function CvReviewDecisionAlerts(){
  const pathname=usePathname();
  const supabase=useMemo(()=>createClient(),[]);
  const[rows,setRows]=useState<DecisionRow[]>([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    if(pathname!=="/"){setLoading(false);return;}
    void load();
  },[pathname]);

  async function load(){
    setLoading(true);
    const{data,error}=await supabase
      .from("client_submission_candidates")
      .select("id,cv_decision,cv_comment,reviewed_at,candidate_applications(candidate_name),client_submissions(recruitment_clients(company_name),jobs(title))")
      .in("cv_decision",["hold","do_not_interview"])
      .order("reviewed_at",{ascending:false})
      .limit(12);
    if(!error)setRows((data||[]) as unknown as DecisionRow[]);
    setLoading(false);
  }

  if(pathname!=="/"||loading||rows.length===0)return null;

  const holds=rows.filter(r=>r.cv_decision==="hold").length;
  const declined=rows.filter(r=>r.cv_decision==="do_not_interview").length;

  return <aside className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-2xl border-2 border-[#c89a4b]/55 bg-white p-4 shadow-2xl">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Client CV decisions</p>
        <h2 className="mt-1 text-lg font-extrabold text-[#0b2239]">Review decisions received ({rows.length})</h2>
        <p className="mt-1 text-xs text-[#667085]">{holds} on hold · {declined} do not interview</p>
      </div>
      <Link href="/client-submissions" className="shrink-0 rounded-lg bg-[#0b2239] px-3 py-2 text-xs font-bold text-white">Open</Link>
    </div>
    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
      {rows.map(r=><div key={r.id} className="rounded-xl border bg-[#fff9ec] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-[#0b2239]">{r.candidate_applications?.candidate_name||"Candidate"}</p>
            <p className="text-xs text-[#667085]">{r.client_submissions?.recruitment_clients?.company_name||"Client"} · {r.client_submissions?.jobs?.title||"Role"}</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase text-[#0b2239]">{r.cv_decision==="hold"?"Hold":"Do not interview"}</span>
        </div>
        {r.cv_comment&&<p className="mt-2 text-xs text-[#344054]">“{r.cv_comment}”</p>}
      </div>)}
    </div>
  </aside>;
}
