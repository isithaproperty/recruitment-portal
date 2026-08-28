import Link from "next/link";

const stats = [
  { label: "Open jobs", value: "0" },
  { label: "Candidates", value: "0" },
  { label: "CVs processing", value: "0" },
  { label: "Shortlisted", value: "0" },
];

export default function Home() {
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
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{stats.map((stat)=><div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-3 text-4xl font-bold text-slate-900">{stat.value}</p></div>)}</section>
        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"><div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold text-slate-900">Current jobs</h3><p className="mt-1 text-sm text-slate-500">Jobs created in the recruitment portal</p></div></div><div className="mt-8 rounded-lg border-2 border-dashed border-slate-300 px-6 py-14 text-center"><h4 className="font-semibold text-slate-900">Your recruitment workflow</h4><p className="mt-2 text-sm text-slate-500">Create a job, share its application link, review AI scoring with full candidate details, then move approved candidates to the Client CV Builder.</p><Link href="/jobs/new" className="mt-5 inline-block rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Create job</Link></div></div>
          <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold text-slate-900">Quick actions</h3><div className="mt-6 space-y-3"><Link href="/jobs/new" className="block w-full rounded-lg bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-700">Create a new job</Link><Link href="/client-cvs" className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Open Client CV Builder</Link></div></aside>
        </section>
      </div>
    </main>
  );
}
