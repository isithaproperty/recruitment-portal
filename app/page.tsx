"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Job = {
  id: string;
  title: string;
  client_company: string | null;
  location: string | null;
  status: string;
  created_at: string;
};

type DashboardStats = {
  openJobs: number;
  candidates: number;
  cvsProcessing: number;
  shortlisted: number;
};

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ openJobs: 0, candidates: 0, cvsProcessing: 0, shortlisted: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    const [jobsResult, candidatesResult, cvsResult, shortlistedResult] = await Promise.all([
      supabase.from("jobs").select("id,title,client_company,location,status,created_at").order("created_at", { ascending: false }),
      supabase.from("candidate_applications").select("id", { count: "exact", head: true }),
      supabase.from("candidate_applications").select("id", { count: "exact", head: true }).in("status", ["client_cv", "client_cv_ready"]),
      supabase.from("candidate_applications").select("id", { count: "exact", head: true }).not("match_score", "is", null),
    ]);

    if (jobsResult.error || candidatesResult.error || cvsResult.error || shortlistedResult.error) {
      setMessage("Some dashboard information could not be loaded. Please refresh or sign in again.");
    }

    const liveJobs = (jobsResult.data || []) as Job[];
    setJobs(liveJobs);
    setStats({
      openJobs: liveJobs.filter(job => job.status === "open").length,
      candidates: candidatesResult.count || 0,
      cvsProcessing: cvsResult.count || 0,
      shortlisted: shortlistedResult.count || 0,
    });
    setLoading(false);
  }

  const statCards = [
    { label: "Open jobs", value: stats.openJobs },
    { label: "Candidates", value: stats.candidates },
    { label: "CVs processing", value: stats.cvsProcessing },
    { label: "AI reviewed", value: stats.shortlisted },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Isitha Recruitment</h1>
            <p className="text-sm text-slate-500">Candidate and CV matching portal</p>
          </div>
          <div className="flex gap-3">
            <Link href="/client-cvs" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Client CV Builder</Link>
            <Link href="/jobs/new" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Create job</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <section><h2 className="text-3xl font-bold text-slate-900">Dashboard</h2><p className="mt-2 text-slate-600">Manage jobs, review AI candidate matches and prepare approved CVs for clients.</p></section>
        {message && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>}
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{statCards.map((stat)=><div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-3 text-4xl font-bold text-slate-900">{loading ? "…" : stat.value}</p></div>)}</section>
        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold text-slate-900">Current jobs</h3><p className="mt-1 text-sm text-slate-500">Jobs created in the recruitment portal</p></div></div>
            <div className="mt-6 space-y-3">
              {loading ? <p className="py-10 text-center text-slate-500">Loading jobs...</p> : jobs.length === 0 ? <div className="rounded-lg border-2 border-dashed border-slate-300 px-6 py-14 text-center"><h4 className="font-semibold text-slate-900">Your recruitment workflow</h4><p className="mt-2 text-sm text-slate-500">Create a job, share its application link, review AI scoring with full candidate details, then move approved candidates to the Client CV Builder.</p><Link href="/jobs/new" className="mt-5 inline-block rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Create job</Link></div> : jobs.map(job => <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-4 hover:bg-slate-50"><div><p className="font-semibold text-slate-900">{job.title}</p><p className="mt-1 text-sm text-slate-500">{job.client_company || "No client"} · {job.location || "No location"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">{job.status}</span></Link>)}
            </div>
          </div>
          <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold text-slate-900">Quick actions</h3><div className="mt-6 space-y-3"><Link href="/jobs/new" className="block w-full rounded-lg bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-700">Create a new job</Link><Link href="/client-cvs" className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Open Client CV Builder</Link></div></aside>
        </section>
      </div>
    </main>
  );
}
