"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState("");
const [saving, setSaving] = useState(false);

  const [jobTitle, setJobTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState(0);
  const [jobDescription, setJobDescription] = useState("");
  const [mandatoryRequirements, setMandatoryRequirements] = useState("");
  const [preferredRequirements, setPreferredRequirements] = useState("");
  const [closingDate, setClosingDate] = useState("");

 async function handleSaveJob(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setSaving(true);
  setMessage("");

  const { error } = await supabase.from("jobs").insert({
    title: jobTitle,
    client_company: clientName,
    location,
    minimum_experience: minExperience ? Number(minExperience) : null,
    job_description: jobDescription,
    mandatory_requirements: mandatoryRequirements,
    preferred_requirements: preferredRequirements,
    closing_date: closingDate || null,
    status: "open",
  });

  if (error) {
    setMessage(error.message);
    setSaving(false);
    return;
  }

  router.push("/");
  router.refresh();
}
      
  

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Create a new job
            </h1>
            <p className="text-sm text-slate-500">
              Add the job details and matching requirements.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <form
  onSubmit={handleSaveJob}
  className="space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Job title
              </label>
              <input
                type="text"
                placeholder="Senior Quantity Surveyor"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Client or company
              </label>
              <input
                type="text"
                placeholder="Client name"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Location
              </label>
              <input
                type="text"
                placeholder="London, Hybrid or Remote"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Minimum experience
              </label>
              <input
                type="number"
                min="0"
                placeholder="5"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Job description
            </label>
            <textarea
              rows={10}
              placeholder="Paste the full job description here..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Mandatory requirements
            </label>
            <textarea
              rows={5}
              placeholder="Example: UK quantity surveying experience, JCT knowledge, relevant degree..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Preferred requirements
            </label>
            <textarea
              rows={5}
              placeholder="Example: NEC experience, healthcare projects, RICS membership..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Closing date
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600 md:w-72"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            {message && (
  <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
    {message}
  </p>
)}

           <button
  type="submit"
  disabled={saving}
  className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
>
  {saving ? "Saving..." : "Save job"}
</button>
          </div>
        </form>
      </div>
    </main>
  );
}