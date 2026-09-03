"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ISITHA_LOGO_DATA_URI } from "@/lib/brand";

type Job={id:string;title:string;client_company:string|null;location:string|null;status:string;created_at:string};
type DashboardStats={openJobs:number;candidates:number;cvsProcessing:number;shortlisted:number};
type InterviewRequest={id:string;interview_status:string;interview_scheduled_at:string|null;candidate_applications:{candidate_name:string}|null;client_submissions:{id:string;recruitment_clients:{company_name:string}|null;jobs:{title:string}|null}|null};

export default function Home(){
 const supabase=useMemo(()=>createClient(),[]);
 const[jobs,setJobs]=useState<Job[]>([]);
 const[stats,setStats]=useState<DashboardStats>({openJobs:0,candidates:0,cvsProcessing:0,shortlisted:0});
 const[interviewRequests,setInterviewRequests]=useState<InterviewRequest[]>([]);
 const[loading,setLoading]=useState(true);
 const[message,setMessage]=useState("");
 useEffect(()=>{void loadDashboard()},[]);
 async function loadDashboard(){
  setLoading(true);setMessage("");
  const[jobsResult,candidatesResult,cvsResult,shortlistedResult,interviewsResult]=await Promise.all([
   supabase.from("jobs").select("id,title,client_company,location,status,created_at").order("created_at",{ascending:false}),
   supabase.from("candidate_applications").select("id",{count:"exact",head:true}),
   supabase.from("candidate_applications").select("id",{count:"exact",head:true}).in("status",["client_cv","client_cv_ready"]),
   supabase.from("candidate_applications").select("id",{count:"exact",head:true}).not("match_score","is",null),
   supabase.from("client_submission_candidates").select("id,interview_status,interview_scheduled_at,candidate_applications(candidate_name),client_submissions(id,recruitment_clients(company_name),jobs(title))").in("interview_status",["requested","scheduled"]).order("created_at",{ascending:false})
  ]);
  if(jobsResult.error||candidatesResult.error||cvsResult.error||shortlistedResult.error||interviewsResult.error)setMessage("Some dashboard information could not be loaded. Please refresh or sign in again.");
  const liveJobs=(jobsResult.data||[]) as Job[];
  setJobs(liveJobs);
  setInterviewRequests((interviewsResult.data||[]) as unknown as InterviewRequest[]);
  setStats({openJobs:liveJobs.filter(j=>j.status==="open").length,candidates:candidatesResult.count||0,cvsProcessing:cvsResult.count||0,shortlisted:shortlistedResult.count||0});
  setLoading(false)
 }
 const statCards=[{label:"Open jobs",value:stats.openJobs},{label:"Candidates",value:stats.candidates},{label:"CVs processing",value:stats.cvsProcessing},{label:"AI reviewed",value:stats.shortlisted}];
 return <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(200,154,75,.08),transparent_28rem)] bg-[#f4f6f8] text-[#172536]"><div className="mx-auto max-w-7xl px-5 pb-14 pt-5 sm:px-6">
  <header className="flex min-h-[86px] flex-col gap-4 border-b-2 border-[#c89a4b]/45 py-3 sm:flex-row sm:items-center sm:justify-between"><Link href="/" className="flex items-center gap-5"><img src={ISITHA_LOGO_DATA_URI} alt="Isitha Global" className="h-auto w-[190px] max-w-[48vw]"/><div className="border-l border-[#dfe5eb] pl-5"><strong className="block text-sm uppercase tracking-[.06em] text-[#0b2239]">Recruitment Portal</strong><span className="text-xs text-[#667085]">Candidate & CV Management</span></div></Link><nav className="flex flex-wrap gap-2"><Link href="/candidates/upload" className="rounded-lg border border-[#c89a4b] bg-[#f3ead8] px-4 py-2.5 text-sm font-bold text-[#0b2239]">Upload emailed CV</Link><Link href="/client-cvs" className="rounded-lg border border-[#aebbc7] bg-white px-4 py-2.5 text-sm font-bold text-[#0b2239]">Client CV Builder</Link><Link href="/client-submissions" className="rounded-lg border border-[#aebbc7] bg-white px-4 py-2.5 text-sm font-bold text-[#0b2239]">Client Submissions</Link><Link href="/jobs/new" className="rounded-lg bg-[#0b2239] px-4 py-2.5 text-sm font-bold text-white">Create job</Link></nav></header>
  <section className="py-9"><span className="inline-block rounded-full border border-[#c89a4b]/30 bg-[#f3ead8] px-3 py-1 text-xs font-extrabold text-[#0b2239]">Recruitment Dashboard</span><h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#0b2239] sm:text-5xl">Candidate management</h1><p className="mt-3 max-w-3xl text-[#667085]">Manage vacancies, review AI-assisted candidate matches and prepare approved, redacted CVs for clients.</p></section>
  {message&&<p className="mb-5 rounded-xl border border-[#c89a4b]/35 bg-[#f3ead8] px-4 py-3 text-sm font-semibold">{message}</p>}
  <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{statCards.map(stat=><div key={stat.label} className="rounded-2xl border border-[#dfe5eb] bg-white p-6 shadow-sm"><p className="text-sm text-[#667085]">{stat.label}</p><p className="mt-3 text-4xl font-extrabold text-[#0b2239]">{loading?"…":stat.value}</p></div>)}</section>
  {!loading&&interviewRequests.length>0&&<section className="mt-7 rounded-2xl border-2 border-[#c89a4b]/55 bg-[#fff9ec] p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#a88436]">Action required</p><h2 className="mt-1 text-2xl font-extrabold text-[#0b2239]">Interview requests ({interviewRequests.filter(r=>r.interview_status==='requested').length})</h2><p className="mt-1 text-sm text-[#667085]">Clients have selected these candidates for interview. Click a candidate to arrange that interview directly.</p></div><Link href="/client-submissions" className="rounded-lg bg-[#0b2239] px-5 py-3 text-sm font-bold text-white">All client submissions</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2">{interviewRequests.map(r=><Link key={r.id} href={`/interviews/${r.id}`} className="rounded-xl border bg-white p-4 transition hover:border-[#c89a4b]"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{r.candidate_applications?.candidate_name||"Candidate"}</p><p className="mt-1 text-sm text-[#667085]">{r.client_submissions?.recruitment_clients?.company_name||"Client"} · {r.client_submissions?.jobs?.title||"Role"}</p><p className="mt-2 text-xs font-bold text-[#0b2239]">Open interview →</p></div><span className="rounded-full bg-[#f3ead8] px-3 py-1 text-xs font-bold uppercase text-[#0b2239]">{r.interview_status.replaceAll('_',' ')}</span></div>{r.interview_scheduled_at&&<p className="mt-2 text-sm font-semibold">{new Date(r.interview_scheduled_at).toLocaleString()}</p>}</Link>)}</div></section>}
  <section className="mt-7 grid gap-6 lg:grid-cols-3"><div className="rounded-2xl border border-[#dfe5eb] bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-xl font-bold text-[#0b2239]">Current jobs</h2><p className="mt-1 text-sm text-[#667085]">Jobs created in the recruitment portal</p><div className="mt-6 space-y-3">{loading?<p>Loading jobs...</p>:jobs.map(job=><Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between rounded-xl border border-[#dfe5eb] px-4 py-4"><div><p className="font-bold">{job.title}</p><p className="text-sm text-[#667085]">{job.client_company||"No client"} · {job.location||"No location"}</p></div><span className="text-xs font-bold uppercase">{job.status}</span></Link>)}</div></div><aside className="rounded-2xl border border-[#dfe5eb] bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Quick actions</h2><div className="mt-6 space-y-3"><Link href="/jobs/new" className="block rounded-lg bg-[#0b2239] px-4 py-3 text-sm font-bold text-white">Create a new job</Link><Link href="/candidates/upload" className="block rounded-lg border border-[#c89a4b] bg-[#f3ead8] px-4 py-3 text-sm font-bold">Upload emailed CV</Link><Link href="/client-cvs" className="block rounded-lg border px-4 py-3 text-sm font-bold">Open Client CV Builder</Link><Link href="/client-submissions" className="block rounded-lg border px-4 py-3 text-sm font-bold">Client Submissions & Feedback</Link></div></aside></section>
  <footer className="mt-10 border-t pt-5 text-sm text-[#667085]">Isitha Global · Global Professionals. Real Results</footer>
 </div></main>;
}
