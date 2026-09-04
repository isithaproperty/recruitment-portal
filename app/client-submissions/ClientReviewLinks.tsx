"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LinkRow={id:string;review_token:string;status:string;created_at:string;client_id:string;job_id:string|null};
type Client={id:string;company_name:string};
type Job={id:string;title:string};

export default function ClientReviewLinks(){
 const supabase=useMemo(()=>createClient(),[]);
 const[rows,setRows]=useState<LinkRow[]>([]);const[clients,setClients]=useState<Client[]>([]);const[jobs,setJobs]=useState<Job[]>([]);const[copied,setCopied]=useState("");
 useEffect(()=>{void load()},[]);
 async function load(){
  const[s,c,j]=await Promise.all([
   supabase.from("client_submissions").select("id,review_token,status,created_at,client_id,job_id").order("created_at",{ascending:false}),
   supabase.from("recruitment_clients").select("id,company_name"),
   supabase.from("jobs").select("id,title")
  ]);
  if(!s.error)setRows((s.data||[]) as LinkRow[]);if(!c.error)setClients((c.data||[]) as Client[]);if(!j.error)setJobs((j.data||[]) as Job[]);
 }
 function clientName(id:string){return clients.find(c=>c.id===id)?.company_name||"Client"}
 function jobName(id:string|null){return jobs.find(j=>j.id===id)?.title||"Role"}
 function url(token:string){return `${window.location.origin}/client-review/${token}`}
 async function copy(token:string,id:string){await navigator.clipboard.writeText(url(token));setCopied(id);setTimeout(()=>setCopied(""),1600)}
 if(rows.length===0)return null;
 return <section className="mx-auto mt-6 max-w-7xl px-5"><div className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Client review links</p><h2 className="mt-1 text-xl font-extrabold text-[#0b2239]">Live private client pages</h2><p className="mt-1 text-sm text-[#667085]">Use these links to reopen or resend a client's existing review page. The same link remains live through later interview rounds.</p></div><span className="rounded-full bg-[#f3ead8] px-3 py-1 text-xs font-bold">{rows.length} link{rows.length===1?"":"s"}</span></div><div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-1">{rows.map(r=><div key={r.id} className="flex flex-col gap-3 rounded-xl border bg-[#fff9ec] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold text-[#0b2239]">{clientName(r.client_id)}</p><p className="text-sm text-[#667085]">{jobName(r.job_id)} · {r.status}</p><p className="mt-1 text-xs text-[#98a2b3]">Created {new Date(r.created_at).toLocaleString()}</p></div><div className="flex gap-2"><a href={`/client-review/${r.review_token}`} target="_blank" rel="noreferrer" className="rounded-lg bg-[#0b2239] px-4 py-2 text-sm font-bold text-white">Open</a><button onClick={()=>void copy(r.review_token,r.id)} className="rounded-lg border border-[#c89a4b] bg-white px-4 py-2 text-sm font-bold text-[#0b2239]">{copied===r.id?"Copied":"Copy link"}</button></div></div>)}</div></div></section>
}
